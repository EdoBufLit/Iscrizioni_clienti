from __future__ import annotations

import re
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.config import settings
from app.db import SessionLocal
from app.models import DocStatus, EmailOutbox, Member, MemberDocument, MemberStatus, OperationLog, Organization, SignupSource, Token, TokenType
from app.security import get_password_hash, verify_password
from app.services import member_onboarding as onboarding


@pytest.fixture
def pending(client, monkeypatch, tmp_path):
    client.cookies.clear()
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path / "uploads"))
    db = SessionLocal()
    suffix = uuid.uuid4().hex
    org = Organization(name="Club prova onboarding", slug=f"onboarding-{suffix}", is_active=True,
        require_membership_document=True)
    db.add(org); db.flush()
    member = Member(org_id=org.id, first_name="Ada", last_name="Verifica", email=f"onboarding-{suffix}@example.test",
        status=MemberStatus.PENDING_DOCS, signup_source=SignupSource.ADMIN.value, is_manual=True)
    db.add(member); db.commit()
    yield db, org, member, tmp_path / "uploads"
    db.close()
    client.cookies.clear()


def request():
    return Request({"type": "http", "method": "POST", "path": "/", "scheme": "http", "server": ("testserver", 80), "headers": [], "session": {}})


def invitation(db, member):
    identifier = onboarding.queue_member_onboarding(db, request(), member)
    db.commit()
    outbox = db.get(EmailOutbox, identifier)
    token = re.search(r"#token=([^\s]+)", outbox.payload_json["text_body"]).group(1)
    return token, outbox


def enter(client, db, member):
    token, outbox = invitation(db, member)
    response = client.post("/api/member/onboarding/session", json={"token": token})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"
    return token, outbox, response.json()


def pdf(label="identity", content=b"%PDF-1.4\nfixture"):
    return (f"{label}.pdf", content, "application/pdf")


def test_invitation_queues_actionable_deduplicated_email_without_delivery(client, pending):
    db, org, member, _ = pending
    token, outbox = invitation(db, member)
    assert "/completa-iscrizione#token=" in outbox.payload_json["text_body"]
    assert "impostare la password" in outbox.payload_json["text_body"]
    assert outbox.status == "queued" and outbox.email_type == onboarding.ONBOARDING_EMAIL_TYPE
    assert outbox.to_email == member.email
    assert token not in str(outbox.payload_json["meta"])
    assert onboarding.queue_member_onboarding(db, request(), member) == outbox.id
    db.commit()
    assert db.query(EmailOutbox).filter(EmailOutbox.to_email == member.email).count() == 1
    proof = db.query(Token).filter(Token.member_id == member.id, Token.used_at.is_(None)).one()
    assert proof.purpose == TokenType.REGISTRATION_CONTINUATION
    assert 71 * 3600 < (proof.expires_at - datetime.utcnow()).total_seconds() <= 72 * 3600
    outbox.status = "sent"; db.commit()
    with pytest.raises(HTTPException) as failure:
        onboarding.queue_member_onboarding(db, request(), member)
    assert failure.value.status_code == 429
    assert int(failure.value.headers["Retry-After"]) <= 600
    db.rollback()


def test_pending_session_is_limited_one_time_and_not_normal_auth(client, pending):
    db, org, member, _ = pending
    token, _, result = enter(client, db, member)
    assert result["member"]["email"] == member.email and result["member"]["has_password"] is False
    assert result["organization"] == {"name": org.name, "require_identity_document": True}
    assert not result["completed"] and 3500 < result["session_expires_in_seconds"] <= 3600
    context = client.get("/api/member/onboarding")
    assert context.status_code == 200
    assert context.headers["cache-control"] == "no-store"
    assert context.headers["referrer-policy"] == "no-referrer"
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/member/documents").status_code == 401
    assert client.post("/api/auth/change-password", data={"new_password": "NotPermitted123!"}).status_code == 401
    assert client.post("/api/member/onboarding/session", json={"token": token}).status_code == 401
    db.refresh(member)
    assert member.status == MemberStatus.PENDING_DOCS and member.card_no is None and member.password_hash is None


@pytest.mark.parametrize("mutation", ["deleted", "rejected", "expired", "org_inactive", "email", "epoch", "proof_expired", "public_source"])
def test_invitation_revocation_and_eligibility(client, pending, mutation):
    db, org, member, _ = pending
    token, _ = invitation(db, member)
    if mutation == "deleted": member.deleted_at = datetime.utcnow()
    elif mutation == "rejected": member.status = MemberStatus.REJECTED
    elif mutation == "expired": member.status = MemberStatus.EXPIRED
    elif mutation == "org_inactive": org.is_active = False
    elif mutation == "email": member.email = "different@example.test"
    elif mutation == "epoch": member.auth_version += 1
    elif mutation == "public_source": member.signup_source = SignupSource.ASSONAM_FORM.value
    else:
        db.query(Token).filter(Token.member_id == member.id).update({Token.expires_at: datetime.utcnow()-timedelta(seconds=1)})
    db.commit()
    assert client.post("/api/member/onboarding/session", json={"token": token}).status_code in {401, 403}
    assert client.get("/api/member/onboarding").status_code == 401


def test_signed_invitation_expires_independently_of_database_proof(client, pending, monkeypatch):
    from itsdangerous.timed import TimestampSigner
    db, _, member, _ = pending
    with monkeypatch.context() as changed:
        changed.setattr(TimestampSigner, "get_timestamp", lambda self: int(time.time())-onboarding.ONBOARDING_TOKEN_TTL_SECONDS-1)
        token, _ = invitation(db, member)
    assert client.post("/api/member/onboarding/session", json={"token": token}).status_code == 401


@pytest.mark.parametrize("mutation", ["email", "epoch", "deleted", "rejected", "org_inactive", "session_expired"])
def test_existing_session_rechecks_revocation_each_time(client, pending, monkeypatch, mutation):
    db, org, member, _ = pending
    enter(client, db, member)
    if mutation == "email": member.email = "changed@example.test"
    elif mutation == "epoch": member.auth_version += 1
    elif mutation == "deleted": member.deleted_at = datetime.utcnow()
    elif mutation == "rejected": member.status = MemberStatus.REJECTED
    elif mutation == "org_inactive": org.is_active = False
    else:
        future = time.time()+onboarding.ONBOARDING_SESSION_TTL_SECONDS+1
        monkeypatch.setattr(onboarding.time, "time", lambda: future)
    db.commit()
    assert client.get("/api/member/onboarding").status_code in {401, 403}
    assert client.post("/api/member/onboarding/complete", data={"new_password": "NoAccess123!"}, files={"identity_document": pdf()}).status_code in {401, 403}


def test_complete_sets_password_and_owned_document_without_activation_and_is_retry_safe(client, pending):
    db, _, member, uploads = pending
    _, _, _ = enter(client, db, member)
    old_version = member.auth_version
    response = client.post("/api/member/onboarding/complete", data={"new_password": "PasswordOnlyLocal123!", "member_id": "999999"}, files={"identity_document": pdf()})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.json()["completed"] and response.json()["ok"]
    assert response.json()["member"]["has_password"] and not response.json()["member"]["is_active"]
    db.refresh(member)
    assert verify_password("PasswordOnlyLocal123!", member.password_hash)
    assert member.auth_version == old_version+1 and member.status == MemberStatus.PENDING_DOCS
    assert member.card_no is None and member.decision_at is None
    document = db.query(MemberDocument).filter_by(member_id=member.id).one()
    assert document.doc_type == "identity" and document.status == "pending"
    assert client.get("/api/member/onboarding").json()["completed"]
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/login", data={"email": member.email, "password": "PasswordOnlyLocal123!"}).status_code == 403
    retry = client.post("/api/member/onboarding/complete", data={"new_password": "PasswordOnlyLocal123!"}, files={"identity_document": pdf()})
    assert retry.status_code == 200, retry.text
    assert db.query(MemberDocument).filter_by(member_id=member.id).count() == 1
    assert db.query(OperationLog).filter_by(entity_id=member.id, action="member.onboarding_completed").count() == 1
    assert len([file for file in uploads.rglob("*") if file.is_file()]) == 1


def test_password_and_all_documents_are_atomic_and_cleanup_partial_upload(client, pending):
    db, _, member, uploads = pending
    enter(client, db, member)
    response = client.post("/api/member/onboarding/complete", data={"new_password": "AtomicLocal123!"}, files={
        "identity_document": pdf(), "fiscal_code_document": ("bad.pdf", b"not a PDF", "application/pdf")})
    assert response.status_code == 400
    db.refresh(member)
    assert member.password_hash is None and db.query(MemberDocument).filter_by(member_id=member.id).count() == 0
    assert not [file for file in uploads.rglob("*") if file.is_file()]


def test_missing_required_identity_and_short_password_do_not_write(client, pending):
    db, _, member, _ = pending
    enter(client, db, member)
    for password in ["short", "SufficientLocal123!"]:
        assert client.post("/api/member/onboarding/complete", data={"new_password": password}).status_code == 400
    db.refresh(member)
    assert member.password_hash is None


def test_no_identity_is_required_when_association_does_not_request_it(client, pending):
    db, org, member, _ = pending
    org.require_membership_document = False; db.commit()
    enter(client, db, member)
    response = client.post("/api/member/onboarding/complete", data={"new_password": "NoDocsLocal123!"})
    assert response.status_code == 200 and response.json()["completed"]


def test_active_member_can_finish_after_admin_activates_before_email_click(client, pending):
    db, org, member, _ = pending
    token, _ = invitation(db, member)
    member.status = MemberStatus.ACTIVE; member.card_no = 999870
    member.card_year = datetime.utcnow().year; member.valid_until = datetime.utcnow()+timedelta(days=40)
    org.require_membership_document = False; db.commit()
    response = client.post("/api/member/onboarding/session", json={"token": token})
    assert response.status_code == 200 and response.json()["member"]["is_active"]
    assert client.post("/api/member/onboarding/complete", data={"new_password": "ActiveLocal123!"}).status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_approved_document_cannot_be_replaced_and_rejected_history_is_retained(client, pending):
    db, _, member, _ = pending
    rejected = MemberDocument(member_id=member.id, doc_type="identity", status="rejected", rejection_note="Documento illeggibile",
        rel_path="old.pdf", original_filename="old.pdf", sha256="old")
    db.add(rejected); db.commit()
    enter(client, db, member)
    assert client.post("/api/member/onboarding/complete", data={"new_password": "HistoryLocal123!"}, files={"identity_document": pdf()}).status_code == 200
    db.refresh(rejected)
    replacement = db.query(MemberDocument).filter(MemberDocument.member_id == member.id, MemberDocument.id != rejected.id).one()
    assert replacement.replaces_document_id == rejected.id and rejected.status == "rejected"
    replacement.status = "approved"; db.commit()
    response = client.post("/api/member/onboarding/complete", files={"identity_document": pdf(content=b"%PDF-1.4\ndifferent")})
    assert response.status_code == 409
    assert db.query(MemberDocument).filter_by(member_id=member.id).count() == 2
    assert client.post("/api/member/onboarding/complete", data={"new_password": "ChangedPassword123!"}).status_code == 409


def test_staging_has_no_database_transaction_and_write_failure_rolls_back(client, pending, monkeypatch):
    from app.routes import member_onboarding as routes
    db, _, member, uploads = pending
    enter(client, db, member)
    request_db = {}
    original_context = routes.get_onboarding_context
    original_save = routes.save_upload_file
    def track_context(request, session, **kwargs):
        request_db["session"] = session
        return original_context(request, session, **kwargs)
    async def checked_save(*args, **kwargs):
        assert not request_db["session"].in_transaction()
        return await original_save(*args, **kwargs)
    monkeypatch.setattr(routes, "get_onboarding_context", track_context)
    monkeypatch.setattr(routes, "save_upload_file", checked_save)
    def fail_audit(*args, **kwargs):
        raise RuntimeError("injected rollback")
    monkeypatch.setattr(onboarding.audit, "log_operation", fail_audit)
    with pytest.raises(RuntimeError, match="injected rollback"):
        client.post("/api/member/onboarding/complete", data={"new_password": "RollbackLocal123!"}, files={"identity_document": pdf()})
    db.refresh(member)
    assert member.password_hash is None and db.query(MemberDocument).filter_by(member_id=member.id).count() == 0
    assert not [file for file in uploads.rglob("*") if file.is_file()]
    assert client.get("/api/member/onboarding").status_code == 200
