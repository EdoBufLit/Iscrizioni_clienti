import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, text

from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    CardBatch,
    IntegrationApiKey,
    Member,
    MemberStatus,
    OrgAdminToken,
    Organization,
)
from app.security import hash_api_key
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _ensure_org(db, slug: str) -> Organization:
    org = db.query(Organization).filter_by(slug=slug).first()
    if org:
        return org

    org = Organization(
        name=f"Org {slug}",
        slug=slug,
        is_active=True,
        privacy_version="v1",
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _ensure_card_batch(db, org_id: int) -> CardBatch:
    existing = db.query(CardBatch).filter(CardBatch.org_id == org_id).order_by(CardBatch.id.desc()).first()
    if existing:
        return existing

    max_end_no = db.query(func.max(CardBatch.end_no)).scalar() or 10000
    start_no = int(max_end_no) + 50
    batch = CardBatch(
        org_id=org_id,
        start_no=start_no,
        end_no=start_no + 100,
        next_no=start_no,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def _login_super_admin(client):
    client.post("/api/super-admin/auth/logout")
    response = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )
    assert response.status_code == 200, response.text


def _ensure_org_admin(db, org_id: int, email: str) -> AdminUser:
    admin = db.query(AdminUser).filter(AdminUser.email == email).first()
    if admin:
        return admin

    admin = AdminUser(
        email=email,
        role=AdminRole.ORG_ADMIN,
        org_id=org_id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


def _login_org_admin(client, db, admin_id: int):
    token_str = f"org-admin-integration-{admin_id}-{uuid.uuid4().hex[:8]}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)


def test_super_admin_create_and_list_integration_keys(client, db):
    org = _ensure_org(db, f"super-integration-{uuid.uuid4().hex[:8]}")
    _login_super_admin(client)

    create_response = client.post(
        f"/api/super-admin/orgs/{org.id}/integration-keys",
        json={"name": "pienissimo", "scopes": ["issue_member"]},
    )
    assert create_response.status_code == 200, create_response.text

    payload = create_response.json()
    assert payload["id"] > 0
    assert payload["raw_key"]
    assert payload["created_at"]

    db_key = db.query(IntegrationApiKey).filter(IntegrationApiKey.id == payload["id"]).first()
    assert db_key is not None
    assert db_key.org_id == org.id
    assert db_key.key_hash == hash_api_key(payload["raw_key"])
    assert db_key.key_hash != payload["raw_key"]

    list_response = client.get(f"/api/super-admin/orgs/{org.id}/integration-keys?name=pienissimo")
    assert list_response.status_code == 200, list_response.text
    items = list_response.json()["items"]
    assert len(items) >= 1
    first = items[0]
    assert "raw_key" not in first
    assert "key_hash" not in first
    assert first["name"] == "pienissimo"


def test_super_admin_rotate_and_disable_integration_key(client, db):
    org = _ensure_org(db, f"super-integration-rotate-{uuid.uuid4().hex[:8]}")
    _login_super_admin(client)

    create_response = client.post(
        f"/api/super-admin/orgs/{org.id}/integration-keys",
        json={"name": "pienissimo", "scopes": ["issue_member"]},
    )
    assert create_response.status_code == 200, create_response.text
    old_key_id = create_response.json()["id"]

    rotate_response = client.post(
        f"/api/super-admin/orgs/{org.id}/integration-keys/{old_key_id}/rotate"
    )
    assert rotate_response.status_code == 200, rotate_response.text
    rotate_payload = rotate_response.json()

    assert rotate_payload["id"] != old_key_id
    assert rotate_payload["replaced_key_id"] == old_key_id
    assert rotate_payload["raw_key"]

    old_key = db.query(IntegrationApiKey).filter(IntegrationApiKey.id == old_key_id).first()
    new_key = db.query(IntegrationApiKey).filter(IntegrationApiKey.id == rotate_payload["id"]).first()
    assert old_key is not None and new_key is not None
    assert old_key.is_active is False
    assert new_key.is_active is True

    disable_response = client.delete(
        f"/api/super-admin/orgs/{org.id}/integration-keys/{new_key.id}"
    )
    assert disable_response.status_code == 200, disable_response.text
    assert disable_response.json()["is_active"] is False

    db.refresh(new_key)
    assert new_key.is_active is False


def test_org_admin_cannot_manage_integration_keys(client, db):
    org = _ensure_org(db, f"org-admin-no-keys-{uuid.uuid4().hex[:8]}")
    org_admin = _ensure_org_admin(db, org.id, f"orgadmin.keys.{uuid.uuid4().hex[:6]}@example.com")
    client.post("/api/super-admin/auth/logout")
    _login_org_admin(client, db, org_admin.id)

    # Org-admin endpoints are removed: must be 404.
    assert client.get("/api/org-admin/integrations/keys").status_code == 404
    assert client.post("/api/org-admin/integrations/keys", json={"name": "pienissimo"}).status_code == 404
    assert client.post("/api/org-admin/integrations/keys/1/rotate").status_code == 404
    assert client.delete("/api/org-admin/integrations/keys/1").status_code == 404

    # Super-admin endpoints remain forbidden without super-admin session.
    super_admin_only = client.get(f"/api/super-admin/orgs/{org.id}/integration-keys")
    assert super_admin_only.status_code in (401, 403)


def test_issue_member_works_with_super_admin_created_key(client, db):
    org = _ensure_org(db, f"issuer-super-key-{uuid.uuid4().hex[:8]}")
    batch = _ensure_card_batch(db, org.id)

    _login_super_admin(client)
    create_key_response = client.post(
        f"/api/super-admin/orgs/{org.id}/integration-keys",
        json={"name": "pienissimo", "scopes": ["issue_member"]},
    )
    assert create_key_response.status_code == 200, create_key_response.text
    raw_key = create_key_response.json()["raw_key"]

    payload = {
        "org_slug": org.slug,
        "external_customer_id": f"ext-super-{uuid.uuid4().hex[:10]}",
        "email": f"integration.super.{uuid.uuid4().hex[:6]}@example.com",
        "first_name": "Super",
        "last_name": "Issued",
        "send_email": False,
    }
    issue_response = client.post(
        "/api/integrations/members/issue",
        json=payload,
        headers={"X-ASSONAM-API-KEY": raw_key},
    )
    assert issue_response.status_code == 200, issue_response.text

    result = issue_response.json()
    assert result["status"] == "ok"
    assert batch.start_no <= result["card_number"] <= batch.end_no

    member = db.query(Member).filter(Member.id == result["member_id"]).first()
    assert member is not None
    assert member.status == MemberStatus.ACTIVE
    assert member.card_no == result["card_number"]

    keys_response = client.get(f"/api/super-admin/orgs/{org.id}/integration-keys?name=pienissimo")
    assert keys_response.status_code == 200, keys_response.text
    keys = keys_response.json()["items"]
    assert len(keys) >= 1
    assert keys[0]["last_used_at"] is not None
    assert keys[0]["last_used_ip"] == "testclient"


def test_super_admin_create_key_handles_legacy_org_name_unique_constraint(client, db):
    org = _ensure_org(db, f"legacy-unique-{uuid.uuid4().hex[:8]}")
    _login_super_admin(client)

    unique_index_name = f"uq_legacy_org_name_{uuid.uuid4().hex[:8]}"
    db.execute(
        text(
            f"CREATE UNIQUE INDEX {unique_index_name} "
            f"ON integration_api_keys (org_id, name) WHERE org_id = {org.id}"
        )
    )
    db.commit()

    try:
        first = client.post(
            f"/api/super-admin/orgs/{org.id}/integration-keys",
            json={"name": "pienissimo", "scopes": ["issue_member"]},
        )
        assert first.status_code == 200, first.text
        first_payload = first.json()
        assert first_payload["raw_key"]

        first_id = first_payload["id"]
        disable = client.delete(f"/api/super-admin/orgs/{org.id}/integration-keys/{first_id}")
        assert disable.status_code == 200, disable.text

        second = client.post(
            f"/api/super-admin/orgs/{org.id}/integration-keys",
            json={"name": "pienissimo", "scopes": ["issue_member"]},
        )
        assert second.status_code == 200, second.text
        second_payload = second.json()
        assert second_payload["raw_key"]

        keys = (
            db.query(IntegrationApiKey)
            .filter(
                IntegrationApiKey.org_id == org.id,
                IntegrationApiKey.name == "pienissimo",
            )
            .all()
        )
        # Legacy unique keeps one row, but creation must not fail with 500.
        assert len(keys) == 1
        assert keys[0].is_active is True
    finally:
        db.execute(text(f"DROP INDEX IF EXISTS {unique_index_name}"))
        db.commit()
