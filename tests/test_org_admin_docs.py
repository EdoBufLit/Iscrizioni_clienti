import pytest
from app.db import SessionLocal
from app.models import AdminUser, AdminRole, Organization, Member, MemberStatus, MemberDocument, OrgAdminToken
from app.utils import hash_token
from datetime import datetime, timedelta
import os

@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()

def test_org_admin_member_documents_rel_path(client, db):
    # 1. Setup Data
    org_slug = "test-docs-org"
    org = db.query(Organization).filter_by(slug=org_slug).first()
    if not org:
        org = Organization(name="Test Docs Org", slug=org_slug, is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    admin_email = "admin.docs@example.com"
    admin = db.query(AdminUser).filter_by(email=admin_email).first()
    if not admin:
        admin = AdminUser(
            email=admin_email,
            role=AdminRole.ORG_ADMIN,
            org_id=org.id,
            is_active=True
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

    member_email = "member.docs@example.com"
    member = db.query(Member).filter_by(email=member_email).first()
    if not member:
        member = Member(
            org_id=org.id,
            first_name="Doc",
            last_name="Member",
            email=member_email,
            status=MemberStatus.PENDING_VERIFICATION
        )
        db.add(member)
        db.commit()
        db.refresh(member)

    # Create a dummy file on disk
    from app.config import settings
    rel_path = f"{org.id}/{member.id}/test_doc.txt"
    full_path = os.path.join(settings.UPLOAD_DIR, rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "wb") as f:
        f.write(b"Test content")

    # Create MemberDocument in DB
    doc = MemberDocument(
        member_id=member.id,
        doc_type="identity",
        rel_path=rel_path,
        original_filename="test_doc.txt",
        mime_type="text/plain",
        size_bytes=12,
        sha256="fakehash",
        status="uploaded"
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # 2. Authenticate Org Admin
    token_str = "doctoken123"
    token = OrgAdminToken(
        admin_id=admin.id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15)
    )
    db.add(token)
    db.commit()

    # Verify token to get session
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)

    # 3. Get Member Detail
    resp = client.get(f"/api/org-admin/members/{member.id}")
    assert resp.status_code == 200
    data = resp.json()

    assert "documents" in data
    assert len(data["documents"]) == 1
    doc_data = data["documents"][0]

    # CHECK: rel_path is present (This will fail initially)
    assert "rel_path" in doc_data
    assert doc_data["rel_path"] == rel_path

    # CHECK: download_url is working
    download_url = doc_data["download_url"]
    assert download_url is not None

    file_resp = client.get(download_url)
    assert file_resp.status_code == 200
    assert file_resp.content == b"Test content"
