from datetime import datetime, timedelta, timezone, date
from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

from app.models import (
    Base, AdminRole, AdminUser, AnnualMembershipTerm, CardBatch, EmailOutbox,
    Member, MemberPayment, MemberStatus, MembershipPayment, Organization,
    TemporaryMembershipPurchase,
)
from app.routes.org_admin import CreateMemberBody, ManualPaymentBody, create_org_member, create_manual_payment, MemberDecisionBody, member_decision
from app.services.card_availability import card_batch_availability
from app.services.card_verification import build_card_verification_token, parse_card_verification_token, resolve_card_verification_membership
from app.services.temporary_memberships import (
    confirm_manual, create_or_resume, fulfill_purchase, offer, serialize_purchase,
)


@pytest.fixture
def memory_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine, autoflush=False) as db:
        yield db
    engine.dispose()


def request():
    return Request({"type": "http", "method": "POST", "scheme": "http", "path": "/test",
                    "headers": [], "session": {}, "client": ("127.0.0.1", 1234), "server": ("testserver", 80)})


def setup(db, *, method="contanti"):
    now = datetime.now(timezone.utc)
    org = Organization(name="Temporary Purchase Test", slug="temporary-purchase-test", is_active=True,
                       custom_membership_types_enabled=True, temporary_membership_fee_amount=10,
                       temporary_membership_duration_value=4, temporary_membership_duration_unit="hours",
                       membership_fee_currency="EUR", membership_fee_amount=30)
    db.add(org)
    db.flush()
    member = Member(org_id=org.id, first_name="Socio", last_name="Test", email="member@example.test",
                    status=MemberStatus.EXPIRED, card_no=1, card_year=now.year - 1,
                    membership_type="annual", joined_at=now.replace(tzinfo=None) - timedelta(days=400))
    admin = AdminUser(email="admin@example.test", org_id=org.id, role=AdminRole.ORG_ADMIN, is_active=True)
    batch = CardBatch(org_id=org.id, year=now.year, start_no=100, end_no=110, next_no=100)
    db.add_all([member, admin, batch])
    db.commit()
    return org, member, admin, batch


@pytest.fixture(autouse=True)
def cheap_email(monkeypatch):
    # Exercise the actual durable/deduplicated outbox without image rendering.
    from app.services.email_outbox import enqueue_email
    def enqueue(*, db, member, dedupe_key=None, **kwargs):
        return enqueue_email(db, email_type="member_card_ready", to_email=member.email,
                             subject="Tessera e accesso", payload={"text_body": "Tessera disponibile"}, priority=5,
                             dedupe_key=dedupe_key or f"member_card_ready:{member.id}:{member.card_year}:{member.card_no}")
    monkeypatch.setattr("app.services.member_card_delivery._enqueue_member_card_ready_email", enqueue)


def test_manual_purchase_reuses_account_preserves_annual_and_issues_once(memory_db):
    db = memory_db
    org, member, admin, batch = setup(db)
    old_number, old_year = member.card_no, member.card_year
    first = create_or_resume(db, member=member, method="contanti", request=request())
    again = create_or_resume(db, member=member, method="contanti", request=request())
    assert first.id == again.id
    assert first.valid_until is None
    org.temporary_membership_fee_amount = 99
    org.temporary_membership_duration_value = 1
    org.custom_membership_types_enabled = False
    db.commit()
    first = confirm_manual(db, purchase=first, admin_id=admin.id, paid_at=datetime(2026, 1, 5), notes="In sede")
    db.commit()
    assert first.amount == Decimal("10.00")
    assert first.valid_until - first.valid_from == timedelta(hours=4)
    issued_at = first.issued_at.replace(tzinfo=timezone.utc) if first.issued_at.tzinfo is None else first.issued_at
    assert issued_at >= datetime.now(timezone.utc) - timedelta(seconds=15)
    assert first.card_no == member.card_no == 100
    assert db.query(Member).count() == 1
    historical = db.query(AnnualMembershipTerm).one()
    assert (historical.card_no, historical.card_year, historical.status) == (old_number, old_year, "expired")
    assert confirm_manual(db, purchase=first, admin_id=admin.id, paid_at=datetime(2026, 1, 5), notes="Retry").card_no == 100
    db.commit()
    assert db.query(MembershipPayment).count() == 1
    assert db.query(MemberPayment).count() == 1
    assert db.query(EmailOutbox).count() == 1
    assert db.query(MemberPayment).one().paid_at.date() == date(2026, 1, 5)
    assert card_batch_availability(db, [batch])[batch.id].assigned == 1


def test_second_temporary_uses_new_number_and_old_qr_remains_expired(memory_db):
    db = memory_db
    org, member, admin, batch = setup(db)
    first = create_or_resume(db, member=member, method="bonifico", request=request())
    confirm_manual(db, purchase=first, admin_id=admin.id, paid_at=datetime.utcnow(), notes=None)
    db.commit()
    token = build_card_verification_token(member.id, org.id, first.card_no, first.card_year)
    first.valid_until = member.valid_until = datetime.utcnow() - timedelta(hours=1)
    db.commit()
    second = create_or_resume(db, member=member, method="contanti", request=request())
    confirm_manual(db, purchase=second, admin_id=admin.id, paid_at=datetime.utcnow(), notes=None)
    db.commit()
    assert second.card_no == 101
    assert db.query(Member).count() == 1
    _, snapshot, reason = resolve_card_verification_membership(db, payload=parse_card_verification_token(token), checked_at=datetime.utcnow())
    assert snapshot.id == first.id
    assert reason == "expired"
    assert card_batch_availability(db, [batch])[batch.id].assigned == 2


def test_eligibility_blocks_active_pending_and_cross_annual_purchase(memory_db):
    db = memory_db
    org, member, admin, batch = setup(db)
    member.status = MemberStatus.PENDING_DOCS
    assert not offer(db, member)["eligible"]
    member.status = MemberStatus.ACTIVE
    member.card_year = datetime.utcnow().year
    assert not offer(db, member)["eligible"]
    member.status = MemberStatus.EXPIRED
    member.card_year -= 1
    db.add(AnnualMembershipTerm(member_id=member.id, org_id=org.id, membership_year=member.card_year + 1,
                               starts_on=date.today(), valid_through=date(datetime.utcnow().year + 1, 1, 1),
                               status="payment_pending", source="renewal"))
    db.flush()
    assert not offer(db, member)["eligible"]
    with pytest.raises(HTTPException) as failure:
        create_or_resume(db, member=member, method="contanti", request=request())
    assert failure.value.status_code == 409


def test_paid_waiting_stock_does_not_start_duration(memory_db):
    db = memory_db
    org, member, admin, batch = setup(db)
    batch.is_enabled = False
    order = create_or_resume(db, member=member, method="contanti", request=request())
    confirm_manual(db, purchase=order, admin_id=admin.id, paid_at=datetime(2026, 1, 5), notes=None)
    db.commit()
    assert order.status == "paid_waiting_card"
    assert order.valid_from is None and order.valid_until is None
    batch.is_enabled = True
    payment = db.query(MembershipPayment).one()
    assert fulfill_purchase(db, purchase=order, payment=payment)
    db.commit()
    assert order.valid_until - order.valid_from == timedelta(hours=4)
    assert not fulfill_purchase(db, purchase=order, payment=payment)


def test_open_temporary_blocks_annual_renewal(memory_db):
    from app.services.annual_memberships import sync_annual_membership_term
    from app.services.renewals import request_renewal
    db = memory_db
    org, member, admin, batch = setup(db)
    sync_annual_membership_term(db, member)
    db.flush()
    create_or_resume(db, member=member, method="contanti", request=request())
    with pytest.raises(HTTPException) as failure:
        request_renewal(db, member=member)
    assert failure.value.status_code == 409


def test_online_checkout_reused_and_completion_uses_temporary_dispatch(memory_db, monkeypatch):
    from app.services.membership_payments import apply_membership_payment_completion
    db = memory_db
    org, member, admin, batch = setup(db)
    org.payment_provider, org.sumup_enabled = "sumup", True
    org.membership_payment_label, org.payment_button_label = "Quota", "Paga"
    org.sumup_api_key_encrypted = "synthetic"
    db.commit()
    created = []
    def create_checkout(**kwargs):
        assert not db.in_transaction(), "Provider I/O must not retain the allocation transaction"
        created.append(kwargs["payment"].id)
        return {"id": "synthetic-checkout", "hosted_checkout_url": "https://example.test/checkout"}
    monkeypatch.setattr("app.services.membership_payments.create_sumup_hosted_checkout", create_checkout)
    monkeypatch.setattr("app.services.membership_payments.verify_sumup_checkout", lambda *args: {"id": "synthetic-checkout", "status": "PENDING"})
    order = create_or_resume(db, member=member, method="sumup", request=request())
    assert order.valid_from is None
    db.commit()
    assert create_or_resume(db, member=member, method="sumup", request=request()).id == order.id
    db.commit()
    assert len(created) == 1
    payment = db.query(MembershipPayment).one()
    assert payment.payment_kind == "temporary" and payment.reservation_state == "held"
    result = apply_membership_payment_completion(db=db, payment=payment, member=member, org=org, verified_payload={"status": "PAID"})
    db.commit()
    assert result.issued_card and member.card_no == 100 and order.card_no == 100
    assert payment.reservation_state == "consumed"
    assert not apply_membership_payment_completion(db=db, payment=payment, member=member, org=org, verified_payload={"status": "PAID"}).issued_card


def test_manual_create_defers_email_until_release_and_deduplicates(memory_db):
    db = memory_db
    org, existing, admin, batch = setup(db)
    body = CreateMemberBody(first_name="Nuovo", last_name="Socio", email="new@example.com",
                            membership_type="temporary", send_access_email=True)
    with patch("app.routes.org_admin._get_current_org_admin", return_value=admin):
        response = create_org_member(request(), body, db)
        assert response["email_status"] == "deferred"
        new = db.get(Member, response["id"])
        assert new.access_email_requested and db.query(EmailOutbox).count() == 0
        member_decision(request(), new.id, MemberDecisionBody(decision="approve"), db)
        db.refresh(new)
        assert not new.access_email_requested
        assert new.valid_until - new.valid_from == timedelta(hours=4)
        assert new.valid_from > datetime.utcnow() - timedelta(seconds=15)
        member_decision(request(), new.id, MemberDecisionBody(decision="approve"), db)
    assert db.query(EmailOutbox).filter(EmailOutbox.to_email == "new@example.com").count() == 1


def test_manual_initial_payment_date_and_retry_keep_ledgers_equal(memory_db):
    db = memory_db
    org, member, admin, batch = setup(db)
    member.card_year = datetime.utcnow().year
    member.status = MemberStatus.ACTIVE
    db.commit()
    body = ManualPaymentBody(amount=35, method="contanti", paid_at=date(2026, 1, 5))
    with patch("app.routes.org_admin._get_current_org_admin", return_value=admin):
        first = create_manual_payment(request(), member.id, body, db)
        second = create_manual_payment(request(), member.id, body, db)
    assert first["payment"]["id"] == second["payment"]["id"]
    assert db.query(MemberPayment).count() == db.query(MembershipPayment).count() == 1
    assert db.query(MemberPayment).one().paid_at.date() == date(2026, 1, 5)
    assert db.query(MembershipPayment).one().confirmed_at.date() == date(2026, 1, 5)


def test_cancel_only_unpaid_order_and_releases_annual_block(memory_db):
    from app.services.temporary_memberships import cancel_purchase
    from app.services.renewals import request_renewal
    from app.services.annual_memberships import sync_annual_membership_term
    db = memory_db
    org, member, admin, batch = setup(db)
    sync_annual_membership_term(db, member)
    db.flush()
    order = create_or_resume(db, member=member, method="contanti", request=request())
    assert cancel_purchase(db, purchase=order).status == "cancelled"
    db.commit()
    assert offer(db, member)["eligible"]
    assert request_renewal(db, member=member).term is not None


def test_online_cancel_requires_authoritative_unpayable_checkout(memory_db, monkeypatch):
    from app.services.temporary_memberships import cancel_purchase
    db = memory_db
    org, member, admin, batch = setup(db)
    org.payment_provider, org.sumup_enabled = "sumup", True
    org.membership_payment_label, org.payment_button_label = "Quota", "Paga"
    org.sumup_api_key_encrypted = "synthetic"
    db.commit()
    monkeypatch.setattr("app.services.membership_payments.create_sumup_hosted_checkout",
                        lambda **kw: {"id": "cancel-checkout", "hosted_checkout_url": "https://example.test/checkout"})
    monkeypatch.setattr("app.services.membership_payments.verify_sumup_checkout",
                        lambda *args: {"id": "cancel-checkout", "status": "PENDING"})
    order = create_or_resume(db, member=member, method="sumup", request=request())
    db.commit()
    with pytest.raises(HTTPException) as failure:
        cancel_purchase(db, purchase=order)
    assert failure.value.status_code == 409
    db.rollback()
    assert order.status == "payment_pending"
    monkeypatch.setattr("app.services.membership_payments.verify_sumup_checkout",
                        lambda *args: {"id": "cancel-checkout", "status": "EXPIRED", "transactions": []})
    payment = db.query(MembershipPayment).one()
    payment.reservation_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    assert cancel_purchase(db, purchase=order).status == "cancelled"
    db.commit()
    assert payment.reservation_state == "released"
    assert offer(db, member)["eligible"]


def test_api_account_expiry_and_owner_scoping(memory_db, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from starlette.middleware.sessions import SessionMiddleware
    from app.db import get_db
    from app.routes import member as member_routes, temporary_memberships as routes
    from app.security import get_password_hash
    db = memory_db
    org, member, admin, batch = setup(db)
    member.membership_type = "temporary"
    member.valid_until = datetime.utcnow() - timedelta(days=1)
    member.password_hash = get_password_hash("Synthetic123!")
    other_org = Organization(name="Other club", slug="other-purchase-club", is_active=True)
    db.add(other_org)
    db.flush()
    other = Member(org_id=other_org.id, email="other@example.com", first_name="Other", last_name="Member",
                   status=MemberStatus.EXPIRED, membership_type="temporary", card_no=2,
                   card_year=datetime.utcnow().year, valid_until=datetime.utcnow() - timedelta(days=1),
                   password_hash=get_password_hash("Synthetic123!"))
    db.add(other)
    db.commit()
    application = FastAPI()
    application.add_middleware(SessionMiddleware, secret_key="synthetic-test-session")
    application.include_router(member_routes.router)
    application.include_router(routes.router)
    def dependency():
        yield db
    application.dependency_overrides[get_db] = dependency
    monkeypatch.setattr("app.routes.temporary_memberships.get_current_org_admin_from_request", lambda *args: None)
    with TestClient(application) as client:
        assert client.get("/api/member/temporary-memberships/offer").status_code == 401
        login = client.post("/api/auth/login", data={"email": member.email, "password": "Synthetic123!"})
        assert login.status_code == 200 and login.json()["authenticated"]
        profile = client.get("/api/auth/me")
        assert profile.status_code == 200
        assert datetime.fromisoformat(profile.json()["valid_until"]).utcoffset() is not None
        assert client.get("/api/member/temporary-memberships/offer").json()["eligible"]
        created = client.post("/api/member/temporary-memberships", json={"method": "contanti"})
        assert created.status_code == 200, created.text
        purchase_id = created.json()["purchase"]["id"]
        assert client.get(f"/api/member/temporary-memberships/{purchase_id}").status_code == 200
        client.post("/api/auth/logout")
        assert client.post("/api/auth/login", data={"email": other.email, "password": "Synthetic123!"}).json()["authenticated"]
        assert client.get(f"/api/member/temporary-memberships/{purchase_id}").status_code == 404
        assert client.post(f"/api/member/temporary-memberships/{purchase_id}/cancel").status_code == 404
        assert client.post(f"/api/org-admin/temporary-memberships/{purchase_id}/confirm-manual", json={"paid_at": "2026-01-05"}).status_code == 401


def test_deferred_access_outbox_drains_once_to_requested_recipient(memory_db, monkeypatch):
    from app.services import email_outbox
    db = memory_db
    org, member, admin, batch = setup(db)
    with patch("app.routes.org_admin._get_current_org_admin", return_value=admin):
        result = create_org_member(request(), CreateMemberBody(first_name="Deferred", last_name="Access",
                                  email="deferred@example.com", send_access_email=True), db)
        member_decision(request(), result["id"], MemberDecisionBody(decision="approve"), db)
        member_decision(request(), result["id"], MemberDecisionBody(decision="approve"), db)
    sent = []
    monkeypatch.setattr(email_outbox, "SessionLocal", lambda: Session(db.get_bind()))
    monkeypatch.setattr(email_outbox, "send_email_via_transport_low_level", lambda **kw: sent.append(kw) or "synthetic-message-id")
    stats = email_outbox.drain_outbox_for_tests()
    assert stats["sent"] == 1
    assert [item["to_email"] for item in sent] == ["deferred@example.com"]
    assert email_outbox.drain_outbox_for_tests()["sent"] == 0
