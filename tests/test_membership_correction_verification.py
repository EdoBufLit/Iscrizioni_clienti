"""Existing signed QR identities follow a corrected current annual card."""
from datetime import datetime, timedelta
from decimal import Decimal
import uuid

import pytest
from starlette.requests import Request

from app.db import SessionLocal
from app.models import AdminRole, AdminUser, AnnualMembershipTerm, Member, MemberStatus, Organization, TemporaryMembershipPurchase
from app.services.card_verification import build_card_verification_token, parse_card_verification_token, resolve_card_verification_membership
from app.services.member_membership_correction import correct_temporary_membership_to_annual


@pytest.fixture
def qr_case():
    with SessionLocal() as db:
        now = datetime.utcnow()
        suffix = uuid.uuid4().hex
        org = Organization(name="QR correction", slug="qr-correction-" + suffix, is_active=True)
        db.add(org)
        db.flush()
        actor = AdminUser(email="qr-correction-" + suffix + "@example.test", role=AdminRole.SUPER_ADMIN, is_active=True)
        member = Member(org_id=org.id, first_name="Synthetic", last_name="QR", status=MemberStatus.ACTIVE,
                        membership_type="temporary", card_no=899001, card_year=now.year,
                        joined_at=now - timedelta(days=4), decision_at=now - timedelta(days=4),
                        valid_from=now - timedelta(days=4), valid_until=now - timedelta(days=3),
                        membership_fee_snapshot=Decimal("12.50"))
        db.add_all([actor, member])
        db.flush()
        purchase = TemporaryMembershipPurchase(member_id=member.id, org_id=org.id, status="expired", method="legacy",
                                               amount=Decimal("12.50"), card_no=member.card_no, card_year=member.card_year,
                                               valid_from=member.valid_from, valid_until=member.valid_until)
        db.add(purchase)
        db.commit()
        request = Request({"type": "http", "method": "PATCH", "path": "/qa", "headers": [],
                           "client": ("127.0.0.1", 1), "server": ("testserver", 80), "scheme": "http"})
        yield db, member, actor, purchase, request, now


def test_original_qr_becomes_annual_without_rewriting_temporary_purchase(qr_case):
    db, member, actor, purchase, request, now = qr_case
    token = build_card_verification_token(member.id, member.org_id, member.card_no, member.card_year)
    payload = parse_card_verification_token(token)
    old_expiry, old_amount = purchase.valid_until, purchase.amount
    assert resolve_card_verification_membership(db, payload=payload, checked_at=now)[2] == "expired"
    correct_temporary_membership_to_annual(db, member_id=member.id, actor=actor, request=request, now=now)
    db.commit()
    resolved, snapshot, reason = resolve_card_verification_membership(db, payload=payload, checked_at=now)
    assert resolved.id == member.id and isinstance(snapshot, AnnualMembershipTerm) and reason == ""
    assert token == build_card_verification_token(member.id, member.org_id, member.card_no, member.card_year)
    db.refresh(purchase)
    assert (purchase.status, purchase.valid_until, purchase.amount) == ("expired", old_expiry, old_amount)


def test_other_historical_temporary_number_stays_expired_after_correction(qr_case):
    db, member, actor, _purchase, request, now = qr_case
    historical = TemporaryMembershipPurchase(member_id=member.id, org_id=member.org_id, status="expired", method="legacy",
                                            amount=Decimal("7.00"), card_no=899000, card_year=now.year,
                                            valid_from=now - timedelta(days=7), valid_until=now - timedelta(days=6))
    db.add(historical)
    db.commit()
    correct_temporary_membership_to_annual(db, member_id=member.id, actor=actor, request=request, now=now)
    db.commit()
    payload = parse_card_verification_token(build_card_verification_token(member.id, member.org_id, historical.card_no, historical.card_year))
    _member, snapshot, reason = resolve_card_verification_membership(db, payload=payload, checked_at=now)
    assert isinstance(snapshot, TemporaryMembershipPurchase) and snapshot.id == historical.id and reason == "expired"


def test_type_field_alone_cannot_override_expired_purchase_without_annual_term(qr_case):
    db, member, _actor, purchase, _request, now = qr_case
    member.membership_type = "annual"
    member.valid_until = None
    db.commit()
    payload = parse_card_verification_token(build_card_verification_token(member.id, member.org_id, member.card_no, member.card_year))
    _member, snapshot, reason = resolve_card_verification_membership(db, payload=payload, checked_at=now)
    assert isinstance(snapshot, TemporaryMembershipPurchase) and snapshot.id == purchase.id and reason == "expired"
