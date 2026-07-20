from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    AnnualMembershipTerm,
    AnnualMembershipTermStatus,
    CardBatch,
    EmailOutbox,
    Member,
    MemberNotification,
    MemberStatus,
    MembershipPayment,
    MembershipType,
    Organization,
    OrgAdminToken,
)
from app.routes import public as public_routes
from app.security import get_password_hash
from app.services.card_verification import build_card_verification_token
from app.services.renewals import (
    build_quote_center,
    dispatch_due_renewal_reminders,
    promote_renewal_term,
    record_manual_renewal_payment,
    request_renewal,
    send_renewal_reminder,
)
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _build_org(db, *, auto_approve: bool = True, fee: Decimal = Decimal("0.00")):
    suffix = uuid.uuid4().hex[:10]
    org = Organization(
        name=f"Rinnovi {suffix}",
        slug=f"rinnovi-{suffix}",
        is_active=True,
        auto_approve_signup=auto_approve,
        membership_fee_amount=fee,
        membership_fee_currency="EUR",
    )
    db.add(org)
    db.flush()
    return org


def _build_member_and_source(
    db,
    *,
    org: Organization,
    year: int,
    card_no: int,
    member_status=MemberStatus.ACTIVE,
):
    suffix = uuid.uuid4().hex[:10]
    member = Member(
        org_id=org.id,
        first_name="Anna",
        last_name="Rinnovo",
        email=f"anna-{suffix}@example.com",
        password_hash=get_password_hash("Pass1234!"),
        status=member_status,
        card_no=card_no,
        card_year=year,
        membership_type=MembershipType.ANNUAL.value,
        valid_from=datetime(year, 1, 1),
        joined_at=datetime(year, 1, 1),
    )
    db.add(member)
    db.flush()
    source = AnnualMembershipTerm(
        member_id=member.id,
        org_id=org.id,
        membership_year=year,
        starts_on=date(year, 1, 1),
        valid_through=date(year + 1, 1, 1),
        status=(
            AnnualMembershipTermStatus.EXPIRED.value
            if member_status == MemberStatus.EXPIRED
            else AnnualMembershipTermStatus.ACTIVE.value
        ),
        fee_amount=org.membership_fee_amount,
        currency="EUR",
        card_no=card_no,
        card_year=year,
        issued_at=datetime(year, 1, 1),
        activated_at=datetime(year, 1, 1),
        source="test",
    )
    db.add(source)
    db.flush()
    return member, source


def _login_org_admin(client, db, *, org: Organization) -> AdminUser:
    suffix = uuid.uuid4().hex[:10]
    admin = AdminUser(
        email=f"quote-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.flush()
    raw_token = f"quote-token-{suffix}"
    db.add(
        OrgAdminToken(
            admin_id=admin.id,
            token_hash=hash_token(raw_token),
            expires_at=datetime.utcnow() + timedelta(minutes=15),
        )
    )
    db.commit()
    response = client.get(
        f"/api/org-admin/auth/verify?token={raw_token}",
        follow_redirects=False,
    )
    assert response.status_code == 302
    return admin


def test_manual_renewal_is_term_scoped_and_does_not_replace_current_card_early(db):
    org = _build_org(db, fee=Decimal("25.00"))
    member, _source = _build_member_and_source(db, org=org, year=2026, card_no=41001)
    batch = CardBatch(
        org_id=org.id,
        year=2027,
        start_no=42001,
        end_no=42010,
        next_no=42001,
    )
    db.add(batch)
    db.flush()

    term, payment, issued = record_manual_renewal_payment(
        db,
        member=member,
        membership_year=2027,
        admin_id=1,
        amount=Decimal("25.00"),
        method="bonifico",
        paid_at=datetime(2026, 12, 1),
        notes="Ricevuto",
        now=datetime(2026, 12, 1),
    )
    db.flush()

    assert issued is True
    assert term.membership_year == 2027
    assert term.status == AnnualMembershipTermStatus.SCHEDULED.value
    assert term.card_no == 42001
    assert payment.annual_term_id == term.id
    assert payment.membership_year == 2027
    assert payment.payment_kind == "renewal"
    assert member.card_no == 41001
    assert member.card_year == 2026

    duplicate_term, duplicate_payment, duplicate_issued = record_manual_renewal_payment(
        db,
        member=member,
        membership_year=2027,
        admin_id=1,
        amount=Decimal("25.00"),
        method="bonifico",
        paid_at=datetime(2026, 12, 1),
        notes=None,
        now=datetime(2026, 12, 1),
    )
    assert duplicate_term.id == term.id
    assert duplicate_payment.id == payment.id
    assert duplicate_issued is False
    assert db.query(MembershipPayment).filter_by(annual_term_id=term.id).count() == 1

    quote = build_quote_center(db, org=org, year=2027)
    assert quote["kpis"]["renewed"] == 1
    assert quote["kpis"]["collected_total"] == 25.0
    assert quote["items"][0]["new_card_no"] == 42001


def test_org_admin_quote_api_records_term_payment_and_exports_csv(client, db):
    org = _build_org(db, auto_approve=False, fee=Decimal("20.00"))
    member, _source = _build_member_and_source(db, org=org, year=2026, card_no=42501)
    db.add(
        CardBatch(
            org_id=org.id,
            year=2027,
            start_no=42601,
            end_no=42610,
            next_no=42601,
        )
    )
    _login_org_admin(client, db, org=org)

    before = client.get("/api/org-admin/quotes?year=2027")
    assert before.status_code == 200
    assert before.json()["items"][0]["member_id"] == member.id
    assert before.json()["items"][0]["renewal_status"] == "due"

    paid = client.post(
        f"/api/org-admin/quotes/members/{member.id}/payments/manual",
        json={
            "membership_year": 2027,
            "amount": 20,
            "method": "bonifico",
            "paid_at": "2026-12-01",
            "notes": "Ricevuto",
        },
    )
    assert paid.status_code == 200, paid.text
    assert paid.json()["card_assigned"] is True

    after = client.get("/api/org-admin/quotes?year=2027")
    row = after.json()["items"][0]
    assert row["renewed"] is True
    assert row["payment_state"] == "paid"
    assert row["new_card_no"] == 42601

    exported = client.get("/api/org-admin/quotes.csv?year=2027")
    assert exported.status_code == 200
    assert exported.content.startswith(b"\xef\xbb\xbf")
    assert member.email.encode() in exported.content


def test_renewal_reminders_are_service_messages_and_deduplicated(db):
    org = _build_org(db, fee=Decimal("10.00"))
    member, source = _build_member_and_source(db, org=org, year=2026, card_no=43001)

    first = send_renewal_reminder(db, source=source, now=datetime(2026, 11, 2))
    second = send_renewal_reminder(db, source=source, now=datetime(2026, 11, 2))
    thirty_days = send_renewal_reminder(db, source=source, now=datetime(2026, 12, 2))
    seven_days = send_renewal_reminder(db, source=source, now=datetime(2026, 12, 25))
    expired = send_renewal_reminder(db, source=source, now=datetime(2027, 1, 2))
    db.flush()

    assert first is True
    assert second is False
    assert thirty_days is True
    assert seven_days is True
    assert expired is True
    notifications = db.query(MemberNotification).filter_by(member_id=member.id).all()
    assert len(notifications) == 4
    assert {notification.type for notification in notifications} == {"renewal"}
    outbox = db.query(EmailOutbox).filter_by(to_email=member.email).all()
    assert len(outbox) == 4
    assert {item.email_type for item in outbox} == {"renewal_reminder"}
    assert {item.payload_json["meta"]["reminder_marker"] for item in outbox} == {
        "60",
        "30",
        "7",
        "expired",
    }
    assert all(item.payload_json["meta"]["service_message"] is True for item in outbox)

    stale = send_renewal_reminder(db, source=source, now=datetime(2027, 7, 18))
    db.flush()
    assert stale is False
    assert db.query(MemberNotification).filter_by(member_id=member.id).count() == 4


def test_repeated_renewal_request_reuses_same_target_year(db):
    org = _build_org(db, auto_approve=False, fee=Decimal("0.00"))
    member, _source = _build_member_and_source(db, org=org, year=2026, card_no=43501)

    first = request_renewal(db, member=member, now=datetime(2026, 12, 1))
    db.flush()
    second = request_renewal(db, member=member, now=datetime(2026, 12, 1))
    db.flush()

    assert first.term.id == second.term.id
    assert first.term.membership_year == 2027
    assert second.action == "org_confirmation"
    assert (
        db.query(AnnualMembershipTerm)
        .filter(AnnualMembershipTerm.member_id == member.id)
        .count()
        == 2
    )


def test_required_payment_cannot_be_bypassed_with_unpaid_confirmation(client, db):
    org = _build_org(db, auto_approve=False, fee=Decimal("25.00"))
    org.payment_required_before_card = True
    member, _source = _build_member_and_source(
        db,
        org=org,
        year=2026,
        card_no=43601,
    )
    batch = CardBatch(
        org_id=org.id,
        year=2027,
        start_no=43701,
        end_no=43710,
        next_no=43701,
    )
    db.add(batch)
    _login_org_admin(client, db, org=org)

    blocked = client.post(
        f"/api/org-admin/quotes/members/{member.id}/confirm",
        json={"membership_year": 2027},
    )

    assert blocked.status_code == 409, blocked.text
    assert "pagamento" in blocked.json()["detail"].lower()
    db.expire_all()
    assert db.query(CardBatch).filter(CardBatch.id == batch.id).one().next_no == 43701
    assert (
        db.query(AnnualMembershipTerm)
        .filter(
            AnnualMembershipTerm.member_id == member.id,
            AnnualMembershipTerm.membership_year == 2027,
        )
        .count()
        == 0
    )


def test_worker_retries_only_approved_or_paid_waiting_2027_renewals(db):
    free_org = _build_org(db, auto_approve=True, fee=Decimal("0.00"))
    free_member, _free_source = _build_member_and_source(
        db,
        org=free_org,
        year=2026,
        card_no=43801,
    )
    free_result = request_renewal(
        db,
        member=free_member,
        now=datetime(2026, 11, 15),
    )
    assert free_result.action == "waiting_card"
    assert (
        free_result.term.status
        == AnnualMembershipTermStatus.APPROVED_WAITING_CARD.value
    )

    paid_org = _build_org(db, auto_approve=False, fee=Decimal("30.00"))
    paid_member, _paid_source = _build_member_and_source(
        db,
        org=paid_org,
        year=2026,
        card_no=43901,
    )
    paid_term, _payment, paid_issued = record_manual_renewal_payment(
        db,
        member=paid_member,
        membership_year=2027,
        admin_id=1,
        amount=Decimal("30.00"),
        method="bonifico",
        paid_at=datetime(2026, 12, 10),
        notes=None,
        now=datetime(2026, 12, 10),
    )
    assert paid_issued is False
    assert paid_term.status == AnnualMembershipTermStatus.PAID_WAITING_CARD.value

    due_org = _build_org(db, auto_approve=False, fee=Decimal("0.00"))
    due_member, _due_source = _build_member_and_source(
        db,
        org=due_org,
        year=2026,
        card_no=44001,
    )
    due_result = request_renewal(
        db,
        member=due_member,
        now=datetime(2026, 12, 15),
    )
    assert due_result.term.status == AnnualMembershipTermStatus.DUE.value

    db.add_all(
        [
            CardBatch(
                org_id=free_org.id,
                year=2027,
                start_no=44101,
                end_no=44110,
                next_no=44101,
            ),
            CardBatch(
                org_id=paid_org.id,
                year=2027,
                start_no=44201,
                end_no=44210,
                next_no=44201,
            ),
            CardBatch(
                org_id=due_org.id,
                year=2027,
                start_no=44301,
                end_no=44310,
                next_no=44301,
            ),
        ]
    )
    db.flush()

    worker_result = dispatch_due_renewal_reminders(
        db,
        now=datetime(2026, 12, 15),
    )
    db.flush()

    assert worker_result["cards_assigned"] == 2
    assert free_result.term.card_no == 44101
    assert free_result.term.status == AnnualMembershipTermStatus.SCHEDULED.value
    assert paid_term.card_no == 44201
    assert paid_term.status == AnnualMembershipTermStatus.SCHEDULED.value
    assert due_result.term.card_no is None
    assert due_result.term.status == AnnualMembershipTermStatus.DUE.value
    assert free_member.card_year == 2026
    assert paid_member.card_year == 2026


def test_member_expired_account_can_renew_without_re_registration(client, db):
    org = _build_org(db, auto_approve=True, fee=Decimal("0.00"))
    member, _source = _build_member_and_source(
        db,
        org=org,
        year=2025,
        card_no=44001,
        member_status=MemberStatus.EXPIRED,
    )
    db.add(
        CardBatch(
            org_id=org.id,
            year=2026,
            start_no=45001,
            end_no=45010,
            next_no=45001,
        )
    )
    db.commit()

    login = client.post(
        "/api/auth/login",
        data={"email": member.email, "password": "Pass1234!"},
    )
    assert login.status_code == 200
    assert login.json()["authenticated"] is True

    response = client.post("/api/member/renewals")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["term"]["membership_year"] == 2026
    assert payload["term"]["card_no"] == 45001

    notifications = client.get("/api/member/notifications")
    assert notifications.status_code == 200
    notification = notifications.json()["items"][0]
    assert notification["type"] == "renewal"
    marked_read = client.patch(f"/api/member/notifications/{notification['id']}/read")
    assert marked_read.status_code == 200

    db.refresh(member)
    assert member.status == MemberStatus.ACTIVE
    assert member.card_year == 2026
    assert member.card_no == 45001
    quote = build_quote_center(db, org=org, year=2026)
    assert quote["items"][0]["payment_state"] == "not_required"


def test_v1_qr_overlap_keeps_both_years_valid_on_january_first(client, db, monkeypatch):
    org = _build_org(db)
    member, source = _build_member_and_source(db, org=org, year=2026, card_no=46001)
    future = AnnualMembershipTerm(
        member_id=member.id,
        org_id=org.id,
        membership_year=2027,
        starts_on=date(2027, 1, 1),
        valid_through=date(2028, 1, 1),
        status=AnnualMembershipTermStatus.SCHEDULED.value,
        fee_amount=Decimal("0.00"),
        currency="EUR",
        card_no=47001,
        card_year=2027,
        issued_at=datetime(2026, 12, 1),
        source="renewal",
    )
    db.add(future)
    db.flush()
    assert promote_renewal_term(db, term=future, now=datetime(2027, 1, 1, 12)) is True
    db.commit()

    old_token = build_card_verification_token(member.id, org.id, source.card_no, 2026)
    new_token = build_card_verification_token(member.id, org.id, future.card_no, 2027)

    class FrozenDateTime(datetime):
        current = datetime(2027, 1, 1, 12)

        @classmethod
        def utcnow(cls):
            return cls.current

    monkeypatch.setattr(public_routes, "datetime", FrozenDateTime)
    headers = {"accept": "application/json"}
    old_jan_1 = client.get(f"/api/cards/verify/{old_token}", headers=headers)
    new_jan_1 = client.get(f"/api/cards/verify/{new_token}", headers=headers)
    assert old_jan_1.status_code == 200 and old_jan_1.json()["valid"] is True
    assert new_jan_1.status_code == 200 and new_jan_1.json()["valid"] is True

    FrozenDateTime.current = datetime(2027, 1, 2, 0, 0, 1)
    old_jan_2 = client.get(f"/api/cards/verify/{old_token}", headers=headers)
    new_jan_2 = client.get(f"/api/cards/verify/{new_token}", headers=headers)
    assert old_jan_2.status_code == 200 and old_jan_2.json()["valid"] is False
    assert old_jan_2.json()["reason"] == "expired"
    assert new_jan_2.status_code == 200 and new_jan_2.json()["valid"] is True
