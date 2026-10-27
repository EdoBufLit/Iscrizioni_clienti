"""Credential races on disposable PostgreSQL; run with --noconftest.

Only APP_ENV=test and the explicitly named stock_tests database are accepted.
Every test owns a UUID schema, without startup, provider calls or migrations.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
import os
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker


_TEST_URL = make_url(os.getenv("DATABASE_URL", "sqlite://"))
if (
    os.getenv("APP_ENV", "").lower() != "test"
    or _TEST_URL.get_backend_name() != "postgresql"
    or _TEST_URL.database != "stock_tests"
):
    pytest.skip("Requires APP_ENV=test, PostgreSQL database=stock_tests and --noconftest.", allow_module_level=True)

from fastapi import HTTPException

from app.db import Base
from app.models import Member, MemberStatus, Organization, TokenType
from app.services.member_sessions import consume_member_auth_token, issue_member_auth_token, replace_member_password


@pytest.fixture
def auth_db():
    schema = f"member_auth_{uuid4().hex}"
    control = create_engine(_TEST_URL)
    engine = None
    try:
        with control.begin() as connection:
            assert connection.execute(text("SELECT current_database()")).scalar_one() == "stock_tests"
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        engine = create_engine(_TEST_URL, connect_args={
            "options": f"-csearch_path={schema} -clock_timeout=10000 -cstatement_timeout=15000",
        })
        Base.metadata.create_all(engine)
        sessions = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        with sessions() as db:
            org = Organization(name="Auth race", slug=f"auth-{uuid4().hex}", is_active=True)
            db.add(org)
            db.flush()
            member = Member(org_id=org.id, status=MemberStatus.ACTIVE, card_no=99101,
                            card_year=datetime.utcnow().year, password_hash="initial")
            db.add(member)
            db.commit()
            member_id = member.id
        yield sessions, member_id
    finally:
        if engine is not None:
            engine.dispose()
        with control.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        control.dispose()


@pytest.mark.parametrize("actions", [("reset", "reset"), ("reset", "change"), ("change", "change")])
def test_concurrent_credential_changes_have_one_winner_and_no_stale_authority(auth_db, actions):
    sessions, member_id = auth_db
    raw_proofs = []
    with sessions() as db:
        member = db.get(Member, member_id)
        for _ in actions:
            raw, _proof = issue_member_auth_token(db, member=member, purpose=TokenType.PASSWORD_RESET,
                                                 expires_at=datetime.utcnow() + timedelta(minutes=5))
            raw_proofs.append(raw)
        db.commit()
    barrier = Barrier(2)

    def attempt(index):
        with sessions() as db:
            # Both HTTP-equivalent callers observed epoch 1 before either write.
            original = db.get(Member, member_id)
            assert original.auth_version == 1
            barrier.wait(timeout=10)
            try:
                if actions[index] == "reset":
                    proved = consume_member_auth_token(db, raw_token=raw_proofs[index],
                                                       purpose=TokenType.PASSWORD_RESET)
                    if proved is None:
                        db.rollback()
                        return False
                replace_member_password(db=db, member_id=member_id, expected_version=1,
                                        password_hash=f"winner-{index}")
                db.commit()
                return True
            except HTTPException as exc:
                db.rollback()
                assert exc.status_code == 401
                return False

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(attempt, range(2)))
    assert sum(outcomes) == 1
    with sessions() as db:
        member = db.get(Member, member_id)
        assert member.auth_version == 2
        assert member.password_hash == f"winner-{outcomes.index(True)}"
        for raw in raw_proofs:
            assert consume_member_auth_token(db, raw_token=raw, purpose=TokenType.PASSWORD_RESET) is None
