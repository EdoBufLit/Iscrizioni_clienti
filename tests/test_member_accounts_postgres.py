"""Account credential/ownership races on disposable PostgreSQL (--noconftest).

Only APP_ENV=test and the explicitly named stock_tests database are accepted.
Each test creates and removes its own UUID schema, without app startup.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import os
from threading import Barrier, Event
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker


_TEST_URL = make_url(os.getenv("DATABASE_URL", "sqlite://"))
if (os.getenv("APP_ENV", "").lower() != "test" or _TEST_URL.get_backend_name() != "postgresql"
        or _TEST_URL.database != "stock_tests"):
    pytest.skip("Requires APP_ENV=test, PostgreSQL database=stock_tests and --noconftest.", allow_module_level=True)

from fastapi import HTTPException

from app.db import Base
from app.models import Member, MemberAccount, MemberStatus, Organization
from app.services.member_accounts import link_member_to_account
from app.services.member_sessions import replace_member_password


@pytest.fixture
def personal_accounts_db():
    schema = f"personal_accounts_{uuid4().hex}"
    control = create_engine(_TEST_URL)
    engine = None
    try:
        with control.begin() as connection:
            assert connection.execute(text("SELECT current_database()")).scalar_one() == "stock_tests"
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        engine = create_engine(_TEST_URL, connect_args={"options": f"-csearch_path={schema} -clock_timeout=10000 -cstatement_timeout=15000"})
        Base.metadata.create_all(engine)
        sessions = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        with sessions() as db:
            account_a = MemberAccount(email="person-a@example.test", password_hash="initial-a")
            account_b = MemberAccount(email="person-b@example.test", password_hash="initial-b")
            db.add_all([account_a, account_b])
            db.flush()
            members = []
            for index in range(3):
                org = Organization(name=f"Club {index}", slug=f"race-{index}-{uuid4().hex}", is_active=True)
                db.add(org)
                db.flush()
                member = Member(org_id=org.id, email=f"member-{index}@example.test", status=MemberStatus.ACTIVE,
                                account_id=account_a.id if index < 2 else None,
                                password_hash="initial-a" if index < 2 else "target",
                                card_no=99200 + index, card_year=datetime.utcnow().year)
                db.add(member)
                db.flush()
                members.append(member.id)
            db.commit()
            ids = {"accounts": (account_a.id, account_b.id), "members": members}
        yield sessions, ids
    finally:
        if engine is not None:
            engine.dispose()
        with control.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        control.dispose()


def test_different_clubs_cannot_simultaneously_rotate_the_same_account(personal_accounts_db):
    sessions, ids = personal_accounts_db
    barrier = Barrier(2)

    def attempt(index):
        with sessions() as db:
            member = db.get(Member, ids["members"][index])
            epoch = member.auth_version
            assert epoch == 1
            barrier.wait(timeout=10)
            try:
                replace_member_password(db, member_id=member.id, expected_version=epoch, password_hash=f"winner-{index}")
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
        account = db.get(MemberAccount, ids["accounts"][0])
        assert account.auth_version == 2
        assert account.password_hash == f"winner-{outcomes.index(True)}"
        for member_id in ids["members"][:2]:
            member = db.get(Member, member_id)
            assert member.auth_version == 2
            assert member.password_hash == account.password_hash


def test_link_and_password_change_have_one_winner_for_the_same_account_epoch(personal_accounts_db):
    sessions, ids = personal_accounts_db
    barrier = Barrier(2)

    def attempt(action):
        with sessions() as db:
            account = db.get(MemberAccount, ids["accounts"][0])
            member = db.get(Member, ids["members"][0] if action == "password" else ids["members"][2])
            epoch = account.auth_version
            member_epoch = member.auth_version
            barrier.wait(timeout=10)
            try:
                if action == "password":
                    replace_member_password(db, member_id=member.id, expected_version=member_epoch,
                                            expected_account_version=epoch, password_hash="reset-winner")
                else:
                    link_member_to_account(db, account=account, member=member, trusted=True, expected_account_version=epoch)
                db.commit()
                return True
            except HTTPException as exc:
                db.rollback()
                assert exc.status_code in (401, 409)
                return False

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(attempt, ("password", "link")))
    assert sum(outcomes) == 1
    with sessions() as db:
        account = db.get(MemberAccount, ids["accounts"][0])
        assert account.auth_version == 2
        target = db.get(Member, ids["members"][2])
        assert (target.account_id == account.id) is outcomes[1]
        assert [db.get(Member, member_id).card_no for member_id in ids["members"]] == [99200, 99201, 99202]


def test_two_accounts_cannot_claim_the_same_membership_concurrently(personal_accounts_db):
    sessions, ids = personal_accounts_db
    barrier = Barrier(2)

    def attempt(account_id):
        with sessions() as db:
            account = db.get(MemberAccount, account_id)
            target = db.get(Member, ids["members"][2])
            assert target.account_id is None
            barrier.wait(timeout=10)
            try:
                link_member_to_account(db, account=account, member=target, trusted=True, expected_account_version=1)
                db.commit()
                return True
            except HTTPException as exc:
                db.rollback()
                assert exc.status_code in (401, 409)
                return False

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(attempt, ids["accounts"]))
    assert sum(outcomes) == 1
    with sessions() as db:
        target = db.get(Member, ids["members"][2])
        assert target.account_id == ids["accounts"][outcomes.index(True)]
        assert target.card_no == 99202


def test_public_renewal_reissuing_a_session_does_not_invert_account_member_lock_order(personal_accounts_db, monkeypatch):
    """A renewal holding Member must not wait on Account just to remember it."""
    from starlette.requests import Request
    from app.services import public_renewals
    from app.services.member_accounts import lock_account

    sessions, ids = personal_accounts_db
    member_locked = Event()
    account_locked = Event()
    member_id = ids["members"][0]
    account_id = ids["accounts"][0]
    with sessions() as db:
        member = db.get(Member, member_id)
        member.status = MemberStatus.EXPIRED
        member.membership_type = "annual"
        member.card_year = datetime.utcnow().year - 1
        org_id, email = member.org_id, member.email
        db.commit()

    def economic_operation(db, *, member):
        # submit_existing_cardholder_renewal has already locked this Member.
        member_locked.set()
        assert account_locked.wait(timeout=10)
        return SimpleNamespace(action="requested", checkout_required=False,
                               term=SimpleNamespace(id=999998, membership_year=datetime.utcnow().year))

    monkeypatch.setattr(public_renewals, "require_renewals_open", lambda: None)
    monkeypatch.setattr(public_renewals, "lock_card_allocation", lambda *args, **kwargs: None)
    monkeypatch.setattr(public_renewals, "request_renewal", economic_operation)
    monkeypatch.setattr(public_renewals, "serialize_annual_term", lambda *args: {"id": 999998})

    def renewal():
        request = Request({"type": "http", "method": "POST", "path": "/synthetic-renewal",
                           "scheme": "https", "server": ("qa.invalid", 443), "headers": [],
                           "session": {"member_id": member_id, "member_auth_version": 1,
                                       "member_account_id": account_id, "member_account_auth_version": 1}})
        with sessions() as db:
            result = public_renewals.submit_existing_cardholder_renewal(db, request=request,
                org=db.get(Organization, org_id), email=email, password=None)
            assert result["status"] == "renewal_requested"
            assert request.session["member_account_id"] == account_id
            return True

    def reset():
        assert member_locked.wait(timeout=10)
        with sessions() as db:
            assert lock_account(db, account_id).auth_version == 1
            account_locked.set()
            replace_member_password(db, member_id=member_id, expected_version=1,
                                    expected_account_version=1, password_hash="renewal-race-reset")
            db.commit()
            return True

    with ThreadPoolExecutor(max_workers=2) as executor:
        pending = [executor.submit(renewal), executor.submit(reset)]
        assert [future.result(timeout=20) for future in pending] == [True, True]
    with sessions() as db:
        account = db.get(MemberAccount, account_id)
        assert account.auth_version == 2
        assert account.password_hash == "renewal-race-reset"
        assert db.get(Member, member_id).card_no == 99200
