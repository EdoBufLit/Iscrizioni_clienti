from __future__ import annotations

import re
import time
import uuid
from datetime import datetime, timedelta

import pytest
from starlette.requests import Request

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AdminRole, AdminUser, DocStatus, EmailOutbox, Member, MemberDocument,
    MemberNotification, MemberStatus, OperationLog, OrgAdminNotification, OrgAdminToken, Organization,
    SignupSource, Token, TokenType,
)
from app.routes import member as routes
from app.services import member_documents as submissions
from app.services import member_onboarding as onboarding
from app.services import member_document_correction as corrections
from app.utils import hash_token


@pytest.fixture
def account(client, monkeypatch, tmp_path):
    client.cookies.clear()
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path / "uploads"))
    db = SessionLocal()
    suffix = uuid.uuid4().hex
    org = Organization(name="Club documenti", slug=f"document-submission-{suffix}", is_active=True,
        require_membership_document=True)
    other_org = Organization(name="Altro club", slug=f"document-other-{suffix}", is_active=True)
    db.add_all([org, other_org]); db.flush()
    member = Member(org_id=org.id, first_name="Ada", last_name="Documenti",
        email=f"member-{suffix}@example.test", status=MemberStatus.ACTIVE,
        card_no=987654, card_year=datetime.utcnow().year, joined_at=datetime.utcnow())
    admins = [AdminUser(org_id=org.id, role=AdminRole.ORG_ADMIN, email=f"admin-{index}-{suffix}@example.test", is_active=True) for index in range(2)]
    excluded = [
        AdminUser(org_id=org.id, role=AdminRole.ORG_ADMIN, email=f"inactive-{suffix}@example.test", is_active=False),
        AdminUser(org_id=other_org.id, role=AdminRole.ORG_ADMIN, email=f"other-{suffix}@example.test", is_active=True),
        AdminUser(org_id=org.id, role=AdminRole.SUPER_ADMIN, email=f"super-{suffix}@example.test", is_active=True),
    ]
    db.add_all([member, *admins, *excluded]); db.commit()
    yield db, org, member, admins, tmp_path / "uploads"
    db.close()
    client.cookies.clear()


def login_member(client, db, member):
    token = f"document-member-{uuid.uuid4().hex}"
    db.add(Token(member_id=member.id, token_hash=hash_token(token), auth_version=member.auth_version,
        purpose=TokenType.LOGIN_MAGIC_LINK, expires_at=datetime.utcnow() + timedelta(minutes=10)))
    db.commit()
    assert client.get(f"/member/auth?token={token}", follow_redirects=False).status_code == 302


def login_admin(client, db, admin):
    token = f"document-admin-{uuid.uuid4().hex}"
    db.add(OrgAdminToken(admin_id=admin.id, token_hash=hash_token(token), expires_at=datetime.utcnow()+timedelta(minutes=10)))
    db.commit()
    assert client.get(f"/api/org-admin/auth/verify?token={token}", follow_redirects=False).status_code == 302


def pdf(content=b"%PDF-1.4\nidentity"):
    return {"document": ("identity.pdf", content, "application/pdf")}


def upload(client, *, doc_type="identity", content=b"%PDF-1.4\nidentity"):
    return client.post("/api/member/documents", data={"doc_type": doc_type}, files=pdf(content))


def saved_doc(db, member, *, status="rejected", doc_type="identity", replaces=None, uploaded_at=None):
    document = MemberDocument(member_id=member.id, doc_type=doc_type, original_filename="old.pdf",
        rel_path=f"{member.org_id}/{member.id}/{uuid.uuid4().hex}.pdf", mime_type="application/pdf", size_bytes=11,
        sha256=uuid.uuid4().hex, status=status, rejection_note="Da sostituire" if status == "rejected" else None,
        replaces_document_id=replaces, uploaded_at=uploaded_at or datetime.utcnow())
    db.add(document); db.commit()
    return document


def test_first_upload_is_visible_in_member_profile_and_org_bell(client, account):
    db, org, member, admins, folder = account
    login_member(client, db, member)
    response = upload(client)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "pending" and result["type"] == "identity" and result["ok"]
    assert "associazione" in result["message"]
    document = db.get(MemberDocument, result["id"])
    assert document.member_id == member.id and document.replaces_document_id is None
    assert (folder/document.rel_path).read_bytes() == b"%PDF-1.4\nidentity"
    metadata = client.get("/api/member/documents").json()
    assert metadata["allowed_types"] == ["identity", "fiscal_code"]
    assert metadata["required_types"] == ["identity"]
    assert metadata["uploadable_types"] == ["fiscal_code"]
    assert metadata["items"][0]["id"] == document.id

    alerts = db.query(OrgAdminNotification).filter_by(org_id=org.id, type="member_document").all()
    assert {alert.admin_user_id for alert in alerts} == {admin.id for admin in admins}
    assert all(not alert.is_read and alert.href == f"/org-admin/soci/{member.id}?tab=documents" for alert in alerts)
    assert db.query(EmailOutbox).count() == 0

    client.cookies.clear()
    login_admin(client, db, admins[0])
    bell = client.get("/api/org-admin/notifications").json()
    assert bell["unread_count"] == 1 and bell["items"][0]["type"] == "member_document"
    detail = client.get(f"/api/org-admin/members/{member.id}")
    assert detail.status_code == 200, detail.text
    assert any(item["id"] == document.id and item["status"] == "pending" for item in detail.json()["documents"])


def test_identical_retry_creates_no_duplicate_document_alert_or_audit(client, account):
    db, org, member, admins, folder = account
    login_member(client, db, member)
    first = upload(client).json()
    second = upload(client)
    assert second.status_code == 200 and second.json()["id"] == first["id"]
    assert db.query(MemberDocument).filter_by(member_id=member.id).count() == 1
    assert db.query(OrgAdminNotification).filter_by(org_id=org.id, type="member_document").count() == len(admins)
    assert db.query(OperationLog).filter_by(action="member.document.upload", entity_id=first["id"]).count() == 1
    assert len(list(folder.rglob("*.pdf"))) == 1


@pytest.mark.parametrize("status", ["pending", "approved", "uploaded"])
def test_existing_document_in_review_or_approved_cannot_be_overwritten(client, account, status):
    db, org, member, admins, folder = account
    existing = saved_doc(db, member, status=status)
    login_member(client, db, member)
    response = upload(client, content=b"%PDF-1.4\ndifferent")
    assert response.status_code == 409, response.text
    db.refresh(existing)
    assert existing.status == status and existing.original_filename == "old.pdf"
    assert db.query(MemberDocument).filter_by(member_id=member.id).count() == 1
    assert not list(folder.rglob("*.pdf"))
    assert db.query(OrgAdminNotification).filter_by(org_id=org.id).count() == 0


def test_rejected_latest_replacement_preserves_history_and_required_config(client, account):
    db, org, member, admins, folder = account
    rejected = saved_doc(db, member)
    org.require_membership_document = False
    db.commit()
    login_member(client, db, member)
    before = client.get("/api/member/documents").json()
    assert before["required_types"] == [] and before["uploadable_types"] == ["identity", "fiscal_code"]
    result = upload(client)
    assert result.status_code == 200, result.text
    replacement = db.get(MemberDocument, result.json()["id"])
    assert replacement.replaces_document_id == rejected.id
    db.refresh(rejected)
    assert rejected.status == "rejected" and rejected.rejection_note == "Da sostituire"
    metadata = client.get("/api/member/documents").json()
    assert len(metadata["items"]) == 2 and metadata["uploadable_types"] == ["fiscal_code"]


def test_old_rejected_version_cannot_replace_a_newer_rejected_version(client, account):
    db, org, member, admins, folder = account
    original = saved_doc(db, member, uploaded_at=datetime.utcnow()-timedelta(days=1))
    latest = saved_doc(db, member, replaces=original.id)
    login_member(client, db, member)
    response = client.post(f"/api/member/documents/{original.id}/resubmit", files=pdf())
    assert response.status_code == 409, response.text
    assert db.query(MemberDocument).filter_by(member_id=member.id).count() == 2
    assert client.post(f"/api/member/documents/{latest.id}/resubmit", files=pdf()).status_code == 200


def test_other_members_document_is_not_accessible_even_in_same_org(client, account):
    db, org, member, admins, folder = account
    other = Member(org_id=org.id, first_name="Altro", last_name="Socio", status=MemberStatus.ACTIVE,
        card_no=987655, card_year=datetime.utcnow().year, joined_at=datetime.utcnow())
    db.add(other); db.commit()
    other_doc = saved_doc(db, other)
    login_member(client, db, member)
    response = client.post(f"/api/member/documents/{other_doc.id}/resubmit", files=pdf())
    assert response.status_code == 404
    assert client.get(f"/member/download/{other_doc.id}").status_code == 404
    assert client.get("/api/member/documents").json()["items"] == []


def test_anonymous_and_pending_accounts_cannot_upload_using_normal_session(client, account):
    db, org, member, admins, folder = account
    assert upload(client).status_code == 401
    login_member(client, db, member)
    member.status = MemberStatus.PENDING_DOCS
    db.commit()
    assert upload(client).status_code == 401
    assert db.query(MemberDocument).filter_by(member_id=member.id).count() == 0


@pytest.mark.parametrize("kind", ["invalid_type", "invalid_magic", "invalid_mime"])
def test_invalid_upload_creates_no_document_notification_or_file(client, account, kind):
    db, org, member, admins, folder = account
    login_member(client, db, member)
    if kind == "invalid_type": response = upload(client, doc_type="../other")
    elif kind == "invalid_magic": response = upload(client, content=b"not a PDF")
    else: response = client.post("/api/member/documents", data={"doc_type": "identity"},
        files={"document": ("script.html", b"<script>alert(1)</script>", "text/html")})
    assert response.status_code in {400, 422}
    assert db.query(MemberDocument).filter_by(member_id=member.id).count() == 0
    assert db.query(OrgAdminNotification).filter_by(org_id=org.id).count() == 0
    assert not list(folder.rglob("*.*"))


def test_upload_io_has_no_transaction_and_auth_revocation_is_rechecked(client, account, monkeypatch):
    db, org, member, admins, folder = account
    login_member(client, db, member)
    seen = []
    original_resolve = routes.get_current_member
    original_stage = routes.stage_member_document
    def track(request, session):
        seen.append(session)
        return original_resolve(request, session)
    async def stage(upload, **kwargs):
        assert seen and not seen[-1].in_transaction()
        staged = await original_stage(upload, **kwargs)
        with SessionLocal() as changed:
            changed.get(Member, member.id).auth_version += 1
            changed.commit()
        return staged
    monkeypatch.setattr(routes, "get_current_member", track)
    monkeypatch.setattr(routes, "stage_member_document", stage)
    response = upload(client)
    assert response.status_code == 401, response.text
    assert db.query(MemberDocument).filter_by(member_id=member.id).count() == 0
    assert db.query(OrgAdminNotification).filter_by(org_id=org.id).count() == 0
    assert not list(folder.rglob("*.pdf"))


def test_failed_audit_rolls_back_document_and_bell_and_removes_staged_file(client, account, monkeypatch):
    db, org, member, admins, folder = account
    login_member(client, db, member)
    def fail(*args, **kwargs):
        raise RuntimeError("synthetic audit failure")
    monkeypatch.setattr(submissions.audit, "log_operation", fail)
    with pytest.raises(RuntimeError, match="synthetic audit failure"):
        upload(client)
    assert db.query(MemberDocument).filter_by(member_id=member.id).count() == 0
    assert db.query(OrgAdminNotification).filter_by(org_id=org.id).count() == 0
    assert not list(folder.rglob("*.pdf"))


def test_limited_onboarding_upload_notifies_org_without_granting_normal_login(client, account):
    db, org, member, admins, folder = account
    member.status = MemberStatus.PENDING_DOCS
    member.signup_source = SignupSource.ADMIN.value
    member.is_manual = True
    member.card_no = None
    db.commit()
    request = Request({"type": "http", "method": "POST", "path": "/", "scheme": "http",
        "server": ("testserver", 80), "headers": [], "session": {}})
    outbox_id = onboarding.queue_member_onboarding(db, request, member)
    db.commit()
    token = re.search(r"#token=([^\s]+)", db.get(EmailOutbox, outbox_id).payload_json["text_body"]).group(1)
    assert client.post("/api/member/onboarding/session", json={"token": token}).status_code == 200
    response = client.post("/api/member/onboarding/complete", data={"new_password": "SyntheticPassword123!"},
        files={"identity_document": ("identity.pdf", b"%PDF-1.4\nonboarding", "application/pdf")})
    assert response.status_code == 200, response.text
    assert not response.json()["member"]["is_active"]
    assert db.query(OrgAdminNotification).filter_by(org_id=org.id, type="member_document").count() == len(admins)
    assert client.get("/api/member/documents").status_code == 401
    # Identical uploads retain the existing document and alert after password
    # setup has rotated the limited session's credential version.
    retry = client.post("/api/member/onboarding/complete",
        files={"identity_document": ("identity.pdf", b"%PDF-1.4\nonboarding", "application/pdf")})
    assert retry.status_code == 200, retry.text
    assert db.query(OrgAdminNotification).filter_by(org_id=org.id, type="member_document").count() == len(admins)


def test_rejection_stores_reason_in_member_bell_and_email_and_decision_is_immutable(client, account):
    db, org, member, admins, folder = account
    document = saved_doc(db, member, status="pending")
    login_admin(client, db, admins[0])
    reason = "Il retro del documento non è leggibile."
    response = client.post(f"/api/org-admin/documents/{document.id}/reject", json={"rejection_note": reason})
    assert response.status_code == 200, response.text
    assert response.json()["email_status"] == "queued"
    assert response.json()["member_notification_status"] == "created"
    notification = db.query(MemberNotification).filter_by(member_id=member.id).one()
    assert notification.type == "document_rejected" and reason in notification.body
    assert notification.href == f"/dashboard/documenti?document_id={document.id}"
    outbox = db.query(EmailOutbox).filter_by(email_type="member_document_rejected").one()
    assert reason in outbox.payload_json["text_body"]
    db.refresh(document)
    decision_at = document.reviewed_at
    assert client.post(f"/api/org-admin/documents/{document.id}/reject", json={"rejection_note": reason}).status_code == 200
    assert db.query(MemberNotification).filter_by(member_id=member.id).count() == 1
    assert db.query(EmailOutbox).filter_by(email_type="member_document_rejected").count() == 1
    assert db.query(OperationLog).filter_by(action="member_doc.review", entity_id=document.id).count() == 1
    assert client.post(f"/api/org-admin/documents/{document.id}/approve").status_code == 409
    assert client.post(f"/api/org-admin/documents/{document.id}/reject", json={"rejection_note": "Altre note"}).status_code == 409
    db.refresh(document)
    assert document.rejection_note == reason and document.reviewed_at == decision_at

    client.cookies.clear()
    login_member(client, db, member)
    bell = client.get("/api/member/notifications").json()
    assert bell["unread_count"] == 1 and bell["items"][0]["body"] == notification.body
    assert client.patch(f"/api/member/notifications/{notification.id}/read").status_code == 200
    assert client.get("/api/member/notifications").json()["unread_count"] == 0


def test_approval_is_immutable_and_identical_retry_does_not_duplicate_audit(client, account):
    db, org, member, admins, folder = account
    document = saved_doc(db, member, status="pending")
    login_admin(client, db, admins[0])
    assert client.post(f"/api/org-admin/documents/{document.id}/approve").status_code == 200
    assert client.post(f"/api/org-admin/documents/{document.id}/approve").status_code == 200
    assert client.post(f"/api/org-admin/documents/{document.id}/reject", json={"rejection_note": "Cambio idea"}).status_code == 409
    assert client.post(f"/api/org-admin/documents/{document.id}/resend-correction").status_code == 409
    assert db.query(OperationLog).filter_by(action="member_doc.review", entity_id=document.id).count() == 1
    assert db.query(MemberNotification).filter_by(member_id=member.id).count() == 0


@pytest.mark.parametrize("outbox_state", ["queued", "sent"])
def test_expired_correction_invite_can_be_resent_without_changing_review(client, account, monkeypatch, outbox_state):
    db, org, member, admins, folder = account
    document = saved_doc(db, member, status="pending")
    login_admin(client, db, admins[0])
    old_time = int(time.time())-73*3600
    with monkeypatch.context() as changed:
        changed.setattr("itsdangerous.timed.time.time", lambda: old_time)
        response = client.post(f"/api/org-admin/documents/{document.id}/reject", json={"rejection_note": "Serve il retro"})
    assert response.status_code == 200, response.text
    db.refresh(document)
    decision = document.reviewed_at, document.reviewed_by_admin_id, document.rejection_note
    first = db.query(EmailOutbox).filter_by(email_type="member_document_rejected").one()
    old_token = re.search(r"token=([^\s]+)", first.payload_json["text_body"]).group(1)
    assert client.post("/api/member/document-correction/session", json={"token": old_token}).status_code == 401
    first.status = outbox_state
    first.created_at = datetime.utcnow()-timedelta(hours=73)
    db.commit()
    resent = client.post(f"/api/org-admin/documents/{document.id}/resend-correction")
    assert resent.status_code == 200 and resent.json()["email_status"] == "queued", resent.text
    rows = db.query(EmailOutbox).filter_by(email_type="member_document_rejected").order_by(EmailOutbox.created_at).all()
    assert len(rows) == (2 if outbox_state == "sent" else 1)
    new_token = re.search(r"token=([^\s]+)", rows[-1].payload_json["text_body"]).group(1)
    assert new_token != old_token
    assert client.post("/api/member/document-correction/session", json={"token": new_token}).status_code == 200
    duplicate = client.post(f"/api/org-admin/documents/{document.id}/resend-correction")
    assert duplicate.status_code == 200, duplicate.text
    assert db.query(EmailOutbox).filter_by(email_type="member_document_rejected").count() == len(rows)
    db.refresh(document)
    assert (document.reviewed_at, document.reviewed_by_admin_id, document.rejection_note) == decision
    assert db.query(MemberNotification).filter_by(member_id=member.id).count() == 1


def test_recent_delivered_correction_invite_is_throttled(client, account):
    db, org, member, admins, folder = account
    document = saved_doc(db, member, status="pending")
    login_admin(client, db, admins[0])
    assert client.post(f"/api/org-admin/documents/{document.id}/reject", json={"rejection_note": "Serve il retro"}).status_code == 200
    outbox = db.query(EmailOutbox).filter_by(email_type="member_document_rejected").one()
    outbox.status = "sent"
    db.commit()
    response = client.post(f"/api/org-admin/documents/{document.id}/resend-correction")
    assert response.status_code == 429 and 0 < int(response.headers["retry-after"]) <= 600
    assert db.query(EmailOutbox).filter_by(email_type="member_document_rejected").count() == 1


def test_correction_resend_is_tenant_scoped_and_not_available_after_replacement(client, account):
    db, org, member, admins, folder = account
    document = saved_doc(db, member)
    other_admin = db.query(AdminUser).filter(AdminUser.org_id != org.id, AdminUser.role == AdminRole.ORG_ADMIN).first()
    login_admin(client, db, other_admin)
    assert client.post(f"/api/org-admin/documents/{document.id}/resend-correction").status_code == 404
    client.cookies.clear()
    login_admin(client, db, admins[0])
    saved_doc(db, member, status="pending", replaces=document.id)
    assert client.post(f"/api/org-admin/documents/{document.id}/resend-correction").status_code == 409
    assert db.query(EmailOutbox).filter_by(email_type="member_document_rejected").count() == 0
