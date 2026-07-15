import pytest
from datetime import datetime, timedelta
import uuid

from app.config import settings
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
    MemberStatus,
)
from app.utils import clear_captured_emails, get_captured_emails
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
    suffix = uuid.uuid4().hex[:8]
    org = Organization(name=f"DocFlow Org {suffix}", slug=f"docflow-org-{suffix}", is_active=True)
    db.add(org)
    db.commit()
    db.refresh(org)

    admin = AdminUser(email=f"docflow-admin-{suffix}@example.com", role=AdminRole.ORG_ADMIN, org_id=org.id, is_active=True)
    db.add(admin)
    db.commit()
    db.refresh(admin)

    member = Member(
        org_id=org.id,
        first_name="Doc",
        last_name="User",
        email=f"docflow-{suffix}@example.com",
        status="pending_docs",
    )
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
    suffix = uuid.uuid4().hex[:8]
    org = Organization(name=f"DocFlow Org 2 {suffix}", slug=f"docflow-org-2-{suffix}", is_active=True)
    db.add(org)
    db.commit()
    db.refresh(org)

    member = Member(
        org_id=org.id,
        first_name="Resub",
        last_name="User",
        email=f"resub-{suffix}@example.com",
        status="active",
        card_no=9000 + int(suffix[:2], 16),
        card_year=datetime.utcnow().year,
        joined_at=datetime.utcnow(),
    )
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
    suffix = uuid.uuid4().hex[:8]
    org = Organization(name=f"DocFlow Org A {suffix}", slug=f"docflow-org-a-{suffix}", is_active=True)
    other_org = Organization(name=f"DocFlow Org B {suffix}", slug=f"docflow-org-b-{suffix}", is_active=True)
    db.add_all([org, other_org])
    db.commit()
    db.refresh(org)
    db.refresh(other_org)

    admin = AdminUser(email=f"docflow-admin-a-{suffix}@example.com", role=AdminRole.ORG_ADMIN, org_id=org.id, is_active=True)
    db.add(admin)
    db.commit()
    db.refresh(admin)

    member = Member(
        org_id=other_org.id,
        first_name="Other",
        last_name="Org",
        email=f"otherorg-{suffix}@example.com",
        status="pending_docs",
    )
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


def test_document_approval_sends_card_email_once_for_active_member(client, db, drain_email_outbox):
    suffix = uuid.uuid4().hex[:8]
    org = Organization(name=f"DocFlow Mail Org {suffix}", slug=f"docflow-mail-org-{suffix}", is_active=True)
    db.add(org)
    db.commit()
    db.refresh(org)

    admin = AdminUser(
        email=f"docflow-mail-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    member = Member(
        org_id=org.id,
        first_name="Giulia",
        last_name="Bianchi",
        email=f"docflow-mail-member-{suffix}@example.com",
        status=MemberStatus.ACTIVE,
        card_no=9500 + int(suffix[:2], 16),
        card_year=datetime.utcnow().year,
        joined_at=datetime.utcnow(),
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    doc = MemberDocument(
        member_id=member.id,
        doc_type="identity",
        rel_path=f"{org.id}/{member.id}/doc.pdf",
        original_filename="doc.pdf",
        mime_type="application/pdf",
        size_bytes=16,
        sha256="fakehash",
        status=DocStatus.PENDING.value,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    previous_email_mode = settings.EMAIL_MODE
    settings.EMAIL_MODE = "test"
    clear_captured_emails()
    try:
        _login_org_admin(client, db, admin.id)

        first = client.post(f"/api/org-admin/documents/{doc.id}/approve")
        assert first.status_code == 200, first.text

        db.refresh(member)
        assert member.card_delivered_at is None
        assert member.card_email_sent_at is None

        drain_email_outbox()
        db.refresh(member)
        assert member.card_delivered_at is not None
        assert member.card_email_sent_at is not None

        captured = get_captured_emails()
        assert len(captured) == 1
        assert captured[0]["subject"] == f"La tua tessera {org.name}"
        assert (
            f"Ora puoi accedere alla tua area riservata con la tua email: {member.email}."
            in (captured[0]["text_body"] or "")
        )
        assert (
            "/auth/verify" in (captured[0]["text_body"] or "")
            or "/login" in (captured[0]["text_body"] or "")
        )
        assert "/wallet/google/add" in (captured[0]["text_body"] or "")
        assert "/dashboard/documenti" in (captured[0]["text_body"] or "")
        assert "Google Wallet (Android)" in (captured[0]["html_body"] or "")

        second = client.post(f"/api/org-admin/documents/{doc.id}/approve")
        assert second.status_code == 200, second.text
        drain_email_outbox()
        assert len(get_captured_emails()) == 1
    finally:
        settings.EMAIL_MODE = previous_email_mode
        clear_captured_emails()
