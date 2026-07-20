import uuid
from datetime import date, datetime, timedelta

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    AnnualMembershipTermStatus,
    Member,
    MemberStatus,
    OperationLog,
    OrgAdminToken,
    Organization,
)
from app.services.annual_memberships import sync_annual_membership_term
from app.services.fiscal_code import calculate_fiscal_code
from app.utils import clear_captured_emails, get_captured_emails, hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_org_admin(client, db, admin_id: int):
    token_str = f"profile-card-token-{admin_id}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)


def test_org_admin_can_update_member_profile_and_audit_fields(client, db):
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Profile Org {suffix}",
        slug=f"profile-org-{suffix}",
        is_active=True,
        custom_membership_types_enabled=True,
        membership_fee_amount=30,
        temporary_membership_fee_amount=12,
        temporary_membership_duration_value=2,
        temporary_membership_duration_unit="days",
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    admin = AdminUser(
        email=f"profile-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    member = Member(
        org_id=org.id,
        first_name="Mario",
        last_name="Rossi",
        email=f"mario-{suffix}@example.com",
        status=MemberStatus.ACTIVE,
        membership_type="annual",
        card_no=8300,
        card_year=datetime.utcnow().year,
        joined_at=datetime.utcnow(),
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    annual_term = sync_annual_membership_term(db, member, source="profile-test")
    db.commit()
    assert annual_term is not None

    _login_org_admin(client, db, admin.id)

    fiscal_code = calculate_fiscal_code(
        first_name="Marco",
        last_name="Bianchi",
        birth_date=date(1990, 5, 12),
        gender="M",
        birth_place_code="H501",
    )
    payload = {
        "first_name": "Marco",
        "last_name": "Bianchi",
        "email": f"marco-{suffix}@example.com",
        "phone": "+39 333 1234567",
        "birth_date": "1990-05-12",
        "birth_place": "Roma",
        "birth_place_code": "H501",
        "fiscal_code": fiscal_code,
        "membership_type": "temporary",
        "membership_fee_snapshot": 18,
        "internal_notes": "Correzione anagrafica da org admin",
    }

    res = client.patch(f"/api/org-admin/members/{member.id}/profile", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["first_name"] == "Marco"
    assert data["last_name"] == "Bianchi"
    assert data["email"] == payload["email"]
    assert data["birth_place"] == "Roma"
    assert data["fiscal_code"] == fiscal_code
    assert data["membership_type"] == "temporary"
    assert data["membership_fee_snapshot"] == 18.0
    assert data["valid_until"] is not None

    db.refresh(member)
    assert member.first_name == "Marco"
    assert member.last_name == "Bianchi"
    assert member.email == payload["email"]
    assert member.internal_notes == payload["internal_notes"]
    assert member.membership_type == "temporary"
    assert float(member.membership_fee_snapshot) == 18.0
    assert member.valid_until is not None
    db.refresh(annual_term)
    assert annual_term.status == AnnualMembershipTermStatus.CANCELLED.value

    audit_row = (
        db.query(OperationLog)
        .filter(
            OperationLog.action == "member.update",
            OperationLog.entity_type == "member",
            OperationLog.entity_id == member.id,
        )
        .order_by(OperationLog.id.desc())
        .first()
    )
    assert audit_row is not None
    assert audit_row.actor_admin_id == admin.id
    changed_fields = audit_row.metadata_json.get("fields") or []
    assert "first_name" in changed_fields
    assert "email" in changed_fields
    assert "fiscal_code" in changed_fields
    assert "membership_type" in changed_fields
    assert "membership_fee_snapshot" in changed_fields


def test_org_admin_profile_update_rejects_duplicate_email_and_other_org_access(client, db):
    suffix = uuid.uuid4().hex[:8]
    org = Organization(name=f"Profile Org A {suffix}", slug=f"profile-org-a-{suffix}", is_active=True)
    other_org = Organization(name=f"Profile Org B {suffix}", slug=f"profile-org-b-{suffix}", is_active=True)
    db.add_all([org, other_org])
    db.commit()
    db.refresh(org)
    db.refresh(other_org)

    admin = AdminUser(
        email=f"profile-admin-a-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    member = Member(
        org_id=org.id,
        first_name="Giulia",
        last_name="Neri",
        email=f"giulia-{suffix}@example.com",
        status=MemberStatus.PENDING_DOCS,
    )
    duplicate_member = Member(
        org_id=org.id,
        first_name="Laura",
        last_name="Verdi",
        email=f"duplicate-{suffix}@example.com",
        status=MemberStatus.ACTIVE,
        card_no=8100,
        card_year=datetime.utcnow().year,
        joined_at=datetime.utcnow(),
    )
    foreign_member = Member(
        org_id=other_org.id,
        first_name="Other",
        last_name="Org",
        email=f"other-{suffix}@example.com",
        status=MemberStatus.ACTIVE,
        card_no=8200,
        card_year=datetime.utcnow().year,
        joined_at=datetime.utcnow(),
    )
    db.add_all([member, duplicate_member, foreign_member])
    db.commit()
    db.refresh(member)
    db.refresh(foreign_member)

    _login_org_admin(client, db, admin.id)

    duplicate_res = client.patch(
        f"/api/org-admin/members/{member.id}/profile",
        json={
            "first_name": "Giulia",
            "last_name": "Neri",
            "email": duplicate_member.email,
            "birth_place": "Roma",
            "birth_place_code": "H501",
        },
    )
    assert duplicate_res.status_code == 409

    forbidden_res = client.patch(
        f"/api/org-admin/members/{foreign_member.id}/profile",
        json={
            "first_name": "Other",
            "last_name": "Org",
            "email": foreign_member.email,
            "birth_place": "Roma",
            "birth_place_code": "H501",
        },
    )
    assert forbidden_res.status_code == 404


def test_org_admin_card_email_and_pdf_are_scoped_and_work(client, db, drain_email_outbox):
    previous_email_mode = settings.EMAIL_MODE
    settings.EMAIL_MODE = "test"
    clear_captured_emails()
    try:
        suffix = uuid.uuid4().hex[:8]
        org = Organization(name=f"Card Org {suffix}", slug=f"card-org-{suffix}", is_active=True)
        org.card_email_subject = f"owner-{suffix}@example.com"
        other_org = Organization(name=f"Card Other Org {suffix}", slug=f"card-other-org-{suffix}", is_active=True)
        db.add_all([org, other_org])
        db.commit()
        db.refresh(org)
        db.refresh(other_org)

        admin = AdminUser(
            email=f"card-admin-{suffix}@example.com",
            role=AdminRole.ORG_ADMIN,
            org_id=org.id,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

        member = Member(
            org_id=org.id,
            first_name="Paolo",
            last_name="Blu",
            email=f"paolo-{suffix}@example.com",
            status=MemberStatus.ACTIVE,
            card_no=9300,
            card_year=datetime.utcnow().year,
            joined_at=datetime.utcnow(),
        )
        foreign_member = Member(
            org_id=other_org.id,
            first_name="Luca",
            last_name="Altro",
            email=f"luca-{suffix}@example.com",
            status=MemberStatus.ACTIVE,
            card_no=9400,
            card_year=datetime.utcnow().year,
            joined_at=datetime.utcnow(),
        )
        db.add_all([member, foreign_member])
        db.commit()
        db.refresh(member)
        db.refresh(foreign_member)

        _login_org_admin(client, db, admin.id)

        email_res = client.post(f"/api/org-admin/members/{member.id}/card-email")
        assert email_res.status_code == 200, email_res.text
        email_payload = email_res.json()
        assert email_payload["ok"] is True
        assert email_payload["queued"] is True
        assert email_payload["outbox_id"]

        second_email_res = client.post(f"/api/org-admin/members/{member.id}/card-email")
        assert second_email_res.status_code == 200, second_email_res.text
        second_email_payload = second_email_res.json()
        assert second_email_payload["ok"] is True
        assert second_email_payload["queued"] is True
        assert second_email_payload["outbox_id"]
        assert second_email_payload["outbox_id"] != email_payload["outbox_id"]

        drain_email_outbox()
        captured = get_captured_emails()
        assert len(captured) == 2
        assert [item["to"] for item in captured] == [member.email, member.email]
        assert [item["subject"] for item in captured] == [
            f"La tua tessera {org.name}",
            f"La tua tessera {org.name}",
        ]

        pdf_res = client.get(f"/api/org-admin/members/{member.id}/card.pdf")
        assert pdf_res.status_code == 200, pdf_res.text
        assert pdf_res.headers["content-type"].startswith("application/pdf")
        assert pdf_res.content.startswith(b"%PDF")

        forbidden_res = client.post(f"/api/org-admin/members/{foreign_member.id}/card-email")
        assert forbidden_res.status_code == 404

        forbidden_pdf_res = client.get(f"/api/org-admin/members/{foreign_member.id}/card.pdf")
        assert forbidden_pdf_res.status_code == 404
    finally:
        settings.EMAIL_MODE = previous_email_mode
        clear_captured_emails()
