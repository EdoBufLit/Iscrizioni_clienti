"""Real HTTP/PostgreSQL resilience checks; run with pytest --noconftest.

Requires APP_ENV=test and the disposable stock_tests database. Each test owns
one UUID schema; application startup, migrations and real providers never run.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import os
import time
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
    pytest.skip(
        "Requires APP_ENV=test, PostgreSQL DATABASE_URL with database=stock_tests, "
        "and --noconftest (normal app fixtures force SQLite).",
        allow_module_level=True,
    )

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import DBAPIError, TimeoutError as DatabasePoolTimeout
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.db import Base, create_app_engine, get_db
from app.main import database_error_handler, health, version
from app.models import CardBatch, Member, MembershipPayment, NumberingScope
from app.routes import membership_payments
from app.services.card_allocation import lock_card_allocation
from tests.signup_payloads import build_join_submit_data
from tests.test_membership_payments_sumup import _build_sumup_org


YEAR = datetime.now(timezone.utc).year


@pytest.fixture(params=[False, True], ids=["organization-domain", "shared-scope-domain"])
def checkout_http_db(request, monkeypatch):
    schema_name = f"checkout_resilience_{uuid4().hex}"
    control_engine = create_engine(_TEST_URL, pool_pre_ping=True)
    test_engine = None
    schema_created = False
    monkeypatch.setattr(settings, "SUMUP_CREDENTIALS_ENCRYPTION_KEY", "stock-tests-only-encryption")
    try:
        with control_engine.begin() as conn:
            assert conn.execute(text("SELECT current_database()")).scalar_one() == "stock_tests"
            conn.execute(text(f'CREATE SCHEMA "{schema_name}"'))
            schema_created = True
        # Exercise the real runtime engine factory, including its 5-second lock
        # deadline and timeout restoration on every connection checkout.
        test_url = _TEST_URL.update_query_dict({"options": f"-csearch_path={schema_name}"})
        test_engine = create_app_engine(test_url)
        Base.metadata.create_all(test_engine)
        sessions = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)
        with sessions() as db:
            assert db.execute(text("SELECT current_schema()")).scalar_one() == schema_name
            assert db.execute(text("SHOW lock_timeout")).scalar_one() == "5s"
            org = _build_sumup_org(db, f"http-stock-tests-{uuid4().hex}", cards=1)
            if request.param:
                scope = NumberingScope(name=f"http-stock-tests-{uuid4().hex}", scope_type="shared")
                db.add(scope)
                db.flush()
                org.numbering_scope_id = scope.id
                batch = db.query(CardBatch).filter_by(org_id=org.id).one()
                batch.numbering_scope_id = scope.id
                db.commit()
            org_id, org_slug = org.id, org.slug
        yield sessions, org_id, org_slug
    finally:
        if test_engine is not None:
            test_engine.dispose()
        if schema_created:
            with control_engine.begin() as conn:
                assert schema_name.startswith("checkout_resilience_")
                conn.execute(text(f'DROP SCHEMA "{schema_name}" CASCADE'))
        control_engine.dispose()


def _isolated_http_app(sessions):
    # Reuse production route functions and error mapping without entering the
    # production app lifespan or initializing the public PostgreSQL schema.
    app = FastAPI()
    app.add_middleware(SessionMiddleware, secret_key="stock-tests-only-session-secret")
    app.include_router(membership_payments.router)
    app.add_api_route("/health", health, methods=["GET"])
    app.add_api_route("/version", version, methods=["GET"])
    app.add_exception_handler(DBAPIError, database_error_handler)
    app.add_exception_handler(DatabasePoolTimeout, database_error_handler)

    def schema_database():
        with sessions() as db:
            yield db

    app.dependency_overrides[get_db] = schema_database
    return app


def _wait_until_postgres_confirms_lock_wait(sessions, holder_pid):
    deadline = time.monotonic() + 2
    with sessions() as observer:
        while time.monotonic() < deadline:
            blocked = observer.execute(
                text(
                    "SELECT EXISTS (SELECT 1 FROM pg_stat_activity "
                    "WHERE wait_event_type = 'Lock' "
                    "AND :holder_pid = ANY(pg_blocking_pids(pid)))"
                ),
                {"holder_pid": holder_pid},
            ).scalar_one()
            if blocked:
                return
            # PostgreSQL can retain a statistics snapshot within a transaction.
            # Observe a fresh snapshot until the request actually enters its wait.
            observer.rollback()
            time.sleep(0.02)
    pytest.fail("The real checkout request did not reach the held PostgreSQL allocation lock")


def test_locked_checkout_keeps_health_responsive_and_times_out_with_safe_retry(
    checkout_http_db, monkeypatch,
):
    sessions, org_id, org_slug = checkout_http_db
    provider_calls = []

    def create_provider_checkout(**kwargs):
        payment_id = kwargs["payment"].id
        with sessions() as observer:
            payment = observer.get(MembershipPayment, payment_id)
            assert payment is not None
            assert payment.reservation_state == "held"
            assert payment.reserved_card_no == 90000
        provider_calls.append(payment_id)
        return {
            "id": f"stock-test-checkout-{payment_id}",
            "hosted_checkout_url": f"https://sumup.invalid/stock-tests/{payment_id}",
        }

    def unexpected_provider_verification(*_args, **_kwargs):
        pytest.fail("A new checkout must not invoke a real provider verification")

    monkeypatch.setattr(membership_payments, "create_sumup_hosted_checkout", create_provider_checkout)
    monkeypatch.setattr(membership_payments, "verify_sumup_checkout", unexpected_provider_verification)
    payload = build_join_submit_data(email=f"http-lock-{uuid4().hex}@stock-tests.invalid")
    checkout_url = f"/api/public/orgs/{org_slug}/membership-payment/create-checkout"
    app = _isolated_http_app(sessions)

    # Entering one TestClient context creates one shared ASGI portal/event loop.
    # Requests from the executor must remain responsive on that same loop.
    with TestClient(app) as client, ThreadPoolExecutor(max_workers=3) as pool:
        holder = sessions()
        try:
            holder_pid = holder.execute(text("SELECT pg_backend_pid()")).scalar_one()
            lock_card_allocation(holder, org_id, YEAR)

            def blocked_checkout():
                started = time.monotonic()
                response = client.post(checkout_url, data=payload)
                return response, time.monotonic() - started

            checkout_future = pool.submit(blocked_checkout)
            _wait_until_postgres_confirms_lock_wait(sessions, holder_pid)
            health_future = pool.submit(client.get, "/health")
            version_future = pool.submit(client.get, "/version")
            health_response = health_future.result(timeout=1.5)
            version_response = version_future.result(timeout=1.5)
            assert health_response.status_code == 200, health_response.text
            assert health_response.json() == {"status": "ok", "db": True}
            assert version_response.status_code == 200, version_response.text
            assert version_response.json()["version"] == settings.PROJECT_VERSION
            assert not checkout_future.done(), "Checkout must still be waiting on the held lock"

            blocked_response, elapsed = checkout_future.result(timeout=7)
            assert blocked_response.status_code == 503, blocked_response.text
            assert blocked_response.headers["retry-after"] == "5"
            assert 4.5 <= elapsed < 7, f"Checkout lock wait was not bounded near 5 seconds: {elapsed}"
            assert provider_calls == []
            assert payload["email"] not in blocked_response.text
            assert "pg_advisory" not in blocked_response.text
            with sessions() as observer:
                assert observer.query(Member).filter_by(org_id=org_id).count() == 0
                assert observer.query(MembershipPayment).filter_by(org_id=org_id).count() == 0

            holder.rollback()
            retry = client.post(checkout_url, data=payload)
            assert retry.status_code == 200, retry.text
            payment_id = retry.json()["payment_id"]
            assert provider_calls == [payment_id]
            with sessions() as observer:
                payments = observer.query(MembershipPayment).filter_by(org_id=org_id).all()
                assert len(payments) == 1
                assert payments[0].id == payment_id
                assert payments[0].reservation_state == "held"
                assert payments[0].reserved_card_no == 90000
                assert observer.query(Member).filter_by(org_id=org_id).count() == 1
                assert observer.query(Member).filter(Member.card_no.is_not(None)).count() == 0
        finally:
            # Release before executor teardown even when a responsiveness check
            # fails, so a regression cannot leave this test's threads blocked.
            holder.rollback()
            holder.close()
