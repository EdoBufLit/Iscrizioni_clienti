import pytest
from datetime import datetime, timedelta

from app.db import SessionLocal
from app.models import (
    AdminUser,
    AdminRole,
    Organization,
    Member,
    MemberDocument,
    OrgAdminToken,
    Token,
    TokenType,
    DocStatus,
)
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_org_admin(client, db, admin_id: int):
    token_str = f"docflow-admin-{admin_id}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)


def _login_member(client, db, member_id: int):
    token_str = f"docflow-member-{member_id}"
    token = Token(
        member_id=member_id,
        purpose=TokenType.LOGIN_MAGIC_LINK,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    client.get(f"/member/auth?token={token_str}", follow_redirects=False)


def test_reject_without_note_returns_400(client, db):
    org = Organization(name="DocFlow Org", slug="docflow-org", is_active=True)
    db.add(org)
    db.commit()
    db.refresh(org)

    admin = AdminUser(email="docflow-admin@example.com", role=AdminRole.ORG_ADMIN, org_id=org.id, is_active=True)
    db.add(admin)
    db.commit()
    db.refresh(admin)

    member = Member(org_id=org.id, first_name="Doc", last_name="User", email="docflow@example.com", status="pending_docs")
    db.add(member)
    db.commit()
    db.refresh(member)

    doc = MemberDocument(
        member_id=member.id,
        doc_type="identity",
        rel_path=f"{org.id}/{member.id}/doc.png",
        original_filename="doc.png",
        mime_type="image/png",
        size_bytes=8,
        sha256="fake",
        status=DocStatus.PENDING.value,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    _login_org_admin(client, db, admin.id)

    res = client.post(f"/api/org-admin/documents/{doc.id}/reject", json={"rejection_note": ""})
    assert res.status_code == 400


def test_member_resubmit_only_when_rejected(client, db):
    org = Organization(name="DocFlow Org 2", slug="docflow-org-2", is_active=True)
    db.add(org)
    db.commit()
    db.refresh(org)

    member = Member(org_id=org.id, first_name="Resub", last_name="User", email="resub@example.com", status="pending_docs")
    db.add(member)
    db.commit()
    db.refresh(member)

    doc = MemberDocument(
        member_id=member.id,
        doc_type="identity",
        rel_path=f"{org.id}/{member.id}/doc.png",
        original_filename="doc.png",
        mime_type="image/png",
        size_bytes=8,
        sha256="fake",
        status=DocStatus.PENDING.value,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    _login_member(client, db, member.id)

    files = {"document": ("doc.png", b"\x89PNG\r\n\x1a\nTEST", "image/png")}
    res = client.post(f"/api/member/documents/{doc.id}/resubmit", files=files)
    assert res.status_code == 400

    doc.status = DocStatus.REJECTED.value
    db.commit()

    res = client.post(f"/api/member/documents/{doc.id}/resubmit", files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True

    new_doc = db.query(MemberDocument).filter(MemberDocument.id == data["id"]).first()
    assert new_doc is not None
    assert new_doc.replaces_document_id == doc.id
    assert new_doc.status == DocStatus.PENDING.value


def test_org_admin_cannot_review_other_org_document(client, db):
    org = Organization(name="DocFlow Org A", slug="docflow-org-a", is_active=True)
    other_org = Organization(name="DocFlow Org B", slug="docflow-org-b", is_active=True)
    db.add_all([org, other_org])
    db.commit()
    db.refresh(org)
    db.refresh(other_org)

    admin = AdminUser(email="docflow-admin-a@example.com", role=AdminRole.ORG_ADMIN, org_id=org.id, is_active=True)
    db.add(admin)
    db.commit()
    db.refresh(admin)

    member = Member(org_id=other_org.id, first_name="Other", last_name="Org", email="otherorg@example.com", status="pending_docs")
    db.add(member)
    db.commit()
    db.refresh(member)

    doc = MemberDocument(
        member_id=member.id,
        doc_type="identity",
        rel_path=f"{other_org.id}/{member.id}/doc.png",
        original_filename="doc.png",
        mime_type="image/png",
        size_bytes=8,
        sha256="fake",
        status=DocStatus.PENDING.value,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    _login_org_admin(client, db, admin.id)

    res = client.post(f"/api/org-admin/documents/{doc.id}/approve")
    assert res.status_code == 403
