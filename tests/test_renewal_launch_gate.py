from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import uuid

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.db import SessionLocal
from app.models import AnnualMembershipTerm, CardBatch, EmailOutbox, MembershipPayment, Token, TokenType
from app.services import renewal_availability as gate
from app.services.annual_memberships import as_rome_datetime
from app.services.renewals import (complete_renewal_payment, confirm_unpaid_renewal, create_renewal_checkout,
    record_manual_renewal_payment, request_renewal, serialize_member_membership)
from app.services.public_renewals import submit_existing_cardholder_renewal
from app.services.member_accounting import allocate
from app.utils import hash_token
from tests.test_annual_renewals import _build_org, _build_member_and_source, _login_org_admin


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def closed_clock(monkeypatch):
    original = as_rome_datetime
    monkeypatch.setattr(gate, "as_rome_datetime", lambda value=None: original(value or datetime(2026, 12, 31, 22, 59, 59, tzinfo=timezone.utc)))


@pytest.mark.parametrize("instant,available", [
    (datetime(2026, 7, 1, 22, tzinfo=timezone.utc), False),
    (datetime(2026, 12, 31, 22, 59, 59, tzinfo=timezone.utc), False),
    (datetime(2026, 12, 31, 23, 0, 0, tzinfo=timezone.utc), True),
    (datetime(2027, 7, 1, 22, tzinfo=timezone.utc), True),
])
def test_launch_uses_italian_calendar_and_exact_midnight(instant, available):
    assert gate.renewals_available(now=instant) is available
    if available:
        gate.require_renewals_open(now=instant)
    else:
        with pytest.raises(HTTPException, match="2027") as error:
            gate.require_renewals_open(now=instant)
        assert error.value.status_code == 409


def test_all_new_member_admin_and_accounting_initiation_is_blocked_without_changes(db, monkeypatch):
    closed_clock(monkeypatch)
    org = _build_org(db, fee=Decimal("25"))
    member, _ = _build_member_and_source(db, org=org, year=2026, card_no=910001)
    term = AnnualMembershipTerm(org_id=org.id, member_id=member.id, membership_year=2027, starts_on=date(2027, 1, 1), valid_through=date(2028, 1, 1), status="payment_pending", fee_amount=Decimal("25"), currency="EUR", source="preexisting")
    db.add(term); db.commit()
    request = Request({"type": "http", "method": "POST", "path": "/", "headers": [], "scheme": "https", "server": ("testserver", 443)})
    now = datetime(2026, 12, 31, 22, 59, 59, tzinfo=timezone.utc)
    actions = [
        lambda: request_renewal(db, member=member, now=now),
        lambda: create_renewal_checkout(db, member=member, term=term, request=request, now=now),
        lambda: confirm_unpaid_renewal(db, member=member, membership_year=2027, now=now),
        lambda: record_manual_renewal_payment(db, member=member, membership_year=2027, admin_id=1, amount=Decimal("25"), method="cash", paid_at=now, notes=None, now=now),
        lambda: allocate(db, org_id=org.id, receipt_id=1, admin_id=1, version=1, items=[{"target_key": f"renewal:{member.id}:2027", "amount_cents": 2500}]),
    ]
    for action in actions:
        with pytest.raises(HTTPException) as error:
            action()
        assert error.value.status_code == 409
        assert "1 gennaio 2027" in error.value.detail
    assert db.query(MembershipPayment).filter_by(socio_id=member.id).count() == 0
    assert db.query(AnnualMembershipTerm).filter_by(member_id=member.id).count() == 2
    assert term.status == "payment_pending"
    metadata = serialize_member_membership(db, member=member, now=now)
    assert metadata["can_renew"] is False
    assert metadata["renewal_checkout_available"] is False
    assert metadata["renewal_opens_on"] == "2027-01-01"


def test_public_metadata_and_old_proof_links_are_closed_without_consuming_or_emailing(client, db, monkeypatch):
    closed_clock(monkeypatch)
    org = _build_org(db)
    member, _ = _build_member_and_source(db, org=org, year=2025, card_no=910002)
    raw = f"proof-{uuid.uuid4().hex}"
    token = Token(member_id=member.id, purpose=TokenType.LOGIN_MAGIC_LINK, token_hash=hash_token(raw), auth_version=member.auth_version, expires_at=datetime.utcnow()+timedelta(hours=1))
    db.add(token); db.commit()
    context = client.get(f"/api/join/{org.slug}/renewal")
    assert context.status_code == 200
    assert context.json()["renewal_available"] is False
    assert context.json()["renewal_opens_on"] == "2027-01-01"
    assert context.json()["membership"] is None
    for url, method, values in [
        (f"/api/join/{org.slug}/renewal/request", "post", {"data": {"email": member.email}}),
        (f"/api/join/{org.slug}/renewal/verify?token={raw}", "get", {}),
    ]:
        response = getattr(client, method)(url, **values)
        assert response.status_code == 409, response.text
    request = Request({"type": "http", "method": "POST", "path": "/", "headers": [], "scheme": "https", "server": ("testserver", 443)})
    with pytest.raises(HTTPException) as error:
        submit_existing_cardholder_renewal(db, request=request, org=org, email=member.email, password=None)
    assert error.value.status_code == 409
    db.refresh(token)
    assert token.used_at is None
    assert db.query(EmailOutbox).filter_by(to_email=member.email).count() == 0


def test_member_and_admin_http_endpoints_reject_old_initiation_urls(client, db, monkeypatch):
    closed_clock(monkeypatch)
    org = _build_org(db)
    member, _ = _build_member_and_source(db, org=org, year=2026, card_no=910003)
    db.commit()
    login = client.post("/api/auth/login", data={"email": member.email, "password": "Pass1234!"})
    assert login.status_code == 200, login.text
    response = client.post("/api/member/renewals")
    assert response.status_code == 409
    confirm = client.post(f"/api/join/{org.slug}/renewal/confirm")
    assert confirm.status_code == 409
    admin = _login_org_admin(client, db, org=org)
    response = client.post(f"/api/org-admin/quotes/members/{member.id}/confirm", json={"membership_year": 2027})
    assert response.status_code == 409
    response = client.post(f"/api/org-admin/quotes/members/{member.id}/payments/manual", json={"membership_year": 2027, "amount": "25.00", "method": "cash", "paid_at": "2026-12-31"})
    assert response.status_code == 409


def test_existing_paid_renewal_settlement_remains_available_before_launch(db, monkeypatch):
    closed_clock(monkeypatch)
    org = _build_org(db, fee=Decimal("25"))
    member, _ = _build_member_and_source(db, org=org, year=2026, card_no=910004)
    term = AnnualMembershipTerm(org_id=org.id, member_id=member.id, membership_year=2027, starts_on=date(2027, 1, 1), valid_through=date(2028, 1, 1), status="payment_pending", fee_amount=Decimal("25"), currency="EUR", source="preexisting")
    db.add(term); db.flush()
    payment = MembershipPayment(org_id=org.id, socio_id=member.id, annual_term_id=term.id, membership_year=2027, payment_kind="renewal", status="completed", source="sumup", provider="sumup", amount=Decimal("25"), currency="EUR")
    db.add(payment); db.flush()
    db.add(CardBatch(org_id=org.id, year=2027, start_no=990001, end_no=990003, next_no=990001))
    db.flush()
    assert complete_renewal_payment(db, payment=payment, now=datetime(2026, 12, 31, 22, 59, tzinfo=timezone.utc)) is True
    assert term.card_no is not None
    assert term.status == "scheduled"
