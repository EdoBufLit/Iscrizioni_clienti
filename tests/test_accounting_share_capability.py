import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AccountingCategory,
    AccountingDocument,
    AccountingFolder,
    AccountingShareLink,
    AdminRole,
    AdminUser,
    Organization,
    OrgAdminToken,
)
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_org_admin(client, db, admin_id: int) -> None:
    raw_token = f"accounting-capability-admin-{admin_id}-{uuid.uuid4().hex}"
    db.add(
        OrgAdminToken(
            admin_id=admin_id,
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


def _login_super_admin(client) -> None:
    response = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )
    assert response.status_code == 200, response.text


def _build_accounting_document(db) -> tuple[AccountingDocument, AdminUser, Path]:
    suffix = uuid.uuid4().hex
    org = Organization(
        name=f"Accounting capability {suffix[:8]}",
        slug=f"accounting-capability-{suffix}",
        email=f"accounting-capability-{suffix}@example.com",
        is_active=True,
        accounting_enabled=True,
    )
    db.add(org)
    db.flush()

    admin = AdminUser(
        email=f"accounting-capability-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    folder = AccountingFolder(
        org_id=None,
        name=f"Capability {suffix[:8]}",
        slug=f"accounting-capability-folder-{suffix}",
        is_active=True,
    )
    category = AccountingCategory(
        org_id=None,
        code=f"accounting_capability_{suffix}",
        name=f"Capability {suffix[:8]}",
        is_active=True,
    )
    db.add_all([admin, folder, category])
    db.flush()

    relative_path = os.path.join("accounting", f"capability-{suffix}.pdf")
    file_path = Path(settings.UPLOAD_DIR) / relative_path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(b"%PDF-1.4\naccounting-capability\n%%EOF\n")

    document = AccountingDocument(
        org_id=org.id,
        folder_id=folder.id,
        category_id=category.id,
        title="Documento capability",
        storage_key=relative_path,
        original_filename="capability.pdf",
        mime_type="application/pdf",
        file_size=file_path.stat().st_size,
        preview_enabled=True,
        is_share_enabled=True,
        uploaded_by_admin_id=admin.id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    db.refresh(admin)
    return document, admin, file_path


def test_new_share_link_is_hash_only_and_preserves_admin_contracts(client, db):
    document, admin, file_path = _build_accounting_document(db)
    try:
        _login_org_admin(client, db, admin.id)
        created = client.post(
            f"/api/org-admin/accounting/documents/{document.id}/share-links",
            json={"expires_in_days": None},
        )
        assert created.status_code == 201, created.text
        org_payload = created.json()["share_link"]
        assert set(org_payload) == {
            "id",
            "url",
            "expires_at",
            "revoked_at",
            "created_at",
        }
        assert org_payload["expires_at"] is None
        raw_token = org_payload["url"].rstrip("/").split("/")[-1]
        assert len(raw_token) == 32

        db.expire_all()
        stored = db.get(AccountingShareLink, org_payload["id"])
        assert stored is not None
        assert stored.token_version == 1
        assert stored.token_hash == hash_token(raw_token)
        assert stored.token == stored.token_hash
        assert raw_token not in stored.token

        public_response = client.get(f"/api/public/accounting-share/{raw_token}")
        assert public_response.status_code == 200, public_response.text
        verifier_response = client.get(
            f"/api/public/accounting-share/{stored.token_hash}"
        )
        assert verifier_response.status_code == 404, verifier_response.text

        listed = client.get(
            f"/api/org-admin/accounting/documents/{document.id}/share-links"
        )
        assert listed.status_code == 200, listed.text
        listed_link = next(
            item for item in listed.json()["items"] if item["id"] == stored.id
        )
        assert listed_link == org_payload

        _login_super_admin(client)
        super_response = client.get(
            f"/api/super-admin/accounting/documents/{document.id}"
        )
        assert super_response.status_code == 200, super_response.text
        super_link = next(
            item
            for item in super_response.json()["share_links"]
            if item["id"] == stored.id
        )
        assert set(super_link) == {
            "id",
            "token",
            "url",
            "expires_at",
            "revoked_at",
            "created_at",
        }
        assert super_link["token"] == raw_token
        assert super_link["url"] == org_payload["url"]

        expiring = client.post(
            f"/api/org-admin/accounting/documents/{document.id}/share-links",
            json={"expires_in_days": 7},
        )
        assert expiring.status_code == 201, expiring.text
        assert expiring.json()["share_link"]["expires_at"] is not None
    finally:
        file_path.unlink(missing_ok=True)


def test_legacy_plaintext_link_keeps_working_with_expiry_and_revocation(client, db):
    document, admin, file_path = _build_accounting_document(db)
    raw_token = f"legacy-accounting-{uuid.uuid4().hex}"
    legacy = AccountingShareLink(
        document_id=document.id,
        token=raw_token,
        token_hash=None,
        token_version=None,
        expires_at=None,
        created_by_admin_id=admin.id,
        revoked_at=None,
    )
    db.add(legacy)
    db.commit()
    db.refresh(legacy)

    try:
        assert client.get(
            f"/api/public/accounting-share/{raw_token}"
        ).status_code == 200

        _login_org_admin(client, db, admin.id)
        listed = client.get(
            f"/api/org-admin/accounting/documents/{document.id}/share-links"
        )
        assert listed.status_code == 200, listed.text
        listed_link = next(
            item for item in listed.json()["items"] if item["id"] == legacy.id
        )
        assert listed_link["url"].endswith(f"/{raw_token}")

        legacy.expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.add(legacy)
        db.commit()
        assert client.get(
            f"/api/public/accounting-share/{raw_token}"
        ).status_code == 410

        legacy.expires_at = datetime.utcnow() + timedelta(days=1)
        db.add(legacy)
        db.commit()
        revoked = client.post(
            f"/api/org-admin/accounting/share-links/{legacy.id}/revoke"
        )
        assert revoked.status_code == 200, revoked.text
        assert revoked.json() == {"ok": True, "share_link_id": legacy.id}
        assert client.get(
            f"/api/public/accounting-share/{raw_token}"
        ).status_code == 410
    finally:
        file_path.unlink(missing_ok=True)
