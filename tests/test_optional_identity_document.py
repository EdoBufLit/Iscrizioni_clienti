from datetime import datetime, timedelta

import pytest

from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    CardBatch,
    Member,
    MemberDocument,
    MemberStatus,
    Organization,
    OrgAdminToken,
)
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _ensure_org(db, slug: str) -> Organization:
    org = db.query(Organization).filter_by(slug=slug).first()
    if not org:
        org = Organization(
            name=f"Org {slug}",
            slug=slug,
            statute_version="v1",
            privacy_version="v1",
            statute_pdf_path=f"{slug}/statute.pdf",
            is_active=True,
        )
        db.add(org)
        db.commit()
        db.refresh(org)
        return org

    changed = False
    if not org.statute_pdf_path:
        org.statute_pdf_path = f"{slug}/statute.pdf"
        changed = True
    if not org.statute_version:
        org.statute_version = "v1"
        changed = True
    if not org.privacy_version:
        org.privacy_version = "v1"
        changed = True
    if changed:
        db.commit()
        db.refresh(org)
    return org


def _ensure_org_admin_session(client, db, org: Organization) -> AdminUser:
    admin_email = f"admin-{org.slug}@example.com"
    admin = db.query(AdminUser).filter_by(email=admin_email).first()
    if not admin:
        admin = AdminUser(
            email=admin_email,
            role=AdminRole.ORG_ADMIN,
            org_id=org.id,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

    token_str = f"token-{org.slug}-{int(datetime.utcnow().timestamp())}"
    token = OrgAdminToken(
        admin_id=admin.id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()

    resp = client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)
    assert resp.status_code == 302
    return admin


def test_join_submit_without_identity_document_ok(client, db):
    org = _ensure_org(db, "optional-doc-submit-org")
    email = f"nodoc-submit-{int(datetime.utcnow().timestamp())}@example.com"

    resp = client.post(
        f"/api/join/{org.slug}/submit",
        data={
            "first_name": "NoDoc",
            "last_name": "Submit",
            "email": email,
            "phone": "333000111",
            "fiscal_code": "NODCSM80A01H501Z",
            "payment_method": "CASH",
            "accept_statute": "true",
            "accept_privacy": "true",
        },
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["status"] == "received"

    member = (
        db.query(Member)
        .filter(Member.org_id == org.id, Member.email == email)
        .order_by(Member.id.desc())
        .first()
    )
    assert member is not None
    assert member.status == MemberStatus.PENDING_VERIFICATION
    docs_count = db.query(MemberDocument).filter(MemberDocument.member_id == member.id).count()
    assert docs_count == 0


def test_org_admin_can_activate_member_without_documents(client, db):
    org = _ensure_org(db, "optional-doc-activation-org")
    _ensure_org_admin_session(client, db, org)

    batch = db.query(CardBatch).filter(CardBatch.org_id == org.id).first()
    if not batch:
        batch = CardBatch(org_id=org.id, start_no=5000, end_no=5005, next_no=5000)
        db.add(batch)
        db.commit()

    member = Member(
        org_id=org.id,
        first_name="NoDoc",
        last_name="Activation",
        email=f"nodoc-activation-{int(datetime.utcnow().timestamp())}@example.com",
        status=MemberStatus.PENDING_DOCS,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    assert db.query(MemberDocument).filter(MemberDocument.member_id == member.id).count() == 0

    resp = client.post(
        f"/api/org-admin/members/{member.id}/decision",
        json={"decision": "approve", "notes": "Activate without docs"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "active"

    db.refresh(member)
    assert member.status == MemberStatus.ACTIVE


def test_approve_document_without_existing_document_returns_error(client, db):
    org = _ensure_org(db, "optional-doc-missing-document-org")
    _ensure_org_admin_session(client, db, org)

    resp = client.post("/api/org-admin/documents/999999/approve")
    assert resp.status_code in (400, 404)
