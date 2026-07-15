from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import uuid
from datetime import datetime

from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.models import (
    AccountingCategory,
    AccountingDocument,
    AccountingFolder,
    AccountingShareLink,
    OrganizationSharedDocument,
    OrganizationSharedDocumentAssignment,
)
from app.services.accounting_capability import (
    AccountingCapabilityIntegrityError,
    accounting_share_token,
    accounting_share_token_hash,
    initialize_accounting_share_capability,
)
from app.utils import hash_token

SYSTEM_ACCOUNTING_CATEGORIES: tuple[dict[str, object], ...] = (
    {"code": "vat", "name": "IVA", "sort_order": 100},
    {"code": "payroll", "name": "PAGHE", "sort_order": 200},
    {"code": "tax_return", "name": "DICHIARAZIONE DEI REDDITI", "sort_order": 300},
)

DEFAULT_ACCOUNTING_FOLDER_NAME = "Archivio"
DEFAULT_ACCOUNTING_FOLDER_SLUG = "archivio"
DEFAULT_ACCOUNTING_CATEGORY_NAME = "Generale"
DEFAULT_ACCOUNTING_CATEGORY_CODE = "custom_generale"

ACCOUNTING_ALLOWED_FILE_TYPES = {
    ".pdf": {"application/pdf"},
    ".png": {"image/png"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".csv": {"text/csv", "application/csv"},
    ".xls": {"application/vnd.ms-excel"},
    ".xlsx": {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/octet-stream",
    },
    ".doc": {"application/msword"},
    ".docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream",
    },
}


def slugify_accounting_label(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    normalized = normalized.strip("-")
    return normalized or "item"


def is_accounting_previewable_mime(mime_type: str | None) -> bool:
    normalized = (mime_type or "").strip().lower()
    if not normalized:
        return False
    return normalized == "application/pdf" or normalized.startswith("image/")


def accounting_document_preview_available(document: AccountingDocument) -> bool:
    return bool(document.preview_enabled) and is_accounting_previewable_mime(
        document.mime_type
    )


def accounting_document_full_path(document: AccountingDocument) -> str:
    return os.path.join(settings.UPLOAD_DIR, document.storage_key)


def build_accounting_file_response(
    document: AccountingDocument,
    *,
    content_disposition_type: str,
) -> FileResponse:
    full_path = accounting_document_full_path(document)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File non trovato su disco.")
    return FileResponse(
        full_path,
        filename=document.original_filename,
        media_type=document.mime_type or "application/octet-stream",
        content_disposition_type=content_disposition_type,
    )


def ensure_accounting_seed_data(db: Session) -> dict[str, int]:
    created_folders = 0
    created_categories = 0

    folder = (
        db.query(AccountingFolder)
        .filter(AccountingFolder.slug == DEFAULT_ACCOUNTING_FOLDER_SLUG)
        .first()
    )
    if folder is None:
        folder = AccountingFolder(
            org_id=None,
            name=DEFAULT_ACCOUNTING_FOLDER_NAME,
            slug=DEFAULT_ACCOUNTING_FOLDER_SLUG,
            year=None,
            sort_order=10,
            is_active=True,
            is_default=True,
        )
        db.add(folder)
        created_folders += 1

    for definition in SYSTEM_ACCOUNTING_CATEGORIES:
        category = (
            db.query(AccountingCategory)
            .filter(AccountingCategory.code == str(definition["code"]))
            .first()
        )
        if category is None:
            db.add(
                AccountingCategory(
                    org_id=None,
                    code=str(definition["code"]),
                    name=str(definition["name"]),
                    is_system=True,
                    sort_order=int(definition["sort_order"]),
                    is_active=True,
                )
            )
            created_categories += 1

    default_category = (
        db.query(AccountingCategory)
        .filter(AccountingCategory.code == DEFAULT_ACCOUNTING_CATEGORY_CODE)
        .first()
    )
    if default_category is None:
        db.add(
            AccountingCategory(
                org_id=None,
                code=DEFAULT_ACCOUNTING_CATEGORY_CODE,
                name=DEFAULT_ACCOUNTING_CATEGORY_NAME,
                is_system=False,
                sort_order=1000,
                is_active=True,
            )
        )
        created_categories += 1

    if created_folders or created_categories:
        db.flush()
    return {
        "folders_created": created_folders,
        "categories_created": created_categories,
    }


def get_default_accounting_folder(db: Session) -> AccountingFolder:
    ensure_accounting_seed_data(db)
    folder = (
        db.query(AccountingFolder)
        .filter(AccountingFolder.slug == DEFAULT_ACCOUNTING_FOLDER_SLUG)
        .first()
    )
    if folder is None:
        raise RuntimeError("Default accounting folder missing after seed.")
    return folder


def get_default_accounting_category(db: Session) -> AccountingCategory:
    ensure_accounting_seed_data(db)
    category = (
        db.query(AccountingCategory)
        .filter(AccountingCategory.code == DEFAULT_ACCOUNTING_CATEGORY_CODE)
        .first()
    )
    if category is None:
        raise RuntimeError("Default accounting category missing after seed.")
    return category


def backfill_legacy_accounting_documents(db: Session) -> int:
    folder = get_default_accounting_folder(db)
    category = get_default_accounting_category(db)

    existing_pairs = {
        (legacy_id, org_id)
        for legacy_id, org_id in db.query(
            AccountingDocument.legacy_shared_document_id,
            AccountingDocument.org_id,
        )
        .filter(AccountingDocument.legacy_shared_document_id.isnot(None))
        .all()
    }

    assignments = (
        db.query(OrganizationSharedDocumentAssignment)
        .options(joinedload(OrganizationSharedDocumentAssignment.document))
        .join(
            OrganizationSharedDocument,
            OrganizationSharedDocument.id
            == OrganizationSharedDocumentAssignment.document_id,
        )
        .filter(OrganizationSharedDocument.kind == "accounting")
        .order_by(OrganizationSharedDocumentAssignment.id.asc())
        .all()
    )

    created = 0
    for assignment in assignments:
        legacy_document = assignment.document
        if legacy_document is None:
            continue
        key = (legacy_document.id, assignment.association_id)
        if key in existing_pairs:
            continue
        created_at = legacy_document.created_at or datetime.utcnow()
        db.add(
            AccountingDocument(
                org_id=assignment.association_id,
                folder_id=folder.id,
                category_id=category.id,
                title=legacy_document.title,
                description=legacy_document.description,
                storage_key=legacy_document.rel_path,
                original_filename=legacy_document.original_filename
                or os.path.basename(legacy_document.rel_path),
                mime_type=legacy_document.mime_type,
                file_size=legacy_document.size_bytes,
                sha256=legacy_document.sha256,
                preview_enabled=is_accounting_previewable_mime(
                    legacy_document.mime_type
                ),
                is_share_enabled=False,
                uploaded_by_admin_id=legacy_document.uploaded_by_admin_id,
                legacy_shared_document_id=legacy_document.id,
                created_at=created_at,
                updated_at=created_at,
            )
        )
        existing_pairs.add(key)
        created += 1

    if created:
        db.flush()
    return created


async def save_accounting_upload_file(upload_file: UploadFile) -> tuple[str, int, str]:
    content_type = (upload_file.content_type or "").strip().lower()
    file_ext = os.path.splitext(upload_file.filename or "")[1].lower()
    allowed_types = ACCOUNTING_ALLOWED_FILE_TYPES.get(file_ext)
    if not allowed_types or content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Formato file non supportato. Usa PDF, immagini o documenti Office comuni.",
        )

    safe_filename = "".join(
        c for c in (upload_file.filename or "document") if c.isalnum() or c in "._-"
    ).strip("._")
    if not safe_filename:
        safe_filename = f"document{file_ext or '.bin'}"

    sub_directory = os.path.join(
        "accounting-documents", datetime.utcnow().strftime("%Y/%m")
    )
    target_dir = os.path.join(settings.UPLOAD_DIR, sub_directory)
    os.makedirs(target_dir, exist_ok=True)

    unique_filename = f"{uuid.uuid4()}_{safe_filename}"
    full_path = os.path.join(target_dir, unique_filename)
    size_bytes = 0
    sha256_hash = hashlib.sha256()

    try:
        with open(full_path, "wb") as buffer:
            while True:
                chunk = await upload_file.read(4096)
                if not chunk:
                    break
                size_bytes += len(chunk)
                if size_bytes > 20 * 1024 * 1024:
                    raise HTTPException(
                        status_code=400, detail="File troppo grande. Max 20 MB."
                    )
                buffer.write(chunk)
                sha256_hash.update(chunk)
    except Exception:
        if os.path.exists(full_path):
            os.remove(full_path)
        raise

    if size_bytes <= 0:
        if os.path.exists(full_path):
            os.remove(full_path)
        raise HTTPException(status_code=400, detail="File vuoto.")

    rel_path = os.path.join(sub_directory, unique_filename)
    return rel_path, size_bytes, sha256_hash.hexdigest()


def create_accounting_share_link(
    db: Session,
    *,
    document: AccountingDocument,
    created_by_admin_id: int | None,
    expires_at: datetime | None,
) -> AccountingShareLink:
    if not bool(document.is_share_enabled):
        raise HTTPException(
            status_code=403,
            detail="La condivisione non ? abilitata per questo documento.",
        )
    if expires_at is not None and expires_at <= datetime.utcnow():
        raise HTTPException(
            status_code=422,
            detail="La scadenza deve essere futura.",
        )

    link = AccountingShareLink(
        document_id=document.id,
        # Temporary non-public verifier, needed only because the legacy column
        # is NOT NULL before the database allocates the row id.
        token=hash_token(secrets.token_urlsafe(32)),
        expires_at=expires_at,
        created_by_admin_id=created_by_admin_id,
        revoked_at=None,
    )
    db.add(link)
    db.flush()
    initialize_accounting_share_capability(link)
    db.flush()
    return link


def resolve_accounting_share_link(
    db: Session,
    *,
    token: str,
) -> AccountingShareLink:
    normalized = (token or "").strip()
    if not normalized:
        raise HTTPException(status_code=404, detail="Link di condivisione non valido.")

    candidate_hash = accounting_share_token_hash(normalized)
    link = (
        db.query(AccountingShareLink)
        .options(joinedload(AccountingShareLink.document))
        .filter(
            AccountingShareLink.token_hash == candidate_hash,
            AccountingShareLink.token_version.is_not(None),
        )
        .first()
    )
    if link is not None:
        try:
            canonical_token = accounting_share_token(link)
        except AccountingCapabilityIntegrityError:
            raise HTTPException(
                status_code=404,
                detail="Link di condivisione non trovato.",
            ) from None
        if not hmac.compare_digest(canonical_token, normalized):
            link = None
    else:
        # Compatibility is intentionally restricted to rows without capability
        # metadata, so a leaked verifier from a new row is never a valid bearer.
        link = (
            db.query(AccountingShareLink)
            .options(joinedload(AccountingShareLink.document))
            .filter(
                AccountingShareLink.token == normalized,
                AccountingShareLink.token_hash.is_(None),
                AccountingShareLink.token_version.is_(None),
            )
            .first()
        )
    if link is None or link.document is None:
        raise HTTPException(status_code=404, detail="Link di condivisione non trovato.")
    if link.revoked_at is not None:
        raise HTTPException(status_code=410, detail="Link di condivisione revocato.")
    if link.expires_at is not None and link.expires_at <= datetime.utcnow():
        raise HTTPException(status_code=410, detail="Link di condivisione scaduto.")
    if not bool(link.document.is_share_enabled):
        raise HTTPException(status_code=410, detail="Condivisione non piè disponibile.")
    return link
