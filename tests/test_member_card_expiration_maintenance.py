import uuid
from datetime import datetime, timedelta

import pytest

from app.db import SessionLocal
from app.models import AdminRole, AdminUser, Member, MemberStatus, OperationLog, OrgAdminToken, Organization
from app.security import get_password_hash
from app.services.card_verification import build_card_verification_token
from app.services.member_activity import is_member_active
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_org_admin(client, db, admin_id: int):
    token_str = f"expired-admin-{admin_id}-{uuid.uuid4().hex[:6]}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    res = client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)
    assert res.status_code == 302


def _create_expired_member(db, *, suffix: str) -> tuple[Organization, Member]:
    current_year = datetime.utcnow().year
    expired_year = current_year - 1

    org = Organization(
        name=f"Expired Org {suffix}",
        slug=f"expired-org-{suffix}",
        is_active=True,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    member = Member(
        org_id=org.id,
        first_name="Giulia",
        last_name="Neri",
        email=f"expired.member.{suffix}@example.com",
        phone="+390212345678",
        fiscal_code=f"FSC{suffix.upper()}",
        password_hash=get_password_hash("Pass1234!"),
        status=MemberStatus.ACTIVE,
        card_no=41000,
        card_year=expired_year,
        joined_at=datetime(expired_year, 5, 10),
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return org, member


def _member_status_value(member: Member) -> str:
    if isinstance(member.status, MemberStatus):
        return member.status.value
    return str(member.status)


def test_expired_card_blocks_login_and_qr_shows_scaduta(client, db):
    suffix = uuid.uuid4().hex[:8]
    org, member = _create_expired_member(db, suffix=suffix)

    assert is_member_active(member, now=datetime.utcnow()) is False

    login_res = client.post(
        "/api/auth/login",
        data={"email": member.email, "password": "Pass1234!"},
    )
    assert login_res.status_code == 403, login_res.text
    assert login_res.json()["detail"] == "account non attivo"

    token = build_card_verification_token(
        member_id=member.id,
        org_id=org.id,
        card_number=member.card_no,
        card_year=member.card_year,
    )

    verify_json_res = client.get(f"/api/cards/verify/{token}?format=json")
    assert verify_json_res.status_code == 200, verify_json_res.text
    verify_json = verify_json_res.json()
    assert verify_json["valid"] is False
    assert verify_json["card"]["status"] == "non_attiva"
    assert verify_json["reason"] == "expired"

    verify_html_res = client.get(
        f"/api/cards/verify/{token}",
        headers={"Accept": "text/html"},
    )
    assert verify_html_res.status_code == 200, verify_html_res.text
    assert "TESSERA NON ATTIVA" in verify_html_res.text
    assert "Motivo: Scaduta" in verify_html_res.text


def test_maintenance_expire_and_purge_updates_member_and_hides_from_admin_lists(client, db):
    suffix = uuid.uuid4().hex[:8]
    org, member = _create_expired_member(db, suffix=suffix)

    org_admin = AdminUser(
        email=f"expired.orgadmin.{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(org_admin)
    db.commit()
    db.refresh(org_admin)

    client.post("/api/super-admin/auth/logout")
    super_admin_login = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )
    assert super_admin_login.status_code == 200, super_admin_login.text

    maintenance_res = client.post("/api/super-admin/maintenance/run", json={"purge_pii": True})
    assert maintenance_res.status_code == 200, maintenance_res.text
    maintenance_payload = maintenance_res.json()
    assert maintenance_payload["ok"] is True
    assert maintenance_payload["expired_count"] >= 1
    assert member.id in maintenance_payload["member_ids"]

    db.refresh(member)
    assert member.deleted_at is not None
    assert member.expired_at is not None
    assert member.purged_at is not None
    assert _member_status_value(member) == MemberStatus.EXPIRED.value
    assert member.email is None
    assert member.phone is None
    assert member.fiscal_code is None
    assert member.password_hash is None
    assert member.first_name == "EXPIRED"
    assert member.last_name == "MEMBER"

    detail_res = client.get(f"/api/super-admin/members/{member.id}")
    assert detail_res.status_code == 404

    auto_expire_log = (
        db.query(OperationLog)
        .filter(OperationLog.action == "auto_expire_members")
        .order_by(OperationLog.id.desc())
        .first()
    )
    assert auto_expire_log is not None

    _login_org_admin(client, db, org_admin.id)
    active_members_res = client.get("/api/org-admin/members?status=active")
    assert active_members_res.status_code == 200, active_members_res.text
    active_ids = [item["id"] for item in active_members_res.json()["items"]]
    assert member.id not in active_ids
