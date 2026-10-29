"""Email-owned, revocable access to finish a manual registration only.

This capability never creates the ordinary member session. Upload I/O belongs
outside the final synchronous, member-locked credential/document transaction.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from itsdangerous import BadData, URLSafeTimedSerializer
from sqlalchemy import update
from sqlalchemy.orm import Session

from app import audit
from app.config import settings
from app.models import DocStatus, EmailOutbox, Member, MemberDocument, MemberStatus, SignupSource, Token, TokenType
from app.security import MIN_MEMBER_PASSWORD_LENGTH, get_password_hash, verify_password
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload
from app.services.file_deletion import UPLOADS_ROOT, resolve_storage_target
from app.services.member_activity import is_member_active
from app.services.member_sessions import consume_member_auth_token, issue_member_auth_token, replace_member_password
from app.services.system_email_layout import build_system_email_html

logger = logging.getLogger(__name__)
ONBOARDING_TOKEN_TTL_SECONDS = 72 * 60 * 60
ONBOARDING_SESSION_TTL_SECONDS = 60 * 60
ONBOARDING_SESSION_KEY = "member_onboarding"
ONBOARDING_EMAIL_TYPE = "member_manual_onboarding"
_TOKEN_SALT = "member-manual-onboarding-v1"
_PENDING = {MemberStatus.PENDING_VERIFICATION.value, MemberStatus.PENDING_DOCS.value, MemberStatus.PENDING_CARDS.value}
_DOCUMENT_TYPES = {"identity", "fiscal_code"}


def _status(value) -> str:
    return str(getattr(value, "value", value) or "").lower()


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _email_marker(member: Member) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), (member.email or "").strip().lower().encode(), hashlib.sha256).hexdigest()


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.SECRET_KEY, salt=_TOKEN_SALT, signer_kwargs={"digest_method": hashlib.sha256})


def _require_eligible(member: Member | None) -> Member:
    if (member is None or member.deleted_at is not None or member.organization is None
            or not member.organization.is_active or member.organization.deleted_at is not None
            or _status(member.signup_source) != SignupSource.ADMIN.value or not (member.email or "").strip()):
        raise HTTPException(status_code=403, detail="Iscrizione non disponibile. Contatta la tua associazione.")
    if _status(member.status) not in _PENDING and not is_member_active(member):
        raise HTTPException(status_code=403, detail="Questa iscrizione non consente il completamento.")
    return member


def queue_member_onboarding(db: Session, request: Request, member: Member, *, throttle: bool = True) -> str:
    """Atomically enqueue an actionable invitation; the caller commits.

    Pending transport retries reuse the same link/outbox, including after a
    lost HTTP response. Delivered invitations are throttled for ten minutes.
    """
    from app.services.member_bulk import acquire_sqlite_member_action_lock
    acquire_sqlite_member_action_lock(db)
    db.flush()
    member = _require_eligible(db.query(Member).filter(Member.id == member.id).with_for_update().populate_existing().first())
    now = datetime.utcnow()
    marker = _email_marker(member)
    prefix = f"member-onboarding:{member.id}:{member.auth_version}:"
    previous = db.query(EmailOutbox).filter(
        EmailOutbox.email_type == ONBOARDING_EMAIL_TYPE, EmailOutbox.dedupe_key.like(prefix + "%"),
    ).order_by(EmailOutbox.created_at.desc(), EmailOutbox.id.desc()).first()
    if previous:
        meta = (previous.payload_json or {}).get("meta") or {}
        same_email = hmac.compare_digest(str(meta.get("email_marker") or ""), marker)
        proof = db.query(Token).filter(Token.id == meta.get("proof_id"), Token.member_id == member.id,
            Token.purpose == TokenType.REGISTRATION_CONTINUATION, Token.used_at.is_(None),
            Token.auth_version == member.auth_version, Token.expires_at > now).first()
        if same_email and proof and previous.status in {"queued", "sending", "failed"}:
            if previous.status == "failed":
                previous.status = "queued"
                previous.attempts = 0
                previous.last_error = None
                previous.next_retry_at = datetime.now(timezone.utc)
                db.flush()
            return previous.id
        elapsed = (datetime.now(timezone.utc) - _utc(previous.created_at)).total_seconds()
        if throttle and same_email and elapsed < 600:
            raise HTTPException(status_code=429, detail="Invito già inviato di recente. Riprova tra qualche minuto.", headers={"Retry-After": str(max(1, int(600 - elapsed)))})
    db.execute(update(Token).where(Token.member_id == member.id,
        Token.purpose == TokenType.REGISTRATION_CONTINUATION, Token.used_at.is_(None)).values(used_at=now))
    raw_proof, proof = issue_member_auth_token(db, member=member, purpose=TokenType.REGISTRATION_CONTINUATION,
        expires_at=now + timedelta(seconds=ONBOARDING_TOKEN_TTL_SECONDS))
    db.flush()
    token = _serializer().dumps({"v": 1, "proof": raw_proof, "member_id": member.id, "org_id": member.org_id, "email_marker": marker})
    base = (settings.FRONTEND_URL or settings.BASE_URL or str(request.base_url)).rstrip("/")
    link = f"{base}/completa-iscrizione#token={token}"
    org_name = member.organization.name or "la tua associazione"
    name = f"{member.first_name or ''} {member.last_name or ''}".strip() or "Socio"
    body = (f"Ciao {name},\n\n{org_name} ha registrato la tua iscrizione. "
        "Apri il link personale per impostare la password e caricare gli eventuali documenti richiesti, "
        "anche prima dell'attivazione della tessera.\n\n"
        "L'associazione verificherà l'iscrizione. Questo passaggio non attiva automaticamente la tessera.")
    return enqueue_email(db, email_type=ONBOARDING_EMAIL_TYPE, to_email=member.email,
        subject=f"Completa la tua iscrizione - {org_name}",
        payload=build_email_payload(text_body=f"{body}\n\nCompleta l'iscrizione: {link}\n\nIl link è personale e scade dopo 72 ore.",
            html_body=build_system_email_html(title="Completa la tua iscrizione", body=body,
                eyebrow="Iscrizione socio", organization_name=org_name, cta_url=link, cta_label="Imposta password e completa iscrizione",
                footer="Il link è personale e scade dopo 72 ore. Permette soltanto di completare la tua iscrizione."),
            sender=build_sender_payload(mode="association", association=member.organization),
            meta={"member_id": member.id, "org_id": member.org_id, "proof_id": proof.id, "email_marker": marker, "communication_purpose": "service"}),
        priority=1, dedupe_key=prefix + str(proof.id))


def establish_onboarding_session(request: Request, db: Session, token: str) -> dict:
    try:
        payload = _serializer().loads(token, max_age=ONBOARDING_TOKEN_TTL_SECONDS)
        if not isinstance(payload, dict) or payload.get("v") != 1:
            raise ValueError()
        raw = payload["proof"]
        if not isinstance(raw, str) or not raw:
            raise ValueError()
        member = consume_member_auth_token(db, raw_token=raw, purpose=TokenType.REGISTRATION_CONTINUATION,
            member_id=int(payload["member_id"]))
        if member is None:
            raise ValueError()
        member = _require_eligible(member)
        if member.org_id != int(payload["org_id"]) or not hmac.compare_digest(_email_marker(member), str(payload["email_marker"])):
            raise ValueError()
        scope = {"member_id": member.id, "org_id": member.org_id, "auth_version": member.auth_version,
            "email_marker": _email_marker(member), "expires_at": int(time.time()) + ONBOARDING_SESSION_TTL_SECONDS}
        result = serialize_onboarding_context(db, member, scope)
        db.commit()
    except (BadData, ValueError, KeyError, TypeError) as exc:
        db.rollback()
        raise HTTPException(status_code=401, detail="Il link è scaduto, già utilizzato o non valido. Richiedi un nuovo invito alla tua associazione.") from exc
    except Exception:
        db.rollback()
        raise
    request.session[ONBOARDING_SESSION_KEY] = scope
    return result


def get_onboarding_context(request: Request, db: Session, *, lock: bool = False) -> tuple[Member, dict]:
    scope = request.session.get(ONBOARDING_SESSION_KEY)
    if not isinstance(scope, dict) or type(scope.get("member_id")) is not int or type(scope.get("auth_version")) is not int:
        raise HTTPException(status_code=401, detail="Apri il link personale ricevuto via email.")
    if int(scope.get("expires_at") or 0) <= int(time.time()):
        request.session.pop(ONBOARDING_SESSION_KEY, None)
        raise HTTPException(status_code=401, detail="La sessione di completamento è scaduta. Richiedi un nuovo invito.")
    query = db.query(Member).filter(Member.id == scope["member_id"])
    if lock:
        query = query.with_for_update()
    member = query.populate_existing().first()
    try:
        member = _require_eligible(member)
        if member.org_id != scope.get("org_id") or member.auth_version != scope["auth_version"] or not hmac.compare_digest(_email_marker(member), str(scope.get("email_marker") or "")):
            raise HTTPException(status_code=401, detail="La sessione non è più valida. Richiedi un nuovo invito.")
    except HTTPException:
        request.session.pop(ONBOARDING_SESSION_KEY, None)
        raise
    return member, dict(scope)


def _latest_documents(db: Session, member_id: int) -> list[MemberDocument]:
    latest = {}
    for document in db.query(MemberDocument).filter(MemberDocument.member_id == member_id,
            MemberDocument.doc_type.in_(_DOCUMENT_TYPES)).order_by(MemberDocument.uploaded_at.desc(), MemberDocument.id.desc()):
        latest.setdefault(document.doc_type, document)
    return list(latest.values())


def serialize_onboarding_context(db: Session, member: Member, scope: dict) -> dict:
    documents = _latest_documents(db, member.id)
    has_identity = any(doc.doc_type == "identity" and doc.status in {"approved", "pending", "uploaded"} for doc in documents)
    return {"member": {"display_name": f"{member.first_name or ''} {member.last_name or ''}".strip(),
            "email": member.email, "has_password": bool(member.password_hash), "is_active": is_member_active(member), "status": _status(member.status)},
        "organization": {"name": member.organization.name, "require_identity_document": bool(member.organization.require_membership_document)},
        "documents": [{"id": doc.id, "type": doc.doc_type, "filename": doc.original_filename,
            "status": doc.status, "rejection_note": doc.rejection_note} for doc in documents],
        "completed": bool(member.password_hash) and (not member.organization.require_membership_document or has_identity),
        "session_expires_in_seconds": max(0, int(scope["expires_at"]) - int(time.time()))}


@dataclass(frozen=True)
class StagedOnboardingUpload:
    doc_type: str
    rel_path: str
    size_bytes: int
    sha256: str
    filename: str
    mime_type: str


def cleanup_staged_uploads(uploads: list[StagedOnboardingUpload], retained: set[str] | None = None) -> None:
    for upload in uploads:
        if upload.rel_path in (retained or set()):
            continue
        try:
            # A database transport error during COMMIT can leave its outcome
            # uncertain. Never remove a staged file that became referenced.
            from app.db import SessionLocal
            with SessionLocal() as check:
                if check.query(MemberDocument.id).filter(MemberDocument.rel_path == upload.rel_path).first():
                    continue
            resolve_storage_target(storage_root=UPLOADS_ROOT, relative_path=upload.rel_path).unlink(missing_ok=True)
        except Exception:
            logger.exception("Failed onboarding staging cleanup")


def prepare_onboarding_password(member: Member, password: str | None) -> str | None:
    if not password:
        if not member.password_hash:
            raise HTTPException(status_code=400, detail="Imposta una password per completare l'iscrizione.")
        return None
    if len(password) < MIN_MEMBER_PASSWORD_LENGTH or len(password) > 1024:
        raise HTTPException(status_code=400, detail=f"La password deve avere almeno {MIN_MEMBER_PASSWORD_LENGTH} caratteri e non superare 1024 caratteri.")
    return get_password_hash(password) if not member.password_hash else None


def complete_onboarding(request: Request, db: Session, uploads: list[StagedOnboardingUpload], password: str | None,
        prepared_password: str | None) -> dict:
    """Synchronous finalization: no upload reads/awaits while member is locked."""
    from app.services.member_bulk import acquire_sqlite_member_action_lock
    retained: set[str] = set()
    try:
        acquire_sqlite_member_action_lock(db)
        member, scope = get_onboarding_context(request, db, lock=True)
        if password and member.password_hash:
            if not scope.get("password_set") or not verify_password(password, member.password_hash):
                raise HTTPException(status_code=409, detail="La password è già impostata. Usa il recupero password per cambiarla.")
        latest = {doc.doc_type: doc for doc in _latest_documents(db, member.id)}
        for upload in uploads:
            if upload.doc_type not in _DOCUMENT_TYPES:
                raise HTTPException(status_code=400, detail="Tipo di documento non valido.")
            existing = latest.get(upload.doc_type)
            if existing and existing.status != DocStatus.REJECTED.value:
                if existing.sha256 == upload.sha256:
                    continue
                raise HTTPException(status_code=409, detail="Il documento è già caricato o approvato. Attendi la verifica dell'associazione.")
            document = MemberDocument(member_id=member.id, doc_type=upload.doc_type,
                rel_path=upload.rel_path, original_filename=upload.filename, mime_type=upload.mime_type,
                size_bytes=upload.size_bytes, sha256=upload.sha256, status=DocStatus.PENDING.value,
                replaces_document_id=existing.id if existing else None)
            db.add(document)
            latest[upload.doc_type] = document
            retained.add(upload.rel_path)
        if member.organization.require_membership_document and not any(
                doc.doc_type == "identity" and doc.status in {"pending", "uploaded", "approved"} for doc in latest.values()):
            raise HTTPException(status_code=400, detail="Carica il documento di identità richiesto dall'associazione.")
        password_changed = False
        if not member.password_hash:
            if prepared_password is None:
                raise HTTPException(status_code=400, detail="Imposta una password per completare l'iscrizione.")
            member = replace_member_password(db, member_id=member.id, expected_version=scope["auth_version"], password_hash=prepared_password)
            scope["auth_version"] = member.auth_version
            scope["password_set"] = True
            password_changed = True
        db.flush()
        result = serialize_onboarding_context(db, member, scope)
        if password_changed or retained:
            audit.log_operation(db, action="member.onboarding_completed", entity_type="member", entity_id=member.id,
                actor_member_id=member.id, actor_role="member_onboarding", org_id=member.org_id,
                metadata={"org_id": member.org_id, "password_set": password_changed, "documents_added": len(retained)})
        db.commit()
    except Exception:
        db.rollback()
        cleanup_staged_uploads(uploads)
        raise
    request.session[ONBOARDING_SESSION_KEY] = scope
    cleanup_staged_uploads(uploads, retained)
    message = (
        "Profilo completato. La tua iscrizione è attiva: puoi accedere con la password."
        if result["member"]["is_active"] else
        "Iscrizione completata. L'associazione verificherà i dati e attiverà la tessera."
    )
    return {**result, "ok": True, "message": message}
