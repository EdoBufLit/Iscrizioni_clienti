import os
import uuid
from datetime import datetime, timedelta

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import AdminRole, AdminUser, OrgAdminToken, Organization
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_org_admin(client, db, admin_id: int) -> None:
    token_str = f"statute-upload-token-{admin_id}-{uuid.uuid4().hex[:6]}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    res = client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)
    assert res.status_code == 302


def _create_org_admin(db) -> tuple[Organization, AdminUser]:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Statute Upload Org {suffix}",
        slug=f"statute-upload-{suffix}",
        is_active=True,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    admin = AdminUser(
        email=f"statute-upload-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return org, admin


def test_org_admin_statute_upload_rejects_file_larger_than_10mb(client, db):
    _org, admin = _create_org_admin(db)
    _login_org_admin(client, db, admin.id)

    oversized_pdf = b"%PDF-1.7\n" + (b"0" * (10 * 1024 * 1024))
    response = client.post(
        "/api/org-admin/organization/statute",
        files={"file": ("statuto.pdf", oversized_pdf, "application/pdf")},
    )

    assert response.status_code == 413, response.text
    payload = response.json()
    assert payload["detail"] == "File troppo grande. Max 10 MB."
    assert payload["message"] == "File troppo grande. Max 10 MB."
    assert payload.get("request_id")


def test_org_admin_statute_upload_rejects_non_pdf_format(client, db):
    _org, admin = _create_org_admin(db)
    _login_org_admin(client, db, admin.id)

    response = client.post(
        "/api/org-admin/organization/statute",
        files={"file": ("statuto.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 415, response.text
    payload = response.json()
    assert payload["detail"] == "Formato non valido: carica un PDF."
    assert payload["message"] == "Formato non valido: carica un PDF."


def test_org_admin_statute_upload_accepts_small_pdf(client, db):
    org, admin = _create_org_admin(db)
    _login_org_admin(client, db, admin.id)

    pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"
    response = client.post(
        "/api/org-admin/organization/statute",
        files={"file": ("statuto.pdf", pdf_bytes, "application/pdf")},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["has_statute"] is True
    assert payload["statute_version"] == "v1"

    db.refresh(org)
    assert org.statute_pdf_path
    full_path = os.path.join(settings.UPLOAD_DIR, org.statute_pdf_path)
    assert os.path.exists(full_path)

    try:
        os.remove(full_path)
    except OSError:
        pass
