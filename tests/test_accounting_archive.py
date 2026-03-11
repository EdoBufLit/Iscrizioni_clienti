import os
import uuid
from datetime import datetime, timedelta

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AccountingDocument,
    AdminRole,
    AdminUser,
    OrgAdminToken,
    Organization,
    OrganizationSharedDocument,
    OrganizationSharedDocumentAssignment,
)
from app.services.accounting import backfill_legacy_accounting_documents
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_super_admin(client) -> None:
    response = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )
    assert response.status_code == 200, response.text


def _login_org_admin(client, db, admin_id: int) -> None:
    token_str = f"accounting-admin-{admin_id}-{uuid.uuid4().hex[:6]}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    response = client.get(
        f"/api/org-admin/auth/verify?token={token_str}",
        follow_redirects=False,
    )
    assert response.status_code == 302, response.text


def _create_org_with_admin(
    db,
    *,
    accounting_enabled: bool = True,
) -> tuple[Organization, AdminUser]:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Accounting Org {suffix}",
        slug=f"accounting-org-{suffix}",
        email=f"accounting-{suffix}@example.com",
        is_active=True,
        accounting_enabled=accounting_enabled,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    admin = AdminUser(
        email=f"org-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return org, admin


def _cleanup_accounting_file(document: AccountingDocument | None) -> None:
    if document is None:
        return
    full_path = os.path.join(settings.UPLOAD_DIR, document.storage_key)
    if os.path.exists(full_path):
        try:
            os.remove(full_path)
        except OSError:
            pass


def test_accounting_archive_crud_and_share_link_flow(client, db):
    org, org_admin = _create_org_with_admin(db, accounting_enabled=True)
    _login_super_admin(client)

    folder_response = client.post(
        "/api/super-admin/accounting/folders",
        json={"name": "2026", "year": 2026, "is_active": True},
    )
    assert folder_response.status_code == 201, folder_response.text
    folder_id = folder_response.json()["folder"]["id"]

    category_response = client.post(
        "/api/super-admin/accounting/categories",
        json={"name": "Bilanci", "is_active": True},
    )
    assert category_response.status_code == 201, category_response.text
    category_id = category_response.json()["category"]["id"]

    create_response = client.post(
        "/api/super-admin/accounting/documents",
        data={
            "org_id": str(org.id),
            "folder_id": str(folder_id),
            "category_id": str(category_id),
            "title": "Bilancio consuntivo",
            "description": "Documento contabile di test",
            "preview_enabled": "true",
            "is_share_enabled": "true",
        },
        files={
            "file": ("bilancio.pdf", b"%PDF-1.4\naccounting-test\n%%EOF\n", "application/pdf")
        },
    )
    assert create_response.status_code == 201, create_response.text
    document_id = create_response.json()["document"]["id"]

    document = (
        db.query(AccountingDocument)
        .filter(AccountingDocument.id == document_id)
        .first()
    )
    assert document is not None

    _login_org_admin(client, db, org_admin.id)
    archive_response = client.get("/api/org-admin/accounting/archive")
    assert archive_response.status_code == 200, archive_response.text
    payload = archive_response.json()
    assert payload["total_documents"] >= 1
    assert payload["items"][0]["categories"][0]["documents"][0]["title"] == "Bilancio consuntivo"

    preview_response = client.get(f"/api/org-admin/accounting/documents/{document_id}/preview")
    assert preview_response.status_code == 200, preview_response.text

    share_response = client.post(
        f"/api/org-admin/accounting/documents/{document_id}/share-links",
        json={"expires_in_days": 7},
    )
    assert share_response.status_code == 201, share_response.text
    share_url = share_response.json()["share_link"]["url"]
    share_token = share_url.rstrip("/").split("/")[-1]

    public_response = client.get(f"/api/public/accounting-share/{share_token}")
    assert public_response.status_code == 200, public_response.text

    revoke_response = client.post(
        f"/api/org-admin/accounting/share-links/{share_response.json()['share_link']['id']}/revoke"
    )
    assert revoke_response.status_code == 200, revoke_response.text

    revoked_public_response = client.get(f"/api/public/accounting-share/{share_token}")
    assert revoked_public_response.status_code == 410, revoked_public_response.text

    _cleanup_accounting_file(document)


def test_legacy_accounting_backfill_creates_new_accounting_documents(db):
    org, _admin = _create_org_with_admin(db, accounting_enabled=True)
    legacy_document = OrganizationSharedDocument(
        title="Legacy accounting document",
        description="backfill target",
        kind="accounting",
        rel_path="legacy/accounting.pdf",
        original_filename="legacy-accounting.pdf",
        mime_type="application/pdf",
        size_bytes=1234,
        sha256="legacy-sha",
    )
    db.add(legacy_document)
    db.commit()
    db.refresh(legacy_document)

    db.add(
        OrganizationSharedDocumentAssignment(
            document_id=legacy_document.id,
            association_id=org.id,
        )
    )
    db.commit()

    created = backfill_legacy_accounting_documents(db)
    db.commit()
    assert created >= 1

    rows = (
        db.query(AccountingDocument)
        .filter(
            AccountingDocument.legacy_shared_document_id == legacy_document.id,
            AccountingDocument.org_id == org.id,
        )
        .all()
    )
    assert len(rows) == 1
    assert rows[0].title == "Legacy accounting document"
