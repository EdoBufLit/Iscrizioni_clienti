import json
import os
import uuid
from datetime import datetime, timedelta

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    OrgAdminToken,
    Organization,
    OrganizationSharedDocument,
)
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
    token_str = f"shared-doc-admin-{admin_id}-{uuid.uuid4().hex[:6]}"
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
    accounting_enabled: bool = False,
) -> tuple[Organization, AdminUser]:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Shared Documents Org {suffix}",
        slug=f"shared-docs-{suffix}",
        email=f"org-{suffix}@example.com",
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


def _cleanup_shared_document_file(document: OrganizationSharedDocument) -> None:
    full_path = os.path.join(settings.UPLOAD_DIR, document.rel_path)
    if os.path.exists(full_path):
        try:
            os.remove(full_path)
        except OSError:
            pass


def _build_upload_payload(
    *,
    title: str,
    kind: str,
    target_mode: str,
    association_ids: list[int] | None = None,
):
    data = {
        "title": title,
        "description": "Documento di test",
        "kind": kind,
        "target_mode": target_mode,
    }
    if association_ids is not None:
        data["association_ids"] = json.dumps(association_ids)
    files = {"file": ("documento.pdf", b"%PDF-1.4\nshared-document\n%%EOF\n", "application/pdf")}
    return data, files


def test_super_admin_can_toggle_accounting_flag_and_org_admin_me_exposes_it(client, db):
    org, admin = _create_org_with_admin(db, accounting_enabled=False)

    _login_super_admin(client)
    response = client.patch(
        f"/api/super-admin/organizations/{org.id}",
        json={"accounting_enabled": True},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["accounting_enabled"] is True

    db.refresh(org)
    assert org.accounting_enabled is True

    _login_org_admin(client, db, admin.id)
    me_response = client.get("/api/org-admin/auth/me")
    assert me_response.status_code == 200, me_response.text
    assert me_response.json()["organization"]["accounting_enabled"] is True


def test_super_admin_can_send_general_documents_and_each_org_admin_sees_only_own_docs(client, db):
    org_one, admin_one = _create_org_with_admin(db)
    org_two, admin_two = _create_org_with_admin(db)
    _org_three, admin_three = _create_org_with_admin(db)

    _login_super_admin(client)
    data, files = _build_upload_payload(
        title="Circolare generale",
        kind="general",
        target_mode="multiple",
        association_ids=[org_one.id, org_two.id],
    )
    response = client.post("/api/super-admin/documents", data=data, files=files)

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ok"] is True
    assert payload["document"]["recipient_count"] == 2

    document = (
        db.query(OrganizationSharedDocument)
        .filter(OrganizationSharedDocument.id == payload["document"]["id"])
        .first()
    )
    assert document is not None

    _login_org_admin(client, db, admin_one.id)
    org_one_docs = client.get("/api/org-admin/shared-documents?kind=general")
    assert org_one_docs.status_code == 200, org_one_docs.text
    assert len(org_one_docs.json()["items"]) == 1
    assert org_one_docs.json()["items"][0]["title"] == "Circolare generale"

    _login_org_admin(client, db, admin_two.id)
    org_two_docs = client.get("/api/org-admin/shared-documents?kind=general")
    assert org_two_docs.status_code == 200, org_two_docs.text
    assert len(org_two_docs.json()["items"]) == 1

    _login_org_admin(client, db, admin_three.id)
    org_three_docs = client.get("/api/org-admin/shared-documents?kind=general")
    assert org_three_docs.status_code == 200, org_three_docs.text
    assert org_three_docs.json()["items"] == []

    _cleanup_shared_document_file(document)


def test_super_admin_blocks_accounting_document_if_any_target_lacks_accounting(client, db):
    enabled_org, _enabled_admin = _create_org_with_admin(db, accounting_enabled=True)
    disabled_org, _disabled_admin = _create_org_with_admin(db, accounting_enabled=False)

    _login_super_admin(client)
    data, files = _build_upload_payload(
        title="Bilancio riservato",
        kind="accounting",
        target_mode="multiple",
        association_ids=[enabled_org.id, disabled_org.id],
    )
    response = client.post("/api/super-admin/documents", data=data, files=files)

    assert response.status_code == 422, response.text
    assert "contabilita attiva" in response.json()["detail"].lower()


def test_accounting_documents_are_visible_only_to_enabled_org_admins_and_downloadable(client, db):
    enabled_org, enabled_admin = _create_org_with_admin(db, accounting_enabled=True)
    disabled_org, disabled_admin = _create_org_with_admin(db, accounting_enabled=False)

    _login_super_admin(client)
    data, files = _build_upload_payload(
        title="Report contabile marzo",
        kind="accounting",
        target_mode="single",
        association_ids=[enabled_org.id],
    )
    create_response = client.post("/api/super-admin/documents", data=data, files=files)
    assert create_response.status_code == 200, create_response.text
    document_id = create_response.json()["document"]["id"]

    document = (
        db.query(OrganizationSharedDocument)
        .filter(OrganizationSharedDocument.id == document_id)
        .first()
    )
    assert document is not None

    archive_response = client.get("/api/super-admin/documents")
    assert archive_response.status_code == 200, archive_response.text
    assert any(item["id"] == document_id for item in archive_response.json()["items"])

    detail_response = client.get(f"/api/super-admin/documents/{document_id}")
    assert detail_response.status_code == 200, detail_response.text
    assert detail_response.json()["recipient_count"] == 1

    _login_org_admin(client, db, enabled_admin.id)
    enabled_list = client.get("/api/org-admin/shared-documents?kind=accounting")
    assert enabled_list.status_code == 200, enabled_list.text
    assert len(enabled_list.json()["items"]) == 1

    download_response = client.get(f"/api/org-admin/shared-documents/{document_id}/download")
    assert download_response.status_code == 200, download_response.text

    _login_org_admin(client, db, disabled_admin.id)
    disabled_list = client.get("/api/org-admin/shared-documents?kind=accounting")
    assert disabled_list.status_code == 403, disabled_list.text

    _cleanup_shared_document_file(document)
