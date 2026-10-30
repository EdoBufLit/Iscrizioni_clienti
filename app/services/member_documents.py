"""Atomic member document submissions, with file I/O outside database locks."""
from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app import audit
from app.db import SessionLocal
from app.middleware import get_client_ip
from app.models import DocStatus, Member, MemberDocument
from app.services.file_deletion import UPLOADS_ROOT, resolve_storage_target
from app.services.member_activity import is_member_active
from app.services.member_document_correction import get_document_correction_context
from app.services.member_sessions import resolve_member_session
from app.services.org_admin_notifications import notify_org_admins_about_member_document
from app.utils import save_upload_file

logger = logging.getLogger(__name__)
MEMBER_DOCUMENT_TYPES = ("identity", "fiscal_code")


@dataclass(frozen=True)
class StagedMemberDocument:
    doc_type: str
    rel_path: str
    size_bytes: int
    sha256: str
    filename: str
    mime_type: str


async def stage_member_document(upload: UploadFile, *, member_id: int, org_id: int, doc_type: str) -> StagedMemberDocument:
    path, size, digest = await save_upload_file(upload, sub_directory=f"{org_id}/{member_id}")
    return StagedMemberDocument(doc_type, path, size, digest, upload.filename or "documento", upload.content_type or "")


def cleanup_staged_member_document(staged: StagedMemberDocument) -> None:
    try:
        # A transport failure during COMMIT may have an uncertain outcome.
        # Never remove a file that was successfully referenced in the database.
        with SessionLocal() as check:
            if check.query(MemberDocument.id).filter(MemberDocument.rel_path == staged.rel_path).first():
                return
        resolve_storage_target(storage_root=UPLOADS_ROOT, relative_path=staged.rel_path).unlink(missing_ok=True)
    except Exception:
        logger.exception("Failed to clean up a staged member document")


def latest_member_documents(db: Session, member_id: int) -> dict[str, MemberDocument]:
    latest = {}
    for document in db.query(MemberDocument).filter(MemberDocument.member_id == member_id,
            MemberDocument.doc_type.in_(MEMBER_DOCUMENT_TYPES)).order_by(MemberDocument.uploaded_at.desc(), MemberDocument.id.desc()):
        latest.setdefault(document.doc_type, document)
    return latest


def _submission_result(document: MemberDocument) -> dict:
    return {"ok": True, "id": document.id, "type": document.doc_type, "status": document.status,
        "message": "Documento inviato all'associazione. È in attesa di verifica."}


def store_member_document(request: Request, db: Session, staged: StagedMemberDocument, *, member_id: int,
        expected_auth_version: int | None = None, replace_document_id: int | None = None,
        limited_correction: bool = False) -> dict:
    """Recheck ownership and eligibility after upload, then save once atomically."""
    from app.services.member_bulk import acquire_sqlite_member_action_lock
    try:
        acquire_sqlite_member_action_lock(db)
        member = db.query(Member).filter(Member.id == member_id).with_for_update().populate_existing().first()
        if (member is None or member.deleted_at is not None or member.organization is None
                or not member.organization.is_active or member.organization.deleted_at is not None):
            raise HTTPException(status_code=401, detail="Iscrizione non disponibile. Accedi nuovamente.")
        if limited_correction:
            context = get_document_correction_context(request, db, document_id=replace_document_id, lock_document=True)
            if context.member.id != member.id or context.document.doc_type != staged.doc_type:
                raise HTTPException(status_code=404, detail="Documento non trovato.")
        else:
            authenticated = resolve_member_session(request, db)
            if (authenticated is None or authenticated.id != member.id
                    or member.auth_version != expected_auth_version or not is_member_active(member)):
                raise HTTPException(status_code=401, detail="Sessione scaduta. Accedi nuovamente.")
        if staged.doc_type not in MEMBER_DOCUMENT_TYPES:
            raise HTTPException(status_code=400, detail="Tipo di documento non valido.")

        previous = latest_member_documents(db, member.id).get(staged.doc_type)
        requested = None
        if replace_document_id is not None:
            requested = db.query(MemberDocument).filter(MemberDocument.id == replace_document_id,
                MemberDocument.member_id == member.id).with_for_update().populate_existing().first()
            if requested is None or requested.doc_type != staged.doc_type:
                raise HTTPException(status_code=404, detail="Documento non trovato.")
            if requested.status != DocStatus.REJECTED.value:
                raise HTTPException(status_code=400, detail="Il documento può essere reinviato solo se rigettato.")
        if previous and previous.status != DocStatus.REJECTED.value:
            if previous.sha256 == staged.sha256 and previous.status in {DocStatus.PENDING.value, "uploaded"}:
                result = _submission_result(previous)
                db.rollback()
                return result
            raise HTTPException(status_code=409, detail="Il documento è già inviato o approvato. Attendi la verifica dell'associazione.")
        if requested is not None and (previous is None or previous.id != requested.id):
            raise HTTPException(status_code=409, detail="Questa versione è già stata sostituita. Aggiorna i documenti.")

        document = MemberDocument(member_id=member.id, doc_type=staged.doc_type,
            rel_path=staged.rel_path, original_filename=staged.filename, mime_type=staged.mime_type,
            size_bytes=staged.size_bytes, sha256=staged.sha256, status=DocStatus.PENDING.value,
            replaces_document_id=previous.id if previous else None)
        db.add(document)
        db.flush()
        notify_org_admins_about_member_document(db, member=member, document=document)
        action = ("member.document.resubmit_limited_session" if limited_correction else
            "member.document.resubmit" if previous else "member.document.upload")
        audit.log_operation(db, action=action, entity_type="member_document", entity_id=document.id,
            actor_member_id=member.id, actor_role="member_document_correction" if limited_correction else "member",
            org_id=member.org_id, metadata={"org_id": member.org_id, "member_id": member.id,
                "doc_type": document.doc_type, "replaces_document_id": document.replaces_document_id,
                "limited_session": limited_correction}, ip=get_client_ip(request))
        result = _submission_result(document)
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise
    finally:
        cleanup_staged_member_document(staged)
