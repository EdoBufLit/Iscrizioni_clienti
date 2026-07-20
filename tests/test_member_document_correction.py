from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    DocStatus,
    EmailOutbox,
    Member,
    MemberDocument,
    MemberStatus,
    OperationLog,
    Organization,
    OrgAdminToken,
    Token,
    TokenType,
)
from app.services.member_document_correction import create_document_correction_token
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _new_member_document_fixture(db, *, status: MemberStatus):
    suffix = uuid.uuid4().hex[:10]
    org = Organization(
        name=f"Associazione documenti {suffix}",
        slug=f"documenti-{suffix}",
        is_active=True,
    )
    db.add(org)
    db.flush()

    admin = AdminUser(
        email=f"org-admin-doc-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    member = Member(
        org_id=org.id,
        first_name="Ada",
        last_name="Documento",
        email=f"socio-doc-{suffix}@example.com",
        phone="3331234567",
        fiscal_code="RSSMRA80A01H501U",
        status=status,
        card_no=700000 + int(suffix[:4], 16),
        card_year=datetime.utcnow().year,
    )
    db.add_all([admin, member])
    db.flush()

    document = MemberDocument(
        member_id=member.id,
        doc_type="identity",
        rel_path=f"{org.id}/{member.id}/identity.pdf",
        original_filename="identity.pdf",
        mime_type="application/pdf",
        size_bytes=18,
        sha256="a" * 64,
        status=DocStatus.PENDING.value,
    )
    other_document = MemberDocument(
        member_id=member.id,
        doc_type="fiscal_code",
        rel_path=f"{org.id}/{member.id}/fiscal-code.pdf",
        original_filename="fiscal-code.pdf",
        mime_type="application/pdf",
        size_bytes=18,
        sha256="b" * 64,
        status=DocStatus.REJECTED.value,
        rejection_note="Secondo documento",
        reviewed_at=datetime.utcnow(),
    )
    db.add_all([document, other_document])
    db.commit()
    return org, admin, member, document, other_document


def _login_org_admin(client, db, admin: AdminUser) -> None:
    raw_token = f"org-doc-{uuid.uuid4().hex}"
    db.add(
        OrgAdminToken(
            admin_id=admin.id,
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


def _correction_token_from_outbox(outbox: EmailOutbox) -> str:
    text_body = str((outbox.payload_json or {}).get("text_body") or "")
    match = re.search(r"/dashboard/documenti/correzione\?token=([^\s]+)", text_body)
    assert match is not None, text_body
    return match.group(1)


def test_pending_member_can_only_resubmit_rejected_document_from_limited_session(
    client,
    db,
    tmp_path,
    monkeypatch,
):
    client.get("/member/logout", follow_redirects=False)
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    org, admin, member, document, other_document = _new_member_document_fixture(
        db,
        status=MemberStatus.PENDING_VERIFICATION,
    )
    _login_org_admin(client, db, admin)

    rejection = client.post(
        f"/api/org-admin/documents/{document.id}/reject",
        json={"rejection_note": "Il documento non e leggibile."},
    )
    assert rejection.status_code == 200, rejection.text

    # Repeating the same review updates no outbox recipient twice and keeps the
    # original capability usable.
    duplicate_rejection = client.post(
        f"/api/org-admin/documents/{document.id}/reject",
        json={"rejection_note": "Il documento non e leggibile."},
    )
    assert duplicate_rejection.status_code == 200, duplicate_rejection.text

    outbox_rows = (
        db.query(EmailOutbox)
        .filter(EmailOutbox.email_type == "member_document_rejected")
        .all()
    )
    assert len(outbox_rows) == 1
    outbox = outbox_rows[0]
    assert outbox.to_email == member.email
    assert outbox.dedupe_key is not None
    assert outbox.payload_json["sender"]["mode"] == "association"
    assert outbox.payload_json["meta"]["communication_purpose"] == "service"
    raw_token = _correction_token_from_outbox(outbox)

    establish = client.post(
        "/api/member/document-correction/session",
        json={"token": raw_token},
    )
    assert establish.status_code == 200, establish.text
    payload = establish.json()
    assert payload["member"]["display_name"] == "Ada Documento"
    assert payload["organization"]["name"] == org.name
    assert payload["document"]["id"] == document.id
    assert payload["document"]["rejection_note"] == "Il documento non e leggibile."

    # The capability never turns a pending member into a normal authenticated
    # member and cannot address another document, even in the same tenant.
    assert client.get("/api/member/documents").status_code == 401
    wrong_document = client.post(
        f"/api/member/document-correction/documents/{other_document.id}/resubmit",
        files={"document": ("wrong.pdf", b"%PDF-1.4 corrected", "application/pdf")},
    )
    assert wrong_document.status_code == 404

    resubmit = client.post(
        f"/api/member/document-correction/documents/{document.id}/resubmit",
        files={"document": ("corrected.pdf", b"%PDF-1.4 corrected", "application/pdf")},
    )
    assert resubmit.status_code == 200, resubmit.text
    assert resubmit.json()["status"] == DocStatus.PENDING.value

    replacement = (
        db.query(MemberDocument)
        .filter(MemberDocument.replaces_document_id == document.id)
        .one()
    )
    assert replacement.member_id == member.id
    assert replacement.doc_type == document.doc_type
    assert replacement.original_filename == "corrected.pdf"
    assert (
        db.query(OperationLog)
        .filter(
            OperationLog.action == "member.document.resubmit_limited_session",
            OperationLog.entity_id == replacement.id,
        )
        .count()
        == 1
    )

    # The limited session is consumed, and reopening the capability cannot
    # create a second replacement.
    assert client.get("/api/member/document-correction").status_code == 401
    reused = client.post(
        "/api/member/document-correction/session",
        json={"token": raw_token},
    )
    assert reused.status_code == 409
    assert (
        db.query(MemberDocument)
        .filter(MemberDocument.replaces_document_id == document.id)
        .count()
        == 1
    )


def test_document_correction_rejects_tampered_token(client, db):
    client.get("/member/logout", follow_redirects=False)
    _, admin, _, document, _ = _new_member_document_fixture(
        db,
        status=MemberStatus.PENDING_VERIFICATION,
    )
    _login_org_admin(client, db, admin)
    rejection = client.post(
        f"/api/org-admin/documents/{document.id}/reject",
        json={"rejection_note": "Serve una copia completa."},
    )
    assert rejection.status_code == 200, rejection.text
    outbox = (
        db.query(EmailOutbox)
        .filter(EmailOutbox.email_type == "member_document_rejected")
        .one()
    )
    raw_token = _correction_token_from_outbox(outbox)
    token_parts = raw_token.split(".")
    assert len(token_parts) >= 3
    signature = token_parts[-1]
    token_parts[-1] = f"{'a' if signature[0] != 'a' else 'b'}{signature[1:]}"
    tampered = ".".join(token_parts)
    response = client.post(
        "/api/member/document-correction/session",
        json={"token": tampered},
    )
    assert response.status_code == 401


def test_rejection_remains_successful_when_correction_email_queue_fails(
    client,
    db,
    monkeypatch,
):
    client.get("/member/logout", follow_redirects=False)
    _, admin, _, document, _ = _new_member_document_fixture(
        db,
        status=MemberStatus.PENDING_VERIFICATION,
    )
    _login_org_admin(client, db, admin)

    def fail_enqueue(*_args, **_kwargs):
        raise RuntimeError("outbox unavailable")

    monkeypatch.setattr(
        "app.routes.org_admin.enqueue_document_rejection_email",
        fail_enqueue,
    )
    response = client.post(
        f"/api/org-admin/documents/{document.id}/reject",
        json={"rejection_note": "Documento non leggibile."},
    )
    assert response.status_code == 200, response.text
    db.refresh(document)
    assert document.status == DocStatus.REJECTED.value
    assert (
        db.query(OperationLog)
        .filter(
            OperationLog.action == "member_doc.review",
            OperationLog.entity_id == document.id,
        )
        .count()
        == 1
    )


def test_two_document_correction_links_do_not_overwrite_each_other(
    client,
    db,
    tmp_path,
    monkeypatch,
):
    client.get("/member/logout", follow_redirects=False)
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    _, _, _, first_document, second_document = _new_member_document_fixture(
        db,
        status=MemberStatus.PENDING_VERIFICATION,
    )
    first_document.status = DocStatus.REJECTED.value
    first_document.rejection_note = "Prima correzione"
    first_document.reviewed_at = datetime.utcnow()
    db.commit()

    first_token = create_document_correction_token(first_document)
    second_token = create_document_correction_token(second_document)
    assert client.post(
        "/api/member/document-correction/session",
        json={"token": first_token},
    ).status_code == 200
    assert client.post(
        "/api/member/document-correction/session",
        json={"token": second_token},
    ).status_code == 200

    first_resubmit = client.post(
        f"/api/member/document-correction/documents/{first_document.id}/resubmit",
        files={"document": ("first.pdf", b"%PDF-1.4 first", "application/pdf")},
    )
    assert first_resubmit.status_code == 200, first_resubmit.text

    # The second tab/capability remains valid after consuming the first one.
    current = client.get("/api/member/document-correction")
    assert current.status_code == 200, current.text
    assert current.json()["document"]["id"] == second_document.id


def test_existing_active_member_resubmit_flow_remains_available(
    client,
    db,
    tmp_path,
    monkeypatch,
):
    client.get("/member/logout", follow_redirects=False)
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    _, _, member, document, _ = _new_member_document_fixture(
        db,
        status=MemberStatus.ACTIVE,
    )
    document.status = DocStatus.REJECTED.value
    document.rejection_note = "Da sostituire"
    document.reviewed_at = datetime.utcnow()
    raw_login_token = f"member-doc-{uuid.uuid4().hex}"
    db.add(
        Token(
            member_id=member.id,
            purpose=TokenType.LOGIN_MAGIC_LINK,
            token_hash=hash_token(raw_login_token),
            expires_at=datetime.utcnow() + timedelta(minutes=15),
        )
    )
    db.commit()

    login = client.get(
        f"/member/auth?token={raw_login_token}",
        follow_redirects=False,
    )
    assert login.status_code == 302, login.text
    response = client.post(
        f"/api/member/documents/{document.id}/resubmit",
        files={"document": ("active-corrected.pdf", b"%PDF-1.4 corrected", "application/pdf")},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == DocStatus.PENDING.value
