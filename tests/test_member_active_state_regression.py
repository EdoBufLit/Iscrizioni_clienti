import uuid
from datetime import datetime, timedelta
from urllib.parse import urlsplit

import pytest
from sqlalchemy import func

from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    CardBatch,
    IntegrationApiKey,
    Member,
    OrgAdminToken,
    Organization,
    Token,
    TokenType,
)
from app.security import hash_api_key
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_org_admin(client, db, admin_id: int):
    token_str = f"active-regression-admin-{admin_id}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    res = client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)
    assert res.status_code == 302


def test_deleted_member_is_inactive_everywhere(client, db):
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Regression Org {suffix}",
        slug=f"regression-org-{suffix}",
        is_active=True,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    max_end_no = db.query(func.max(CardBatch.end_no)).scalar() or 30000
    batch_start = int(max_end_no) + 200
    batch = CardBatch(
        org_id=org.id,
        start_no=batch_start,
        end_no=batch_start + 30,
        next_no=batch_start,
    )
    db.add(batch)
    db.commit()

    admin = AdminUser(
        email=f"regression-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    _login_org_admin(client, db, admin.id)

    raw_key = f"pk_test_{uuid.uuid4().hex}"
    integration_key = IntegrationApiKey(
        org_id=org.id,
        name="pienissimo",
        key_hash=hash_api_key(raw_key),
        scopes=["issue_member"],
        is_active=True,
    )
    db.add(integration_key)
    db.commit()

    member_email = f"qr.regression.{suffix}@example.com"
    issue_res = client.post(
        "/api/integrations/members/issue",
        json={
            "org_slug": org.slug,
            "external_customer_id": f"ext-{suffix}",
            "email": member_email,
            "first_name": "Pienissimo",
            "last_name": "Member",
            "send_email": False,
        },
        headers={"X-ASSONAM-API-KEY": raw_key},
    )
    assert issue_res.status_code == 200, issue_res.text
    issue_data = issue_res.json()

    member = db.query(Member).filter(Member.id == issue_data["member_id"]).first()
    assert member is not None
    assert member.deleted_at is None

    stock_before_delete = client.get("/api/org-admin/cards")
    assert stock_before_delete.status_code == 200, stock_before_delete.text
    assert stock_before_delete.json()["used"] == 1

    token_str = f"old-member-token-{suffix}"
    old_magic_link = Token(
        member_id=member.id,
        purpose=TokenType.LOGIN_MAGIC_LINK,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(old_magic_link)
    db.commit()

    delete_res = client.delete(f"/api/org-admin/members/{member.id}")
    assert delete_res.status_code == 200, delete_res.text

    db.refresh(member)
    assert member.deleted_at is not None
    assert member.email is None
    assert member.external_customer_id is None
    assert member.card_no is None

    login_res = client.post("/api/auth/login", data={"email": member_email})
    assert login_res.status_code == 200, login_res.text
    assert login_res.json()["status"] == "ok"

    verify_magic_link_res = client.get(f"/member/auth?token={token_str}", follow_redirects=False)
    assert verify_magic_link_res.status_code == 403, verify_magic_link_res.text
    assert verify_magic_link_res.json()["detail"] == "account non attivo"

    verify_path = urlsplit(issue_data["card_verification_url"]).path

    qr_json_res = client.get(f"{verify_path}?format=json")
    assert qr_json_res.status_code == 200, qr_json_res.text
    qr_json = qr_json_res.json()
    assert qr_json["valid"] is False
    assert qr_json["card"]["status"] == "non_attiva"
    assert qr_json["reason"] == "deleted"

    qr_html_res = client.get(
        verify_path,
        headers={"Accept": "text/html"},
    )
    assert qr_html_res.status_code == 200, qr_html_res.text
    assert "TESSERA NON ATTIVA" in qr_html_res.text
    assert "Motivo: Eliminata" in qr_html_res.text

    active_list_res = client.get("/api/org-admin/members?status=active")
    assert active_list_res.status_code == 200, active_list_res.text
    active_ids = [item["id"] for item in active_list_res.json()["items"]]
    assert member.id not in active_ids

    export_csv_res = client.get("/api/org-admin/members.csv")
    assert export_csv_res.status_code == 200, export_csv_res.text
    assert member_email not in export_csv_res.text

    stock_after_delete = client.get("/api/org-admin/cards")
    assert stock_after_delete.status_code == 200, stock_after_delete.text
    assert stock_after_delete.json()["used"] == 0

    metrics_after_delete = client.get("/api/org-admin/metrics")
    assert metrics_after_delete.status_code == 200, metrics_after_delete.text
    assert metrics_after_delete.json()["cards_used"] == 0

    reissue_res = client.post(
        "/api/integrations/members/issue",
        json={
            "org_slug": org.slug,
            "external_customer_id": f"ext-{suffix}",
            "email": member_email,
            "first_name": "Nuovo",
            "last_name": "Socio",
            "send_email": False,
        },
        headers={"X-ASSONAM-API-KEY": raw_key},
    )
    assert reissue_res.status_code == 200, reissue_res.text
    reissue_data = reissue_res.json()
    assert reissue_data["card_number"] == issue_data["card_number"]
