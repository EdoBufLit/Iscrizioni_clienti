import pytest
from app.db import SessionLocal
from app.models import AdminUser, AdminRole, Organization, Member, MemberStatus, OrgAdminToken
from app.utils import hash_token
from datetime import datetime, timedelta
import os

@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()

def test_document_flow(client, db):
    # Setup: Ensure Org exists
    org = db.query(Organization).filter_by(slug="my-association").first()
    if not org:
        org = Organization(name="Test Org", slug="my-association", is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    # Setup: Create Org Admin
    admin_email = "orgadmin_test_doc@example.com"
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

    # 1. Join request (Multipart endpoint)
    # We need fake files
    files = {
        'id_document': ('id.pdf', b'%PDF-1.4 content', 'application/pdf'),
        'fiscal_code_document': ('fc.pdf', b'%PDF-1.4 content', 'application/pdf')
    }
    data = {
        'first_name': 'Doc',
        'last_name': 'Test',
        'email': 'doc.test@example.com',
        'phone': '1234567890',
        'fiscal_code': 'DOCTST90A01H501Z',
        'payment_method': 'CASH',
        'accept_statute': 'true',
        'accept_privacy': 'true'
    }

    # Clean up previous run if any
    existing = db.query(Member).filter_by(email='doc.test@example.com').first()
    if existing:
        db.delete(existing)
        db.commit()

    resp = client.post(f"/api/join/{org.slug}/submit", data=data, files=files)
    assert resp.status_code == 200, resp.text

    # Verify member created
    member = db.query(Member).filter_by(email='doc.test@example.com').first()
    assert member is not None
    assert member.status == MemberStatus.PENDING_VERIFICATION
    assert len(member.documents) == 2

    # 2. Login as Org Admin
    # Simulate magic link verification
    token_str = "testtoken123"
    expiry = datetime.utcnow() + timedelta(minutes=15)
    token = OrgAdminToken(
        admin_id=admin.id,
        token_hash=hash_token(token_str),
        expires_at=expiry
    )
    db.add(token)
    db.commit()

    # Call verify endpoint (using client which manages cookies)
    # The endpoint is at /api/org-admin/auth/verify
    # Note: verify endpoint redirects. We don't follow because SPA might be missing in test env.
    resp = client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)
    assert resp.status_code == 302
    # Check if we are authenticated. The session cookie should be set.

    # 3. List members
    resp = client.get("/api/org-admin/members")
    assert resp.status_code == 200
    items = resp.json()['items']
    assert any(m['email'] == 'doc.test@example.com' for m in items)

    # 4. Get Member Detail
    resp = client.get(f"/api/org-admin/members/{member.id}")
    assert resp.status_code == 200
    detail = resp.json()
    doc_id = detail['documents'][0]['id']

    # 5. Review Document
    resp = client.post(
        f"/api/org-admin/documents/{doc_id}/review",
        json={"status": "approved", "notes": "LGTM"}
    )
    assert resp.status_code == 200
    res_json = resp.json()
    assert res_json['doc_status'] == "approved"

    # Verify status in DB
    db.refresh(member)
    # Member status should still be pending verification because email is not verified?
    # Or depends on logic. If logic says "PENDING_DOCS" -> "ACTIVE" only if all approved.
    # Current status was PENDING_VERIFICATION.
    # Logic in org_admin.py:
    # if member.status in [MemberStatus.PENDING_VERIFICATION, MemberStatus.PENDING_DOCS]:
    #    member.status = MemberStatus.ACTIVE
    # But only if ALL docs approved. We only approved one.

    # Let's approve the other one
    doc_id_2 = detail['documents'][1]['id']
    resp = client.post(
        f"/api/org-admin/documents/{doc_id_2}/review",
        json={"status": "approved", "notes": "LGTM2"}
    )
    assert resp.status_code == 200

    db.refresh(member)
    # It should NOT transition to ACTIVE automatically anymore.
    # It should wait for explicit decision.
    assert member.status != MemberStatus.ACTIVE

    # 6. Explicit Decision
    resp = client.post(
        f"/api/org-admin/members/{member.id}/decision",
        json={"decision": "approve", "notes": "Final approval"}
    )
    assert resp.status_code == 200

    db.refresh(member)
    assert member.status == MemberStatus.ACTIVE
