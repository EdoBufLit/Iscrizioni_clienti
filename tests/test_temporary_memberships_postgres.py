"""Temporary purchase races; --noconftest, APP_ENV=test, database=stock_tests only."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import os
from threading import Barrier

import pytest
from sqlalchemy.engine import make_url

_URL = make_url(os.getenv("DATABASE_URL", "sqlite://"))
if os.getenv("APP_ENV", "").lower() != "test" or _URL.get_backend_name() != "postgresql" or _URL.database != "stock_tests":
    pytest.skip("Requires disposable PostgreSQL stock_tests and --noconftest.", allow_module_level=True)

from fastapi import HTTPException
from starlette.requests import Request
from app.models import CardBatch, Member, MemberPayment, MembershipPayment, Organization, TemporaryMembershipPurchase
from app.services.annual_memberships import sync_annual_membership_term
from app.services.renewals import request_renewal
from app.services.temporary_memberships import confirm_manual, create_or_resume
from tests.test_card_reservations_postgres import stock_db


def _request():
    return Request({"type": "http", "method": "POST", "path": "/test", "scheme": "http", "headers": [], "session": {}, "server": ("test", 80)})


def _prepare(sessions, org_id, scope_id, *, members=1):
    year = datetime.now(timezone.utc).year
    with sessions() as db:
        org = db.get(Organization, org_id)
        org.custom_membership_types_enabled = True
        org.temporary_membership_fee_amount = 10
        org.temporary_membership_duration_value = 4
        org.temporary_membership_duration_unit = "hours"
        db.add(CardBatch(org_id=org_id, numbering_scope_id=scope_id, year=year, start_no=5000, end_no=5000, next_no=5000))
        rows = [Member(org_id=org_id, first_name="Race", last_name=str(index), email=f"temporary-{index}@example.com",
                       status="expired", card_no=10 + index, card_year=year - 2,
                       membership_type="annual", numbering_scope_id=scope_id,
                       joined_at=datetime(year - 2, 1, 1)) for index in range(members)]
        db.add_all(rows)
        db.flush()
        for member in rows:
            sync_annual_membership_term(db, member)
        db.commit()
        return [member.id for member in rows]


def test_concurrent_same_member_creates_one_order(stock_db):
    sessions, org_id, scope_id = stock_db
    member_id = _prepare(sessions, org_id, scope_id)[0]
    barrier = Barrier(6)
    def buy():
        with sessions() as db:
            member = db.get(Member, member_id)
            barrier.wait(timeout=10)
            order = create_or_resume(db, member=member, method="contanti", request=_request())
            db.commit()
            return order.id
    with ThreadPoolExecutor(max_workers=6) as pool:
        ids = list(pool.map(lambda _: buy(), range(6)))
    assert len(set(ids)) == 1
    with sessions() as db:
        assert db.query(TemporaryMembershipPurchase).count() == 1


def test_manual_confirm_race_has_one_card_and_one_payment(stock_db, monkeypatch):
    sessions, org_id, scope_id = stock_db
    member_id = _prepare(sessions, org_id, scope_id)[0]
    monkeypatch.setattr("app.services.member_deferred_access.queue_activation_email", lambda *a, **kw: None)
    with sessions() as db:
        order = create_or_resume(db, member=db.get(Member, member_id), method="contanti", request=_request())
        db.commit()
        order_id = order.id
    barrier = Barrier(6)
    def confirm():
        with sessions() as db:
            order = db.get(TemporaryMembershipPurchase, order_id)
            barrier.wait(timeout=10)
            # An audit actor is not needed for the race; nullable payment FK.
            result = confirm_manual(db, purchase=order, admin_id=None, paid_at=datetime.now(), notes="race")
            db.commit()
            return result.card_no
    with ThreadPoolExecutor(max_workers=6) as pool:
        numbers = list(pool.map(lambda _: confirm(), range(6)))
    assert set(numbers) == {5000}
    with sessions() as db:
        assert db.query(MembershipPayment).count() == 1
        assert db.query(MemberPayment).count() == 1


def test_annual_and_temporary_intents_cannot_both_open(stock_db):
    sessions, org_id, scope_id = stock_db
    member_id = _prepare(sessions, org_id, scope_id)[0]
    barrier = Barrier(2)
    def attempt(kind):
        with sessions() as db:
            member = db.get(Member, member_id)
            barrier.wait(timeout=10)
            try:
                if kind == "annual":
                    request_renewal(db, member=member)
                else:
                    create_or_resume(db, member=member, method="contanti", request=_request())
                db.commit()
                return "ok"
            except HTTPException as exc:
                db.rollback()
                assert exc.status_code == 409
                return "blocked"
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, ("annual", "temporary")))
    assert sorted(results) == ["blocked", "ok"]
