from __future__ import annotations

from datetime import datetime, timedelta
import uuid

import pytest

from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    Member,
    MemberAttendance,
    MemberStatus,
    MembershipType,
    OrgAdminToken,
    Organization,
)
from app.services.card_verification import build_card_verification_token
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_org_admin(client, db, *, org_id: int, suffix: str) -> AdminUser:
    admin = AdminUser(
        email=f"attendance-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org_id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    raw_token = f"attendance-admin-token-{suffix}"
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
    assert response.status_code == 302, response.text
    return admin


def _temporary_member(
    db,
    *,
    organization: Organization,
    suffix: str,
    first_name: str = "Tizio",
    last_name: str = "Caio",
    active: bool = True,
) -> Member:
    now = datetime.utcnow()
    member = Member(
        org_id=organization.id,
        first_name=first_name,
        last_name=last_name,
        email=f"attendance-member-{suffix}@example.com",
        status=MemberStatus.ACTIVE if active else MemberStatus.EXPIRED,
        card_no=700_000 + int(suffix[:5], 16),
        card_year=now.year,
        membership_type=MembershipType.TEMPORARY.value,
        valid_from=now - timedelta(hours=1),
        valid_until=now + timedelta(hours=6),
        joined_at=now - timedelta(hours=1),
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def _card_url(member: Member) -> str:
    token = build_card_verification_token(
        member_id=member.id,
        org_id=member.org_id,
        card_number=member.card_no,
        card_year=member.card_year,
    )
    return f"https://app.example.test/api/cards/verify/{token}?format=json"


def test_org_admin_qr_check_in_is_daily_idempotent_and_tenant_scoped(client, db):
    suffix = uuid.uuid4().hex[:8]
    organization = Organization(
        name=f"Attendance Club {suffix}",
        slug=f"attendance-club-{suffix}",
        is_active=True,
    )
    other_organization = Organization(
        name=f"Other Attendance Club {suffix}",
        slug=f"other-attendance-club-{suffix}",
        is_active=True,
    )
    db.add_all([organization, other_organization])
    db.commit()
    db.refresh(organization)
    db.refresh(other_organization)
    admin = _login_org_admin(
        client,
        db,
        org_id=organization.id,
        suffix=suffix,
    )
    member = _temporary_member(
        db,
        organization=organization,
        suffix=suffix,
    )

    first = client.post(
        "/api/org-admin/attendances/check-in",
        json={"qr_value": _card_url(member)},
    )
    assert first.status_code == 200, first.text
    assert first.json()["created"] is True
    assert first.json()["item"]["member_name"] == "Tizio Caio"
    assert first.json()["item"]["membership_type"] == MembershipType.TEMPORARY.value

    duplicate = client.post(
        "/api/org-admin/attendances/check-in",
        json={"qr_value": _card_url(member)},
    )
    assert duplicate.status_code == 200, duplicate.text
    assert duplicate.json()["created"] is False
    assert duplicate.json()["item"]["id"] == first.json()["item"]["id"]
    assert db.query(MemberAttendance).filter_by(member_id=member.id).count() == 1

    day = first.json()["item"]["attendance_date"]
    listing = client.get(
        "/api/org-admin/attendances",
        params={"day": day, "q": "Tizio"},
    )
    assert listing.status_code == 200, listing.text
    assert listing.json()["total"] == 1
    assert listing.json()["items"][0]["member_id"] == member.id

    attendance = db.query(MemberAttendance).filter_by(member_id=member.id).one()
    assert attendance.org_id == organization.id
    assert attendance.checked_in_by_admin_id == admin.id
    assert attendance.source == "qr"

    other_member = _temporary_member(
        db,
        organization=other_organization,
        suffix=uuid.uuid4().hex[:8],
        first_name="Altro",
        last_name="Club",
    )
    foreign = client.post(
        "/api/org-admin/attendances/check-in",
        json={"qr_value": _card_url(other_member)},
    )
    assert foreign.status_code == 404
    assert (
        db.query(MemberAttendance)
        .filter(MemberAttendance.member_id == other_member.id)
        .count()
        == 0
    )


def test_org_admin_qr_check_in_rejects_invalid_and_inactive_cards(client, db):
    suffix = uuid.uuid4().hex[:8]
    organization = Organization(
        name=f"Attendance Invalid Club {suffix}",
        slug=f"attendance-invalid-club-{suffix}",
        is_active=True,
    )
    db.add(organization)
    db.commit()
    db.refresh(organization)
    _login_org_admin(client, db, org_id=organization.id, suffix=suffix)

    invalid = client.post(
        "/api/org-admin/attendances/check-in",
        json={"qr_value": "https://app.example.test/api/cards/verify/not-a-valid-token"},
    )
    assert invalid.status_code == 404

    inactive_member = _temporary_member(
        db,
        organization=organization,
        suffix=uuid.uuid4().hex[:8],
        active=False,
    )
    inactive = client.post(
        "/api/org-admin/attendances/check-in",
        json={"qr_value": _card_url(inactive_member)},
    )
    assert inactive.status_code == 409
    assert inactive.json()["detail"] == "Tessera non attiva"
