from __future__ import annotations

from datetime import datetime, timedelta
from urllib.parse import urlparse
import uuid

import pytest

from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    AttendanceStation,
    Member,
    MemberAttendance,
    MemberStatus,
    MembershipType,
    OrgAdminToken,
    Organization,
)
from app.routes.attendance_stations import ATTENDANCE_STATION_COOKIE
from app.services.card_verification import build_card_verification_token
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _organization(db, *, suffix: str, name: str = "Station Club") -> Organization:
    organization = Organization(
        name=f"{name} {suffix}",
        slug=f"{name.lower().replace(' ', '-')}-{suffix}",
        is_active=True,
    )
    db.add(organization)
    db.commit()
    db.refresh(organization)
    return organization


def _login_org_admin(client, db, *, org_id: int, suffix: str) -> AdminUser:
    admin = AdminUser(
        email=f"station-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org_id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    raw_token = f"station-admin-token-{suffix}"
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
    active: bool = True,
) -> Member:
    now = datetime.utcnow()
    member = Member(
        org_id=organization.id,
        first_name="Tizio",
        last_name=f"Station {suffix[:4]}",
        email=f"station-member-{suffix}@example.com",
        status=MemberStatus.ACTIVE if active else MemberStatus.EXPIRED,
        card_no=800_000 + int(suffix[:5], 16),
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
    return f"https://assonam.it/api/cards/verify/{token}"


def _create_station(client, name: str = "Tablet reception") -> dict:
    response = client.post(
        "/api/org-admin/attendance-stations",
        json={"name": name},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["pairing_qr_data_url"].startswith("data:image/png;base64,")
    return payload


def _pair_station(client, pairing_url: str):
    pairing_path = urlparse(pairing_url).path
    response = client.get(pairing_path, follow_redirects=False)
    assert response.status_code == 303, response.text
    assert response.headers["location"] == "/scanner-presenze"
    assert "HttpOnly" in response.headers["set-cookie"]
    return pairing_path


def test_station_pairing_check_in_is_scoped_idempotent_and_auditable(client, db):
    client.cookies.clear()
    suffix = uuid.uuid4().hex[:8]
    organization = _organization(db, suffix=suffix)
    other_organization = _organization(
        db,
        suffix=uuid.uuid4().hex[:8],
        name="Other Station Club",
    )
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
    admin_first_member = _temporary_member(
        db,
        organization=organization,
        suffix=uuid.uuid4().hex[:8],
    )
    inactive_member = _temporary_member(
        db,
        organization=organization,
        suffix=uuid.uuid4().hex[:8],
        active=False,
    )
    foreign_member = _temporary_member(
        db,
        organization=other_organization,
        suffix=uuid.uuid4().hex[:8],
    )

    created_station = _create_station(client)
    station_id = created_station["station"]["id"]
    pairing_path = urlparse(created_station["pairing_url"]).path
    raw_pairing_token = pairing_path.rsplit("/", 1)[-1]
    station = db.query(AttendanceStation).filter_by(id=station_id).one()
    assert station.org_id == organization.id
    assert station.created_by_admin_id == admin.id
    assert station.pairing_token_hash == hash_token(raw_pairing_token)
    assert raw_pairing_token not in (station.pairing_token_hash or "")

    admin_first = client.post(
        "/api/org-admin/attendances/check-in",
        json={"qr_value": _card_url(admin_first_member)},
    )
    assert admin_first.status_code == 200, admin_first.text
    assert admin_first.json()["created"] is True

    client.cookies.clear()
    _pair_station(client, created_station["pairing_url"])
    assert client.cookies.get(ATTENDANCE_STATION_COOKIE)

    db.expire_all()
    station = db.query(AttendanceStation).filter_by(id=station_id).one()
    assert station.credential_hash
    assert station.pairing_token_hash is None
    assert station.pairing_expires_at is None
    assert station.paired_at is not None

    session = client.get("/api/attendance-stations/session")
    assert session.status_code == 200, session.text
    assert session.json()["station"]["id"] == station_id
    assert session.json()["organization"]["name"].startswith("Station Club")

    first = client.post(
        "/api/attendance-stations/check-in",
        json={"qr_value": _card_url(member)},
    )
    assert first.status_code == 200, first.text
    assert first.json()["created"] is True
    assert first.json()["item"]["source"] == "qr_station"
    assert first.json()["item"]["scanner_station_id"] == station_id
    assert first.json()["item"]["scanner_station_name"] == "Tablet reception"

    duplicate = client.post(
        "/api/attendance-stations/check-in",
        json={"qr_value": _card_url(member)},
    )
    assert duplicate.status_code == 200, duplicate.text
    assert duplicate.json()["created"] is False
    assert duplicate.json()["item"]["id"] == first.json()["item"]["id"]

    duplicate_after_admin = client.post(
        "/api/attendance-stations/check-in",
        json={"qr_value": _card_url(admin_first_member)},
    )
    assert duplicate_after_admin.status_code == 200, duplicate_after_admin.text
    assert duplicate_after_admin.json()["created"] is False
    assert duplicate_after_admin.json()["item"]["source"] == "qr"
    assert duplicate_after_admin.json()["item"]["scanner_station_id"] is None

    inactive = client.post(
        "/api/attendance-stations/check-in",
        json={"qr_value": _card_url(inactive_member)},
    )
    assert inactive.status_code == 409
    assert inactive.json()["detail"] == "Tessera non attiva"

    foreign = client.post(
        "/api/attendance-stations/check-in",
        json={"qr_value": _card_url(foreign_member)},
    )
    assert foreign.status_code == 404

    db.expire_all()
    attendance = db.query(MemberAttendance).filter_by(member_id=member.id).one()
    assert attendance.checked_in_by_admin_id is None
    assert attendance.scanner_station_id == station_id
    assert attendance.source == "qr_station"
    assert (
        db.query(MemberAttendance)
        .filter_by(member_id=foreign_member.id)
        .count()
        == 0
    )
    client.cookies.clear()


def test_pairing_is_single_use_and_relink_invalidates_the_old_device(client, db):
    client.cookies.clear()
    suffix = uuid.uuid4().hex[:8]
    organization = _organization(db, suffix=suffix)
    _login_org_admin(client, db, org_id=organization.id, suffix=suffix)
    member = _temporary_member(db, organization=organization, suffix=suffix)
    created_station = _create_station(client, "Ingresso principale")
    station_id = created_station["station"]["id"]

    client.cookies.clear()
    pairing_path = _pair_station(client, created_station["pairing_url"])
    old_credential = client.cookies.get(ATTENDANCE_STATION_COOKIE)
    reused = client.get(pairing_path, follow_redirects=False)
    assert reused.status_code == 410

    _login_org_admin(
        client,
        db,
        org_id=organization.id,
        suffix=uuid.uuid4().hex[:8],
    )
    rotated = client.post(
        f"/api/org-admin/attendance-stations/{station_id}/pairing"
    )
    assert rotated.status_code == 200, rotated.text
    assert rotated.json()["station"]["status"] == "pending_pairing"

    client.cookies.set(ATTENDANCE_STATION_COOKIE, old_credential)
    rejected_old_device = client.post(
        "/api/attendance-stations/check-in",
        json={"qr_value": _card_url(member)},
    )
    assert rejected_old_device.status_code == 401

    client.cookies.clear()
    _pair_station(client, rotated.json()["pairing_url"])
    accepted_new_device = client.post(
        "/api/attendance-stations/check-in",
        json={"qr_value": _card_url(member)},
    )
    assert accepted_new_device.status_code == 200, accepted_new_device.text
    assert accepted_new_device.json()["created"] is True
    client.cookies.clear()


def test_revoked_expired_and_cross_origin_station_credentials_are_rejected(
    client,
    db,
):
    client.cookies.clear()
    suffix = uuid.uuid4().hex[:8]
    organization = _organization(db, suffix=suffix)
    _login_org_admin(client, db, org_id=organization.id, suffix=suffix)
    member = _temporary_member(db, organization=organization, suffix=suffix)
    created_station = _create_station(client, "Reception revocabile")
    station_id = created_station["station"]["id"]

    client.cookies.clear()
    _pair_station(client, created_station["pairing_url"])
    blocked_csrf = client.post(
        "/api/attendance-stations/check-in",
        json={"qr_value": _card_url(member)},
        headers={"Origin": "https://evil.example"},
    )
    assert blocked_csrf.status_code == 403

    _login_org_admin(
        client,
        db,
        org_id=organization.id,
        suffix=uuid.uuid4().hex[:8],
    )
    revoked = client.post(
        f"/api/org-admin/attendance-stations/{station_id}/revoke"
    )
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["station"]["status"] == "revoked"
    rejected = client.post(
        "/api/attendance-stations/check-in",
        json={"qr_value": _card_url(member)},
    )
    assert rejected.status_code == 401

    new_station = _create_station(client, "Link scaduto")
    new_station_row = (
        db.query(AttendanceStation)
        .filter_by(id=new_station["station"]["id"])
        .one()
    )
    new_station_row.pairing_expires_at = datetime.utcnow() - timedelta(seconds=1)
    db.commit()
    client.cookies.clear()
    expired = client.get(
        urlparse(new_station["pairing_url"]).path,
        follow_redirects=False,
    )
    assert expired.status_code == 410
    client.cookies.clear()


def test_public_card_verification_remains_read_only(client, db):
    client.cookies.clear()
    suffix = uuid.uuid4().hex[:8]
    organization = _organization(db, suffix=suffix)
    member = _temporary_member(db, organization=organization, suffix=suffix)

    verified = client.get(_card_url(member))
    assert verified.status_code == 200, verified.text
    assert verified.json()["valid"] is True
    assert db.query(MemberAttendance).filter_by(member_id=member.id).count() == 0
    client.cookies.clear()
