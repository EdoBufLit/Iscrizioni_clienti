import uuid
from datetime import datetime, timedelta

import pytest

from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    CardBatch,
    IntegrationApiKey,
    Member,
    MemberStatus,
    OperationLog,
    OrgAdminToken,
    Organization,
)
from app.security import get_password_hash, hash_api_key
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
    assert member.card_no is None

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


def test_maintenance_frees_email_and_card_number_for_new_issue(client, db):
    suffix = uuid.uuid4().hex[:8]
    current_year = datetime.utcnow().year
    expired_year = current_year - 1
    reused_email = f"expired.reuse.{suffix}@example.com"

    org = Organization(
        name=f"Reuse Org {suffix}",
        slug=f"reuse-org-{suffix}",
        is_active=True,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    batch = CardBatch(
        org_id=org.id,
        start_no=52000,
        end_no=52020,
        next_no=52021,
    )
    db.add(batch)
    db.commit()

    expired_member = Member(
        org_id=org.id,
        first_name="Old",
        last_name="Member",
        email=reused_email,
        status=MemberStatus.ACTIVE,
        card_no=52000,
        card_year=expired_year,
        external_customer_id=f"email:{reused_email}",
    )
    db.add(expired_member)

    raw_key = f"pk_test_reuse_{uuid.uuid4().hex}"
    integration_key = IntegrationApiKey(
        org_id=org.id,
        name="pienissimo",
        key_hash=hash_api_key(raw_key),
        scopes=["issue_member"],
        is_active=True,
    )
    db.add(integration_key)
    db.commit()
    db.refresh(expired_member)

    client.post("/api/super-admin/auth/logout")
    login_res = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )
    assert login_res.status_code == 200, login_res.text

    maintenance_res = client.post("/api/super-admin/maintenance/run", json={"purge_pii": True})
    assert maintenance_res.status_code == 200, maintenance_res.text

    db.refresh(expired_member)
    assert expired_member.deleted_at is not None
    assert expired_member.card_no is None

    reissue_res = client.post(
        "/api/integrations/members/issue",
        json={
            "org_slug": org.slug,
            "external_customer_id": f"email:{reused_email}",
            "email": reused_email,
            "first_name": "New",
            "last_name": "Member",
            "send_email": False,
        },
        headers={"X-ASSONAM-API-KEY": raw_key},
    )
    assert reissue_res.status_code == 200, reissue_res.text
    reissue_payload = reissue_res.json()
    assert reissue_payload["card_number"] == 52000
