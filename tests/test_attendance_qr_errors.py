"""Both scanner endpoints explain rejected cards without exposing other tenants."""

from datetime import datetime, timedelta
from urllib.parse import urlparse
import uuid

import pytest

from app.db import SessionLocal
from app.models import AdminRole, AdminUser, Member, MemberAttendance, MemberStatus, OrgAdminToken, Organization
from app.services.card_verification import build_card_verification_token
from app.utils import hash_token


@pytest.fixture(params=["org_admin", "station"])
def scanner_case(client, request):
    client.cookies.clear()
    db = SessionLocal()
    suffix = uuid.uuid4().hex
    org = Organization(name="Scanner QA", slug=f"scanner-qa-{suffix}", is_active=True)
    foreign_org = Organization(name="Private Foreign Club", slug=f"scanner-foreign-{suffix}", is_active=True)
    db.add_all([org, foreign_org])
    db.flush()
    admin = AdminUser(email=f"scanner-{suffix}@example.test", role=AdminRole.ORG_ADMIN, org_id=org.id, is_active=True)
    db.add(admin)
    db.flush()
    raw_token = f"scanner-{suffix}"
    db.add(OrgAdminToken(admin_id=admin.id, token_hash=hash_token(raw_token), expires_at=datetime.utcnow() + timedelta(minutes=15)))
    db.commit()
    assert client.get(f"/api/org-admin/auth/verify?token={raw_token}", follow_redirects=False).status_code == 302
    endpoint = "/api/org-admin/attendances/check-in"
    if request.param == "station":
        station = client.post("/api/org-admin/attendance-stations", json={"name": "QA scanner"})
        assert station.status_code == 200, station.text
        client.cookies.clear()
        assert client.get(urlparse(station.json()["pairing_url"]).path, follow_redirects=False).status_code == 303
        endpoint = "/api/attendance-stations/check-in"
    try:
        yield client, db, org, foreign_org, endpoint
    finally:
        client.cookies.clear()
        db.close()


@pytest.mark.parametrize("scenario,expected_status,expected_message", [
    ("external", 404, "QR non valido o non emesso da ASSONAM"),
    ("invalid_signature", 404, "QR non valido o non emesso da ASSONAM"),
    ("foreign", 404, "Tessera di un’altra associazione"),
    ("missing_member", 404, "Tessera non trovata"),
    ("missing_card", 409, "Tessera non trovata"),
    ("deleted", 409, "Tessera non trovata"),
    ("expired_by_date", 409, "Tessera scaduta"),
    ("expired_by_status", 409, "Tessera scaduta"),
    ("not_approved", 409, "Tessera non ancora attiva o non approvata"),
])
def test_scanner_rejections_have_distinct_safe_messages(scanner_case, scenario, expected_status, expected_message):
    client, db, org, foreign_org, endpoint = scanner_case
    now = datetime.utcnow()
    member = Member(
        org_id=foreign_org.id if scenario == "foreign" else org.id,
        first_name="Private", last_name="Member", email=f"private-member-{org.id}@example.test",
        status=MemberStatus.ACTIVE, card_no=900_000_000 + org.id,
        card_year=now.year, membership_type="temporary",
        valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=1),
    )
    if scenario == "deleted":
        member.deleted_at = now
    elif scenario == "expired_by_date":
        member.valid_until = now - timedelta(hours=1)
    elif scenario == "expired_by_status":
        member.status = MemberStatus.EXPIRED
    elif scenario == "not_approved":
        member.status = MemberStatus.PENDING_VERIFICATION
    db.add(member)
    db.commit()
    token = build_card_verification_token(
        member.id + 1_000_000 if scenario == "missing_member" else member.id,
        member.org_id,
        member.card_no + 1 if scenario == "missing_card" else member.card_no,
        member.card_year,
    )
    if scenario == "invalid_signature":
        # Keep the recognizable URL and payload but invalidate its signature.
        token = token.rsplit(".", 1)[0] + ".invalid"
    value = "https://example.test/menu" if scenario == "external" else f"https://assonam.it/api/cards/verify/{token}"
    response = client.post(endpoint, json={"qr_value": value})
    assert response.status_code == expected_status, response.text
    assert response.json()["detail"] == expected_message
    assert response.json()["message"] == expected_message
    assert "Private" not in response.text
    assert member.email not in response.text
    assert db.query(MemberAttendance).filter(MemberAttendance.org_id.in_([org.id, foreign_org.id])).count() == 0
