from __future__ import annotations

import hashlib
import hmac
import time
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request, UploadFile
from itsdangerous import BadData, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy.orm import Session

from app.config import settings
from app.models import DocStatus, Member, MemberDocument, MemberStatus
from app.services.system_email_layout import build_system_email_html
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload
from app.utils import save_upload_file


DOCUMENT_CORRECTION_TOKEN_TTL_SECONDS = 72 * 60 * 60
DOCUMENT_CORRECTION_SESSION_TTL_SECONDS = 60 * 60
DOCUMENT_CORRECTION_SESSIONS_KEY = "member_document_corrections"
DOCUMENT_CORRECTION_ACTIVE_DOCUMENT_KEY = "member_document_correction_active_document"

_TOKEN_SALT = "member-document-correction-v1"
_ELIGIBLE_MEMBER_STATUSES = {
    MemberStatus.PENDING_VERIFICATION.value,
    MemberStatus.PENDING_DOCS.value,
    MemberStatus.PENDING_CARDS.value,
    MemberStatus.ACTIVE.value,
}


@dataclass(frozen=True)
class DocumentCorrectionContext:
    member: Member
    document: MemberDocument


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(
        settings.SECRET_KEY,
        salt=_TOKEN_SALT,
        signer_kwargs={"digest_method": hashlib.sha256},
        serializer_kwargs={"sort_keys": True},
    )


def _review_marker(document: MemberDocument) -> str:
    reviewed_at = document.reviewed_at
    review_timestamp = (
        reviewed_at.isoformat(timespec="microseconds") if reviewed_at else ""
    )
    state = f"{int(document.id)}|{document.status or ''}|{review_timestamp}"
    return hashlib.sha256(state.encode("utf-8")).hexdigest()


def create_document_correction_token(document: MemberDocument) -> str:
    return _serializer().dumps(
        {
            "v": 1,
            "member_id": int(document.member_id),
            "document_id": int(document.id),
            "review_marker": _review_marker(document),
        }
    )


def decode_document_correction_token(raw_token: str) -> dict[str, Any]:
    token = (raw_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token di correzione mancante.")

    try:
        payload = _serializer().loads(
            token,
            max_age=DOCUMENT_CORRECTION_TOKEN_TTL_SECONDS,
        )
    except SignatureExpired as exc:
        raise HTTPException(
            status_code=401,
            detail="Il link di correzione e scaduto. Contatta la tua associazione.",
        ) from exc
    except BadData as exc:
        raise HTTPException(
            status_code=401,
            detail="Il link di correzione non e valido.",
        ) from exc

    if not isinstance(payload, dict) or payload.get("v") != 1:
        raise HTTPException(status_code=401, detail="Il link di correzione non e valido.")

    try:
        member_id = int(payload["member_id"])
        document_id = int(payload["document_id"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=401,
            detail="Il link di correzione non e valido.",
        ) from exc

    review_marker = payload.get("review_marker")
    if member_id <= 0 or document_id <= 0 or not isinstance(review_marker, str):
        raise HTTPException(status_code=401, detail="Il link di correzione non e valido.")

    return {
        "member_id": member_id,
        "document_id": document_id,
        "review_marker": review_marker,
    }


def _has_replacement(db: Session, document_id: int) -> bool:
    return (
        db.query(MemberDocument.id)
        .filter(MemberDocument.replaces_document_id == document_id)
        .first()
        is not None
    )


def _load_eligible_context(
    db: Session,
    *,
    member_id: int,
    document_id: int,
    review_marker: str,
    lock_document: bool = False,
) -> DocumentCorrectionContext:
    query = db.query(MemberDocument).filter(
        MemberDocument.id == document_id,
        MemberDocument.member_id == member_id,
    )
    if lock_document:
        query = query.with_for_update()
    document = query.first()
    if document is None:
        raise HTTPException(status_code=404, detail="Documento non trovato.")

    member = (
        db.query(Member)
        .filter(
            Member.id == member_id,
            Member.deleted_at.is_(None),
        )
        .first()
    )
    if member is None or member.organization is None:
        raise HTTPException(status_code=404, detail="Pratica non disponibile.")
    member_status = (
        member.status.value if isinstance(member.status, MemberStatus) else str(member.status)
    )
    if member_status not in _ELIGIBLE_MEMBER_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="La pratica non consente piu la correzione del documento.",
        )

    if document.status != DocStatus.REJECTED.value:
        raise HTTPException(
            status_code=409,
            detail="Il documento non risulta piu da correggere.",
        )
    if not hmac.compare_digest(_review_marker(document), review_marker):
        raise HTTPException(
            status_code=401,
            detail="Il link di correzione non e piu valido.",
        )
    if _has_replacement(db, document.id):
        raise HTTPException(
            status_code=409,
            detail="La nuova versione del documento e gia stata inviata.",
        )

    return DocumentCorrectionContext(member=member, document=document)


def establish_document_correction_session(
    request: Request,
    db: Session,
    raw_token: str,
) -> DocumentCorrectionContext:
    payload = decode_document_correction_token(raw_token)
    context = _load_eligible_context(db, **payload)
    now = int(time.time())
    raw_sessions = request.session.get(DOCUMENT_CORRECTION_SESSIONS_KEY)
    sessions: dict[str, dict[str, Any]] = {}
    if isinstance(raw_sessions, dict):
        for key, value in raw_sessions.items():
            if not isinstance(value, dict):
                continue
            try:
                is_unexpired = int(value.get("expires_at") or 0) > now
            except (TypeError, ValueError):
                continue
            if is_unexpired:
                sessions[str(key)] = value
    sessions[str(context.document.id)] = {
        **payload,
        "expires_at": now + DOCUMENT_CORRECTION_SESSION_TTL_SECONDS,
    }
    request.session[DOCUMENT_CORRECTION_SESSIONS_KEY] = dict(
        list(sessions.items())[-5:]
    )
    request.session[DOCUMENT_CORRECTION_ACTIVE_DOCUMENT_KEY] = context.document.id
    return context


def clear_document_correction_session(
    request: Request,
    document_id: int | None = None,
) -> None:
    if document_id is None:
        request.session.pop(DOCUMENT_CORRECTION_SESSIONS_KEY, None)
        request.session.pop(DOCUMENT_CORRECTION_ACTIVE_DOCUMENT_KEY, None)
        return

    raw_sessions = request.session.get(DOCUMENT_CORRECTION_SESSIONS_KEY)
    sessions = dict(raw_sessions) if isinstance(raw_sessions, dict) else {}
    sessions.pop(str(document_id), None)
    if sessions:
        request.session[DOCUMENT_CORRECTION_SESSIONS_KEY] = sessions
    else:
        request.session.pop(DOCUMENT_CORRECTION_SESSIONS_KEY, None)

    if request.session.get(DOCUMENT_CORRECTION_ACTIVE_DOCUMENT_KEY) == document_id:
        if sessions:
            request.session[DOCUMENT_CORRECTION_ACTIVE_DOCUMENT_KEY] = int(
                next(reversed(sessions))
            )
        else:
            request.session.pop(DOCUMENT_CORRECTION_ACTIVE_DOCUMENT_KEY, None)


def get_document_correction_context(
    request: Request,
    db: Session,
    *,
    document_id: int | None = None,
    lock_document: bool = False,
) -> DocumentCorrectionContext:
    raw_sessions = request.session.get(DOCUMENT_CORRECTION_SESSIONS_KEY)
    if not isinstance(raw_sessions, dict):
        raise HTTPException(status_code=401, detail="Sessione di correzione non attiva.")

    selected_document_id = document_id
    if selected_document_id is None:
        try:
            selected_document_id = int(
                request.session[DOCUMENT_CORRECTION_ACTIVE_DOCUMENT_KEY]
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=401,
                detail="Sessione di correzione non attiva.",
            ) from exc

    raw_session = raw_sessions.get(str(selected_document_id))
    if not isinstance(raw_session, dict):
        status_code = 404 if document_id is not None else 401
        raise HTTPException(status_code=status_code, detail="Sessione di correzione non attiva.")

    try:
        expires_at = int(raw_session["expires_at"])
        member_id = int(raw_session["member_id"])
        document_id = int(raw_session["document_id"])
        review_marker = str(raw_session["review_marker"])
    except (KeyError, TypeError, ValueError) as exc:
        clear_document_correction_session(request, selected_document_id)
        raise HTTPException(status_code=401, detail="Sessione di correzione non valida.") from exc

    if expires_at <= int(time.time()):
        clear_document_correction_session(request, selected_document_id)
        raise HTTPException(
            status_code=401,
            detail="La sessione di correzione e scaduta. Riapri il link ricevuto via email.",
        )

    try:
        return _load_eligible_context(
            db,
            member_id=member_id,
            document_id=document_id,
            review_marker=review_marker,
            lock_document=lock_document,
        )
    except HTTPException as exc:
        if exc.status_code in {401, 404, 409}:
            clear_document_correction_session(request, selected_document_id)
        raise


def serialize_document_correction_context(
    context: DocumentCorrectionContext,
) -> dict[str, Any]:
    member = context.member
    document = context.document
    return {
        "member": {
            "display_name": f"{member.first_name or ''} {member.last_name or ''}".strip(),
        },
        "organization": {
            "name": member.organization.name,
        },
        "document": {
            "id": document.id,
            "type": document.doc_type,
            "filename": document.original_filename,
            "mime_type": document.mime_type,
            "size_bytes": document.size_bytes,
            "rejection_note": document.rejection_note,
            "reviewed_at": document.reviewed_at.isoformat() if document.reviewed_at else None,
        },
        "session_expires_in_seconds": DOCUMENT_CORRECTION_SESSION_TTL_SECONDS,
    }


async def create_replacement_document(
    db: Session,
    *,
    member: Member,
    document: MemberDocument,
    upload: UploadFile,
) -> MemberDocument:
    if document.member_id != member.id:
        raise HTTPException(status_code=404, detail="Documento non trovato.")
    if document.status != DocStatus.REJECTED.value:
        raise HTTPException(
            status_code=400,
            detail="Il documento puo essere reinviato solo se rigettato.",
        )
    if _has_replacement(db, document.id):
        raise HTTPException(
            status_code=409,
            detail="La nuova versione del documento e gia stata inviata.",
        )

    rel_path, size_bytes, sha256 = await save_upload_file(
        upload,
        sub_directory=f"{member.org_id}/{member.id}",
    )
    replacement = MemberDocument(
        member_id=member.id,
        doc_type=document.doc_type,
        rel_path=rel_path,
        original_filename=upload.filename,
        mime_type=upload.content_type,
        size_bytes=size_bytes,
        sha256=sha256,
        status=DocStatus.PENDING.value,
        replaces_document_id=document.id,
    )
    db.add(replacement)
    db.flush()
    return replacement


def enqueue_document_rejection_email(
    db: Session,
    request: Request,
    document: MemberDocument,
) -> str | None:
    member = document.member
    if member is None or not (member.email or "").strip() or member.organization is None:
        return None
    member_status = (
        member.status.value if isinstance(member.status, MemberStatus) else str(member.status)
    )
    if member_status not in _ELIGIBLE_MEMBER_STATUSES:
        return None

    raw_token = create_document_correction_token(document)
    frontend_base = (settings.FRONTEND_URL or "").strip().rstrip("/")
    if not frontend_base:
        frontend_base = str(request.base_url).rstrip("/")
    correction_url = f"{frontend_base}/dashboard/documenti/correzione?token={raw_token}"

    org_name = member.organization.name or "la tua associazione"
    member_name = f"{member.first_name or ''} {member.last_name or ''}".strip() or "Socio"
    doc_label = {
        "identity": "documento di identita",
        "fiscal_code": "documento del codice fiscale",
    }.get(document.doc_type, "documento")
    reason = (document.rejection_note or "Il documento necessita di una nuova versione.").strip()
    text_body = (
        f"Ciao {member_name},\n\n"
        f"{org_name} ha richiesto la correzione del tuo {doc_label}.\n"
        f"Motivazione: {reason}\n\n"
        f"Carica la nuova versione dalla tua area riservata: {correction_url}\n\n"
        "Il link e personale e scade dopo 72 ore. L'accesso permette esclusivamente "
        "di vedere la motivazione e reinviare il documento richiesto."
    )
    html_body = build_system_email_html(
        title="Documento da correggere",
        eyebrow="Documenti socio",
        organization_name=org_name,
        preheader=f"È richiesta una nuova versione del tuo {doc_label}.",
        body=f"Ciao {member_name},\n\n{org_name} ha richiesto la correzione del tuo {doc_label}.",
        details=[("Motivazione", reason)],
        cta_url=correction_url,
        cta_label="Carica la nuova versione",
        footer="Il link è personale e scade dopo 72 ore. L'accesso permette esclusivamente di vedere la motivazione e reinviare il documento richiesto.",
    )
    return enqueue_email(
        db,
        email_type="member_document_rejected",
        to_email=member.email,
        subject=f"Documento da correggere - {org_name}",
        payload=build_email_payload(
            text_body=text_body,
            html_body=html_body,
            sender=build_sender_payload(mode="association", association=member.organization),
            meta={
                "member_id": member.id,
                "org_id": member.org_id,
                "document_id": document.id,
                "communication_purpose": "service",
            },
        ),
        priority=1,
        dedupe_key=f"member-document-rejected:{document.id}:{_review_marker(document)}",
    )
