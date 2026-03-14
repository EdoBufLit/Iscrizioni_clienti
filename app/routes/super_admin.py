import hashlib
import json
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy.orm import Session, aliased, joinedload
from datetime import datetime, timedelta
from typing import Literal, Optional
import secrets
import re
import math

from sqlalchemy import and_, case, cast, func, or_, text, String
from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError

from app.db import get_db
from app.models import (
    AdminUser,
    AdminRole,
    Organization,
    OrgAdminToken,
    CardBatch,
    CardMovement,
    Member,
    PaymentMethod,
    IntegrationApiKey,
    OrganizationSharedDocument,
    OrganizationSharedDocumentAssignment,
    AccountingCategory,
    AccountingDocument,
    AccountingFolder,
    AccountingShareLink,
)
from app.services.email_outbox import build_email_payload, enqueue_email
from app.security import hash_api_key, verify_password
from app.utils import generate_token, hash_token, save_upload_file
from app.config import settings
from app.middleware import auth_limiter, get_client_ip
from app import audit
from app.services.association_delete import delete_association_and_release_range
from app.services.low_cards_alerts import run_low_cards_alert_job
from app.services.member_activity import get_member_lifecycle_status, is_member_active
from app.services.member_maintenance import expire_and_purge_members
from app.services.org_admin_notifications import (
    notify_org_admins_about_accounting_document,
    notify_org_admins_about_shared_document,
)
from app.services.statute_upload import (
    enforce_statute_request_size_from_headers,
    save_statute_pdf,
)
from app.services.accounting import (
    DEFAULT_ACCOUNTING_CATEGORY_CODE,
    accounting_document_preview_available,
    backfill_legacy_accounting_documents,
    build_accounting_file_response,
    create_accounting_share_link,
    ensure_accounting_seed_data,
    get_default_accounting_category,
    get_default_accounting_folder,
    is_accounting_previewable_mime,
    resolve_accounting_share_link,
    save_accounting_upload_file,
    slugify_accounting_label,
)
from app.models_affiliation import AffiliationApplication

import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/super-admin")
associations_router = APIRouter(prefix="/api/admin")
auth_router = APIRouter(prefix="/auth")

_ALLOWED_MEMBER_PAYMENT_METHODS = {
    PaymentMethod.CASH.value,
    PaymentMethod.BONIFICO.value,
}
_ALLOWED_INTEGRATION_SCOPES = {"issue_member"}
_ALLOWED_SHARED_DOCUMENT_KINDS = {"general", "accounting"}
_ALLOWED_SHARED_DOCUMENT_TARGET_MODES = {
    "single",
    "multiple",
    "all",
    "accounting_enabled",
}
_SHARED_DOCUMENT_ALLOWED_EXTENSIONS = {
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
_ORGANIZATION_SORT_FIELDS = {
    "created_at": Organization.created_at,
    "name": Organization.name,
    "slug": Organization.slug,
    "city": Organization.city,
    "updated_at": Organization.updated_at,
}


def _require_super_admin(request: Request, db: Session) -> AdminUser:
    admin_id = request.session.get("admin_id")
    if not admin_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    admin = (
        db.query(AdminUser)
        .filter(
            AdminUser.id == admin_id,
            AdminUser.role == AdminRole.SUPER_ADMIN,
            AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None),
        )
        .first()
    )
    if not admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return admin


def _serialize_member_payment_method(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, PaymentMethod):
        return value.value
    text = str(value).strip()
    if not text:
        return None
    upper = text.upper()
    return upper if upper in _ALLOWED_MEMBER_PAYMENT_METHODS else text


def _normalize_org_search_term(raw_q: Optional[str]) -> Optional[str]:
    if raw_q is None:
        return None
    cleaned = raw_q.strip()
    return cleaned or None


def _organization_search_filter(raw_q: Optional[str]):
    search_term = _normalize_org_search_term(raw_q)
    if not search_term:
        return None

    pattern = f"%{search_term}%"
    return or_(
        Organization.name.ilike(pattern),
        Organization.slug.ilike(pattern),
        Organization.email.ilike(pattern),
        Organization.club_display_name.ilike(pattern),
    )


def _organization_sort_order(raw_sort: Optional[str]):
    default_field = "created_at"
    default_direction = "desc"

    field_name = default_field
    direction = default_direction
    normalized = (raw_sort or "").strip().lower()
    if normalized:
        candidate_field, separator, candidate_direction = normalized.partition(":")
        if (
            separator
            and candidate_field in _ORGANIZATION_SORT_FIELDS
            and candidate_direction in {"asc", "desc"}
        ):
            field_name = candidate_field
            direction = candidate_direction

    sort_column = _ORGANIZATION_SORT_FIELDS[field_name]
    primary = sort_column.asc() if direction == "asc" else sort_column.desc()
    if field_name == "name":
        return [primary, Organization.id.asc()]
    return [primary, Organization.name.asc(), Organization.id.asc()]


def _serialize_organization_row(
    org: Organization,
    *,
    card_min: Optional[int],
    card_max: Optional[int],
    affiliation_application_id: Optional[int] = None,
    affiliation_status: Optional[str] = None,
):
    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "email": org.email,
        "phone": org.phone,
        "whatsapp_e164": org.whatsapp_e164,
        "club_display_name": org.club_display_name,
        "card_email_subject": org.card_email_subject,
        "card_logo_url": org.card_logo_url,
        "description": org.description,
        "is_active": org.is_active,
        "is_archived": org.deleted_at is not None,
        "last_low_cards_alert_at": org.last_low_cards_alert_at.isoformat()
        if org.last_low_cards_alert_at
        else None,
        "deleted_at": org.deleted_at,
        "created_at": org.created_at,
        "city": org.city,
        "province": org.province,
        "auto_approve_signup": bool(org.auto_approve_signup),
        "require_membership_document": bool(
            getattr(org, "require_membership_document", False)
        ),
        "accounting_enabled": bool(org.accounting_enabled),
        "communications_enabled": bool(org.communications_enabled),
        "card_min": card_min,
        "card_max": card_max,
        "affiliation_application_id": affiliation_application_id,
        "affiliation_status": affiliation_status,
    }


def _list_organizations_payload(
    *,
    q: Optional[str],
    page: int,
    page_size: int,
    sort: Optional[str],
    db: Session,
):
    filters = []
    search_filter = _organization_search_filter(q)
    if search_filter is not None:
        filters.append(search_filter)

    card_ranges_subquery = (
        db.query(
            CardBatch.org_id.label("org_id"),
            func.min(CardBatch.start_no).label("card_min"),
            func.max(CardBatch.end_no).label("card_max"),
        )
        .filter(CardBatch.released_at.is_(None))
        .group_by(CardBatch.org_id)
        .subquery()
    )

    total = db.query(func.count(Organization.id)).filter(*filters).scalar() or 0
    total_pages = max(1, math.ceil(total / page_size)) if page_size else 1

    latest_affiliation_subquery = (
        db.query(
            AffiliationApplication.approved_org_id.label("org_id"),
            func.max(AffiliationApplication.id).label("latest_affiliation_id"),
        )
        .filter(AffiliationApplication.approved_org_id.isnot(None))
        .group_by(AffiliationApplication.approved_org_id)
        .subquery()
    )
    latest_affiliation_alias = aliased(AffiliationApplication)

    try:
        results = (
            db.query(
                Organization,
                card_ranges_subquery.c.card_min,
                card_ranges_subquery.c.card_max,
                latest_affiliation_alias.id.label("affiliation_application_id"),
                latest_affiliation_alias.status.label("affiliation_status"),
            )
            .outerjoin(
                card_ranges_subquery, card_ranges_subquery.c.org_id == Organization.id
            )
            .outerjoin(
                latest_affiliation_subquery,
                latest_affiliation_subquery.c.org_id == Organization.id,
            )
            .outerjoin(
                latest_affiliation_alias,
                latest_affiliation_alias.id
                == latest_affiliation_subquery.c.latest_affiliation_id,
            )
            .filter(*filters)
            .order_by(*_organization_sort_order(sort))
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        items = [
            _serialize_organization_row(
                org,
                card_min=card_min,
                card_max=card_max,
                affiliation_application_id=affiliation_application_id,
                affiliation_status=affiliation_status,
            )
            for (
                org,
                card_min,
                card_max,
                affiliation_application_id,
                affiliation_status,
            ) in results
        ]
    except (OperationalError, ProgrammingError):
        results = (
            db.query(
                Organization,
                card_ranges_subquery.c.card_min,
                card_ranges_subquery.c.card_max,
            )
            .outerjoin(
                card_ranges_subquery, card_ranges_subquery.c.org_id == Organization.id
            )
            .filter(*filters)
            .order_by(*_organization_sort_order(sort))
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        items = [
            _serialize_organization_row(
                org,
                card_min=card_min,
                card_max=card_max,
            )
            for org, card_min, card_max in results
        ]

    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
        # Legacy payload preserved for existing consumers.
        "data": items,
        "meta": {
            "page": page,
            "limit": page_size,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        },
    }


class LoginBody(BaseModel):
    email: str
    password: str


class CreateOrganization(BaseModel):
    name: str
    slug: Optional[str] = None
    club_display_name: Optional[str] = None
    card_email_subject: Optional[str] = None
    card_logo_url: Optional[str] = None
    description: Optional[str] = None
    description_short: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: str = "Italy"
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    whatsapp_e164: Optional[str] = None
    website: Optional[str] = None
    is_active: bool = True
    auto_approve_signup: bool = False
    require_membership_document: bool = False
    accounting_enabled: bool = False


class PatchOrganization(BaseModel):
    name: Optional[str] = None
    club_display_name: Optional[str] = None
    card_email_subject: Optional[str] = None
    card_logo_url: Optional[str] = None
    description: Optional[str] = None
    description_short: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    whatsapp_e164: Optional[str] = None
    website: Optional[str] = None
    is_active: Optional[bool] = None
    auto_approve_signup: Optional[bool] = None
    require_membership_document: Optional[bool] = None
    accounting_enabled: Optional[bool] = None
    communications_enabled: Optional[bool] = None


class CreateAccountingFolderBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=120)
    year: Optional[int] = Field(default=None, ge=2000, le=2200)
    is_active: bool = True
    sort_order: Optional[int] = None


class UpdateAccountingFolderBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    year: Optional[int] = Field(default=None, ge=2000, le=2200)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class CreateAccountingCategoryBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=120)
    is_active: bool = True
    sort_order: Optional[int] = None


class UpdateAccountingCategoryBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


def _normalize_tag_culture(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return value.replace("T.A.G.", "TAG")


def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _serialize_document_target(org: Organization) -> dict[str, object]:
    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "is_active": bool(org.is_active),
        "accounting_enabled": bool(org.accounting_enabled),
    }


def _serialize_shared_document(
    document: OrganizationSharedDocument,
    *,
    include_recipients: bool = False,
) -> dict[str, object]:
    recipient_rows = []
    for assignment in sorted(
        document.assignments,
        key=lambda item: (
            item.organization.name.lower() if item.organization and item.organization.name else "",
            item.association_id,
        ),
    ):
        org = assignment.organization
        if not org:
            continue
        recipient_rows.append(
            {
                "id": org.id,
                "name": org.name,
                "slug": org.slug,
                "accounting_enabled": bool(org.accounting_enabled),
                "assigned_at": assignment.created_at.isoformat()
                if assignment.created_at
                else None,
            }
        )

    payload = {
        "id": document.id,
        "title": document.title,
        "description": document.description,
        "kind": document.kind,
        "created_at": document.created_at.isoformat() if document.created_at else None,
        "original_filename": document.original_filename,
        "mime_type": document.mime_type,
        "size_bytes": document.size_bytes,
        "recipient_count": len(recipient_rows),
        "recipient_preview": recipient_rows[:5],
        "download_url": f"/api/super-admin/documents/{document.id}/download",
        "uploaded_by": {
            "id": document.uploaded_by_admin.id,
            "email": document.uploaded_by_admin.email,
        }
        if document.uploaded_by_admin
        else None,
    }
    if include_recipients:
        payload["recipients"] = recipient_rows
    return payload


def _serialize_accounting_folder(
    folder: AccountingFolder,
    *,
    document_count: int = 0,
) -> dict[str, object]:
    return {
        "id": folder.id,
        "name": folder.name,
        "slug": folder.slug,
        "year": folder.year,
        "sort_order": folder.sort_order,
        "is_active": bool(folder.is_active),
        "is_default": bool(folder.is_default),
        "document_count": int(document_count),
        "created_at": folder.created_at.isoformat() if folder.created_at else None,
        "updated_at": folder.updated_at.isoformat() if folder.updated_at else None,
    }


def _serialize_accounting_category(
    category: AccountingCategory,
    *,
    document_count: int = 0,
) -> dict[str, object]:
    return {
        "id": category.id,
        "code": category.code,
        "name": category.name,
        "is_system": bool(category.is_system),
        "sort_order": category.sort_order,
        "is_active": bool(category.is_active),
        "document_count": int(document_count),
        "created_at": category.created_at.isoformat() if category.created_at else None,
        "updated_at": category.updated_at.isoformat() if category.updated_at else None,
    }


def _serialize_accounting_share_link(
    request: Request,
    link: AccountingShareLink,
) -> dict[str, object]:
    base_url = str(request.base_url).rstrip("/")
    return {
        "id": link.id,
        "token": link.token,
        "url": f"{base_url}/api/public/accounting-share/{link.token}",
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        "revoked_at": link.revoked_at.isoformat() if link.revoked_at else None,
        "created_at": link.created_at.isoformat() if link.created_at else None,
    }


def _serialize_accounting_document(
    request: Request,
    document: AccountingDocument,
    *,
    include_share_links: bool = False,
) -> dict[str, object]:
    preview_available = accounting_document_preview_available(document)
    payload = {
        "id": document.id,
        "title": document.title,
        "description": document.description,
        "created_at": document.created_at.isoformat() if document.created_at else None,
        "updated_at": document.updated_at.isoformat() if document.updated_at else None,
        "original_filename": document.original_filename,
        "mime_type": document.mime_type,
        "file_size": document.file_size,
        "preview_enabled": bool(document.preview_enabled),
        "preview_available": preview_available,
        "is_share_enabled": bool(document.is_share_enabled),
        "legacy_shared_document_id": document.legacy_shared_document_id,
        "organization": (
            {
                "id": document.organization.id,
                "name": document.organization.name,
                "slug": document.organization.slug,
            }
            if document.organization is not None
            else None
        ),
        "folder": (
            _serialize_accounting_folder(document.folder)
            if document.folder is not None
            else None
        ),
        "category": (
            _serialize_accounting_category(document.category)
            if document.category is not None
            else None
        ),
        "uploaded_by": (
            {
                "id": document.uploaded_by_admin.id,
                "email": document.uploaded_by_admin.email,
            }
            if document.uploaded_by_admin is not None
            else None
        ),
        "download_url": f"/api/super-admin/accounting/documents/{document.id}/download",
        "preview_url": f"/api/super-admin/accounting/documents/{document.id}/preview"
        if preview_available
        else None,
        "open_url": (
            f"/api/super-admin/accounting/documents/{document.id}/preview"
            if preview_available
            else f"/api/super-admin/accounting/documents/{document.id}/download"
        ),
    }
    if include_share_links:
        payload["share_links"] = [
            _serialize_accounting_share_link(request, link)
            for link in sorted(
                document.share_links or [],
                key=lambda item: (item.created_at or datetime.min),
                reverse=True,
            )
        ]
    return payload


def _get_accounting_folder_or_404(db: Session, folder_id: int) -> AccountingFolder:
    folder = (
        db.query(AccountingFolder)
        .filter(AccountingFolder.id == folder_id, AccountingFolder.org_id.is_(None))
        .first()
    )
    if folder is None:
        raise HTTPException(status_code=404, detail="Cartella contabile non trovata.")
    return folder


def _get_accounting_category_or_404(
    db: Session, category_id: int
) -> AccountingCategory:
    category = (
        db.query(AccountingCategory)
        .filter(
            AccountingCategory.id == category_id,
            AccountingCategory.org_id.is_(None),
        )
        .first()
    )
    if category is None:
        raise HTTPException(status_code=404, detail="Categoria contabile non trovata.")
    return category


def _get_accounting_document_or_404(
    db: Session,
    document_id: int,
) -> AccountingDocument:
    document = (
        db.query(AccountingDocument)
        .options(
            joinedload(AccountingDocument.organization),
            joinedload(AccountingDocument.folder),
            joinedload(AccountingDocument.category),
            joinedload(AccountingDocument.uploaded_by_admin),
            joinedload(AccountingDocument.share_links),
        )
        .filter(AccountingDocument.id == document_id)
        .first()
    )
    if document is None:
        raise HTTPException(
            status_code=404,
            detail="Documento contabile non trovato.",
        )
    return document


def _ensure_accounting_enabled_org(db: Session, org_id: int) -> Organization:
    org = (
        db.query(Organization)
        .filter(Organization.id == org_id, Organization.deleted_at.is_(None))
        .first()
    )
    if org is None:
        raise HTTPException(status_code=404, detail="Associazione non trovata.")
    if not bool(org.accounting_enabled):
        raise HTTPException(
            status_code=422,
            detail="La Contabilita deve essere attiva per l'associazione destinataria.",
        )
    return org


def _next_global_sort_order(db: Session, model) -> int:
    current = (
        db.query(func.max(model.sort_order)).filter(model.org_id.is_(None)).scalar() or 0
    )
    return int(current) + 10


def _build_unique_folder_slug(
    db: Session,
    *,
    name: str,
    folder_id: int | None = None,
) -> str:
    base_slug = slugify_accounting_label(name)
    candidate = base_slug
    suffix = 2
    while True:
        query = db.query(AccountingFolder).filter(AccountingFolder.slug == candidate)
        if folder_id is not None:
            query = query.filter(AccountingFolder.id != folder_id)
        if query.first() is None:
            return candidate
        candidate = f"{base_slug}-{suffix}"
        suffix += 1


def _build_unique_category_code(
    db: Session,
    *,
    name: str,
    category_id: int | None = None,
) -> str:
    base_code = f"custom_{slugify_accounting_label(name)}"
    candidate = base_code
    suffix = 2
    while True:
        query = db.query(AccountingCategory).filter(AccountingCategory.code == candidate)
        if category_id is not None:
            query = query.filter(AccountingCategory.id != category_id)
        if query.first() is None:
            return candidate
        candidate = f"{base_code}_{suffix}"
        suffix += 1


async def _save_shared_document_file(upload_file: UploadFile) -> tuple[str, int, str]:
    content_type = (upload_file.content_type or "").strip().lower()
    file_ext = os.path.splitext(upload_file.filename or "")[1].lower()
    allowed_types = _SHARED_DOCUMENT_ALLOWED_EXTENSIONS.get(file_ext)
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

    sub_directory = os.path.join("org-shared-documents", datetime.utcnow().strftime("%Y/%m"))
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
                    raise HTTPException(status_code=400, detail="File troppo grande. Max 20 MB.")
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


def _parse_association_ids(raw_value: str | None) -> list[int]:
    if raw_value is None or not raw_value.strip():
        return []
    try:
        decoded = json.loads(raw_value)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="association_ids non valido.") from exc
    if not isinstance(decoded, list):
        raise HTTPException(status_code=400, detail="association_ids deve essere una lista.")

    ids: list[int] = []
    for item in decoded:
        try:
            parsed = int(item)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="association_ids contiene valori non validi.") from exc
        if parsed not in ids:
            ids.append(parsed)
    return ids


def _resolve_document_targets(
    *,
    db: Session,
    kind: str,
    target_mode: str,
    association_ids: list[int],
) -> list[Organization]:
    if kind not in _ALLOWED_SHARED_DOCUMENT_KINDS:
        raise HTTPException(status_code=422, detail="Tipo documento non valido.")
    if target_mode not in _ALLOWED_SHARED_DOCUMENT_TARGET_MODES:
        raise HTTPException(status_code=422, detail="Modalita destinatari non valida.")

    base_query = db.query(Organization).filter(Organization.deleted_at.is_(None))
    if target_mode == "all":
        targets = (
            base_query.order_by(Organization.name.asc(), Organization.id.asc()).all()
        )
    elif target_mode == "accounting_enabled":
        targets = (
            base_query.filter(Organization.accounting_enabled.is_(True))
            .order_by(Organization.name.asc(), Organization.id.asc())
            .all()
        )
    else:
        if not association_ids:
            raise HTTPException(status_code=422, detail="Seleziona almeno un'associazione.")
        targets = (
            base_query.filter(Organization.id.in_(association_ids))
            .order_by(Organization.name.asc(), Organization.id.asc())
            .all()
        )
        found_ids = {org.id for org in targets}
        missing_ids = [org_id for org_id in association_ids if org_id not in found_ids]
        if missing_ids:
            raise HTTPException(
                status_code=404,
                detail=f"Associazioni non trovate: {', '.join(str(item) for item in missing_ids)}",
            )
        if target_mode == "single" and len(targets) != 1:
            raise HTTPException(
                status_code=422,
                detail="La modalita singola richiede una sola associazione.",
            )

    if not targets:
        raise HTTPException(status_code=422, detail="Nessun destinatario disponibile.")

    if kind == "accounting":
        invalid_targets = [org for org in targets if not bool(org.accounting_enabled)]
        if invalid_targets:
            names = ", ".join(org.name for org in invalid_targets[:5])
            raise HTTPException(
                status_code=422,
                detail=f"I documenti contabili possono essere inviati solo ad associazioni con contabilita attiva. Destinatari non validi: {names}",
            )

    return targets


@auth_router.post("/login")
def super_admin_login(
    request: Request,
    body: LoginBody,
    db: Session = Depends(get_db),
):
    auth_limiter.check(get_client_ip(request))
    admin = (
        db.query(AdminUser)
        .filter(
            AdminUser.email == body.email,
            AdminUser.role == AdminRole.SUPER_ADMIN,
            AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None),
        )
        .first()
    )

    if not admin:
        logger.warning(
            "super_admin_login: no admin found for email (hash=%s)",
            body.email[:3] + "***",
        )
        audit.super_admin_login_failed(ip=get_client_ip(request))
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not admin.password_hash:
        logger.warning(
            "super_admin_login: admin id=%d has empty password_hash", admin.id
        )
        audit.super_admin_login_failed(ip=get_client_ip(request))
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(body.password, admin.password_hash):
        logger.warning("super_admin_login: password mismatch for admin id=%d", admin.id)
        audit.super_admin_login_failed(ip=get_client_ip(request))
        raise HTTPException(status_code=401, detail="Invalid credentials")

    request.session["admin_id"] = admin.id
    audit.super_admin_login(admin_id=admin.id, ip=get_client_ip(request))
    logger.info("super_admin_login: success for admin id=%d", admin.id)
    return {"ok": True}


@auth_router.get("/me")
def super_admin_me(request: Request, db: Session = Depends(get_db)):
    admin = _require_super_admin(request, db)
    return {
        "id": admin.id,
        "email": admin.email,
        "role": AdminRole.SUPER_ADMIN.value,
    }


@auth_router.post("/logout")
def super_admin_logout(request: Request):
    request.session.pop("admin_id", None)
    return {"ok": True}


router.include_router(auth_router)


class CreateOrgAdmin(BaseModel):
    email: EmailStr
    org_id: int


class PatchOrgAdmin(BaseModel):
    is_active: bool


class CreateIntegrationKeyBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = "pienissimo"
    scopes: list[str] = Field(default_factory=lambda: ["issue_member"])


class RunMaintenanceBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    purge_pii: bool = True


class RunLowCardsAlertJobBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    force: bool = False


def _get_org_or_404(db: Session, org_id: int) -> Organization:
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _normalize_integration_name(raw_value: str | None) -> str:
    normalized = (raw_value or "").strip().lower()
    if not normalized:
        raise HTTPException(status_code=400, detail="Nome integrazione obbligatorio.")
    return normalized


def _normalize_integration_scopes(raw_scopes: list[str] | None) -> list[str]:
    provided_scopes = raw_scopes or ["issue_member"]
    cleaned_scopes = sorted(
        {scope.strip() for scope in provided_scopes if scope and scope.strip()}
    )
    if not cleaned_scopes:
        raise HTTPException(status_code=400, detail="Almeno uno scope e obbligatorio.")

    invalid_scopes = [
        scope for scope in cleaned_scopes if scope not in _ALLOWED_INTEGRATION_SCOPES
    ]
    if invalid_scopes:
        raise HTTPException(
            status_code=400,
            detail=f"Scope non validi: {', '.join(invalid_scopes)}",
        )
    return cleaned_scopes


def _serialize_integration_key(key: IntegrationApiKey) -> dict:
    return {
        "id": key.id,
        "name": key.name,
        "scopes": key.scopes or [],
        "is_active": bool(key.is_active),
        "created_at": key.created_at.isoformat() if key.created_at else None,
        "last_used_at": key.last_used_at.isoformat() if key.last_used_at else None,
        "last_used_ip": key.last_used_ip,
    }


def _create_integration_key(
    db: Session,
    org_id: int,
    name: str,
    scopes: list[str],
) -> tuple[IntegrationApiKey, str]:
    def _is_org_name_unique_conflict(error: IntegrityError) -> bool:
        message = str(getattr(error, "orig", error)).lower()
        return (
            "unique" in message
            and "integration_api_keys.org_id" in message
            and "integration_api_keys.name" in message
        ) or "uix_integration_api_keys_org_name" in message

    def _is_key_hash_unique_conflict(error: IntegrityError) -> bool:
        message = str(getattr(error, "orig", error)).lower()
        return (
            "unique" in message and "integration_api_keys.key_hash" in message
        ) or "uq_integration_api_keys_key_hash" in message

    def _reuse_legacy_unique_row(
        key_hash: str,
    ) -> IntegrationApiKey | None:
        existing = (
            db.query(IntegrationApiKey)
            .filter(
                IntegrationApiKey.org_id == org_id,
                IntegrationApiKey.name == name,
            )
            .order_by(IntegrationApiKey.id.desc())
            .first()
        )
        if not existing:
            return None

        # Legacy DBs may still enforce UNIQUE(org_id, name). In that case we
        # rotate by updating the existing row in place.
        existing.key_hash = key_hash
        existing.scopes = scopes
        existing.is_active = True
        existing.created_at = datetime.utcnow()
        existing.last_used_at = None
        existing.last_used_ip = None
        existing.last_used_user_agent = None
        db.commit()
        db.refresh(existing)
        return existing

    for attempt in range(2):
        raw_key = secrets.token_urlsafe(32)
        key_hash = hash_api_key(raw_key)
        key = IntegrationApiKey(
            org_id=org_id,
            name=name,
            key_hash=key_hash,
            scopes=scopes,
            is_active=True,
        )
        db.add(key)

        try:
            db.commit()
            db.refresh(key)
            return key, raw_key
        except IntegrityError as exc:
            db.rollback()
            if _is_key_hash_unique_conflict(exc) and attempt == 0:
                continue
            if _is_org_name_unique_conflict(exc):
                reused = _reuse_legacy_unique_row(key_hash=key_hash)
                if reused is not None:
                    logger.warning(
                        "integration_api_keys legacy unique(org_id,name) detected for org_id=%s name=%s; reusing key row id=%s",
                        org_id,
                        name,
                        reused.id,
                    )
                    return reused, raw_key
            raise HTTPException(
                status_code=409,
                detail="Impossibile creare la chiave integrazione. Verifica vincoli esistenti o ruota la chiave corrente.",
            ) from exc
        except OperationalError as exc:
            db.rollback()
            logger.exception("Integration key creation failed due to DB schema issue.")
            raise HTTPException(
                status_code=500,
                detail="Schema integrazioni non aggiornato. Esegui 'alembic upgrade head'.",
            ) from exc

    raise HTTPException(
        status_code=500,
        detail="Errore interno durante la generazione della chiave integrazione.",
    )


@router.get("/orgs/{org_id}/integration-keys")
def list_org_integration_keys(
    request: Request,
    org_id: int,
    name: Optional[str] = None,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    _get_org_or_404(db, org_id)

    query = db.query(IntegrationApiKey).filter(IntegrationApiKey.org_id == org_id)
    if name is not None:
        query = query.filter(
            IntegrationApiKey.name == _normalize_integration_name(name)
        )

    keys = query.order_by(
        IntegrationApiKey.created_at.desc(), IntegrationApiKey.id.desc()
    ).all()
    return {"items": [_serialize_integration_key(key) for key in keys]}


@router.post("/orgs/{org_id}/integration-keys")
def create_org_integration_key(
    request: Request,
    org_id: int,
    body: CreateIntegrationKeyBody,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    _get_org_or_404(db, org_id)

    normalized_name = _normalize_integration_name(body.name)
    normalized_scopes = _normalize_integration_scopes(body.scopes)
    key, raw_key = _create_integration_key(
        db=db,
        org_id=org_id,
        name=normalized_name,
        scopes=normalized_scopes,
    )

    audit.log_operation(
        db,
        action="integration_key_created",
        entity_type="integration_api_key",
        entity_id=key.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.SUPER_ADMIN.value,
        metadata={
            "org_id": org_id,
            "name": key.name,
            "scopes": key.scopes,
            "is_active": bool(key.is_active),
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "id": key.id,
        "created_at": key.created_at.isoformat() if key.created_at else None,
        "raw_key": raw_key,
    }


@router.post("/orgs/{org_id}/integration-keys/{key_id}/rotate")
def rotate_org_integration_key(
    request: Request,
    org_id: int,
    key_id: int,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    _get_org_or_404(db, org_id)

    current_key = (
        db.query(IntegrationApiKey)
        .filter(IntegrationApiKey.id == key_id, IntegrationApiKey.org_id == org_id)
        .first()
    )
    if not current_key:
        raise HTTPException(status_code=404, detail="Integration key not found")

    current_key.is_active = False
    db.commit()

    new_key, raw_key = _create_integration_key(
        db=db,
        org_id=org_id,
        name=current_key.name,
        scopes=_normalize_integration_scopes(current_key.scopes or ["issue_member"]),
    )

    audit.log_operation(
        db,
        action="integration_key_rotated",
        entity_type="integration_api_key",
        entity_id=new_key.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.SUPER_ADMIN.value,
        metadata={
            "org_id": org_id,
            "previous_key_id": current_key.id,
            "name": new_key.name,
            "scopes": new_key.scopes,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "id": new_key.id,
        "created_at": new_key.created_at.isoformat() if new_key.created_at else None,
        "raw_key": raw_key,
        "replaced_key_id": current_key.id,
    }


@router.delete("/orgs/{org_id}/integration-keys/{key_id}")
def disable_org_integration_key(
    request: Request,
    org_id: int,
    key_id: int,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    _get_org_or_404(db, org_id)

    key = (
        db.query(IntegrationApiKey)
        .filter(IntegrationApiKey.id == key_id, IntegrationApiKey.org_id == org_id)
        .first()
    )
    if not key:
        raise HTTPException(status_code=404, detail="Integration key not found")

    key.is_active = False
    db.commit()

    audit.log_operation(
        db,
        action="integration_key_disabled",
        entity_type="integration_api_key",
        entity_id=key.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.SUPER_ADMIN.value,
        metadata={"org_id": org_id, "name": key.name, "is_active": bool(key.is_active)},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {"ok": True, **_serialize_integration_key(key)}


@router.post("/maintenance/run")
def run_maintenance(
    request: Request,
    body: RunMaintenanceBody | None = None,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    now = datetime.utcnow()
    payload = body or RunMaintenanceBody()

    result = expire_and_purge_members(
        db=db,
        now=now,
        purge_pii=payload.purge_pii,
    )

    audit.log_operation(
        db,
        action="auto_expire_members",
        entity_type="member",
        actor_admin_id=admin.id,
        actor_role=AdminRole.SUPER_ADMIN.value,
        metadata={
            "expired_count": result["expired_count"],
            "purged_count": result["purged_count"],
            "current_year": result["current_year"],
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "ok": True,
        "ran_at": now.isoformat() + "Z",
        **result,
    }


@router.post("/alerts/low-cards/run")
def run_low_cards_alerts(
    request: Request,
    body: RunLowCardsAlertJobBody | None = None,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    now = datetime.utcnow()
    payload = body or RunLowCardsAlertJobBody()
    result = run_low_cards_alert_job(db=db, now=now, force=payload.force)

    audit.log_operation(
        db,
        action="low_cards_alert_job_run",
        entity_type="organization",
        actor_admin_id=admin.id,
        actor_role=AdminRole.SUPER_ADMIN.value,
        metadata={"force": payload.force, "result": result},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "ok": True,
        "ran_at": now.isoformat() + "Z",
        **result,
    }


@router.get("/members")
def super_admin_member_registry(
    request: Request,
    org_id: Optional[int] = None,
    q: Optional[str] = None,
    status: Optional[str] = None,
    order: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)

    current_time = datetime.utcnow()
    current_year = current_time.year
    status_filter = (status or "").strip().lower()
    search_term = (q or "").strip()

    query = db.query(Member).options(joinedload(Member.organization)).filter(
        Member.deleted_at.is_(None)
    )

    if org_id is not None:
        query = query.filter(Member.org_id == org_id)

    if search_term:
        pattern = f"%{search_term}%"
        query = query.filter(
            or_(
                Member.first_name.ilike(pattern),
                Member.last_name.ilike(pattern),
                Member.email.ilike(pattern),
                Member.fiscal_code.ilike(pattern),
                cast(Member.card_no, String).ilike(pattern),
                Member.organization.has(Organization.name.ilike(pattern)),
            )
        )

    if status_filter == "active":
        query = query.filter(
            Member.status == "active",
            Member.card_no.isnot(None),
            Member.card_year.isnot(None),
            Member.card_year >= current_year,
        )
    elif status_filter == "pending":
        query = query.filter(
            Member.status.in_(["pending_verification", "pending_docs", "pending_cards"])
        )
    elif status_filter == "rejected":
        query = query.filter(Member.status == "rejected")
    elif status_filter == "expired":
        query = query.filter(
            or_(
                Member.status == "expired",
                and_(Member.card_year.isnot(None), Member.card_year < current_year),
            )
        )

    total = query.count()

    status_rank = case(
        (Member.status == "active", 1),
        (Member.status == "pending_verification", 2),
        (Member.status == "pending_docs", 3),
        (Member.status == "pending_cards", 4),
        (Member.status == "rejected", 5),
        (Member.status == "expired", 6),
        else_=9,
    )
    sort_key = (order or "joined_at_desc").strip().lower()
    if sort_key == "card_no_desc":
        query = query.order_by(Member.card_no.desc().nullslast(), Member.id.desc())
    elif sort_key == "card_no_asc":
        query = query.order_by(Member.card_no.asc().nullslast(), Member.id.asc())
    elif sort_key == "joined_at_asc":
        query = query.order_by(Member.joined_at.is_(None), Member.joined_at.asc())
    elif sort_key == "name_asc":
        query = query.order_by(Member.last_name.asc(), Member.first_name.asc())
    elif sort_key == "name_desc":
        query = query.order_by(Member.last_name.desc(), Member.first_name.desc())
    elif sort_key == "status_asc":
        query = query.order_by(
            status_rank.asc(),
            Member.last_name.asc(),
            Member.first_name.asc(),
        )
    else:
        query = query.order_by(
            Member.joined_at.is_(None),
            Member.joined_at.desc(),
            Member.id.desc(),
        )

    members = query.offset(offset).limit(min(limit, 100)).all()

    base_counts_query = db.query(Member).filter(Member.deleted_at.is_(None))
    if org_id is not None:
        base_counts_query = base_counts_query.filter(Member.org_id == org_id)

    kpis = {
        "total": int(base_counts_query.count()),
        "active": int(
            base_counts_query.filter(
                Member.status == "active",
                Member.card_no.isnot(None),
                Member.card_year.isnot(None),
                Member.card_year >= current_year,
            ).count()
        ),
        "pending": int(
            base_counts_query.filter(
                Member.status.in_(["pending_verification", "pending_docs", "pending_cards"])
            ).count()
        ),
        "expired": int(
            base_counts_query.filter(
                or_(
                    Member.status == "expired",
                    and_(Member.card_year.isnot(None), Member.card_year < current_year),
                )
            ).count()
        ),
        "rejected": int(base_counts_query.filter(Member.status == "rejected").count()),
    }

    return {
        "items": [
            {
                "id": member.id,
                "organization_id": member.org_id,
                "organization_name": member.organization.name if member.organization else None,
                "organization_slug": member.organization.slug if member.organization else None,
                "first_name": member.first_name,
                "last_name": member.last_name,
                "full_name": f"{member.first_name} {member.last_name}".strip(),
                "email": member.email,
                "phone": member.phone,
                "fiscal_code": member.fiscal_code,
                "status": get_member_lifecycle_status(member, now=current_time),
                "workflow_status": member.status.value
                if hasattr(member.status, "value")
                else str(member.status),
                "is_active": is_member_active(member, now=current_time),
                "card_no": member.card_no,
                "card_year": member.card_year,
                "joined_at": member.joined_at.isoformat() if member.joined_at else None,
            }
            for member in members
        ],
        "total": total,
        "kpis": kpis,
    }


@router.get("/members/{member_id}")
def super_admin_member_detail(
    request: Request,
    member_id: int,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)

    member = (
        db.query(Member)
        .filter(
            Member.id == member_id,
            Member.deleted_at.is_(None),
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    return {
        "id": member.id,
        "first_name": member.first_name,
        "last_name": member.last_name,
        "email": member.email,
        "phone": member.phone,
        "fiscal_code": member.fiscal_code,
        "payment_method": _serialize_member_payment_method(member.payment_method),
        "status": get_member_lifecycle_status(member, now=datetime.utcnow()),
        "workflow_status": member.status.value
        if hasattr(member.status, "value")
        else str(member.status),
        "is_active": is_member_active(member, now=datetime.utcnow()),
        "deleted_at": member.deleted_at.isoformat() if member.deleted_at else None,
        "card_no": member.card_no,
        "card_number": member.card_no,
        "card_year": member.card_year,
        "joined_at": member.joined_at.isoformat() if member.joined_at else None,
        "member_type": member.member_type,
        "internal_notes": member.internal_notes,
        "is_manual": bool(member.is_manual),
        "organization": {
            "id": member.organization.id,
            "name": member.organization.name,
            "slug": member.organization.slug,
        }
        if member.organization
        else None,
    }


@router.post("/org-admins")
def create_org_admin(
    request: Request,
    body: CreateOrgAdmin,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)

    org = db.query(Organization).filter(Organization.id == body.org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    email_norm = body.email.strip().lower()
    existing = (
        db.query(AdminUser)
        .filter(
            func.lower(AdminUser.email) == email_norm,
        )
        .first()
    )

    if existing:
        if existing.deleted_at is not None:
            # Restore
            existing.deleted_at = None
            existing.is_active = True
            existing.password_hash = ""  # Reset credentials
            existing.org_id = body.org_id
            db.commit()

            audit.org_admin_restored_on_create(
                admin_id=existing.id,
                org_id=existing.org_id,
                email_hash=audit._hash_email(email_norm),
            )

            return {
                "id": existing.id,
                "email": existing.email,
                "org_id": existing.org_id,
                "org_name": org.name,
                "is_active": existing.is_active,
                "created_at": existing.created_at.isoformat()
                if existing.created_at
                else None,
                "restored": True,
            }
        else:
            raise HTTPException(status_code=409, detail="admin_exists")

    admin = AdminUser(
        email=email_norm,
        password_hash="",
        role=AdminRole.ORG_ADMIN,
        org_id=body.org_id,
        is_active=True,
    )
    db.add(admin)
    db.flush()

    # Send first magic-link invite
    token_str = generate_token()
    token = OrgAdminToken(
        admin_id=admin.id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow()
        + timedelta(minutes=settings.LOGIN_TOKEN_EXPIRE_MINUTES),
    )
    db.add(token)
    db.flush()

    link = f"{settings.BASE_URL}/api/org-admin/auth/verify?token={token_str}"
    outbox_id = enqueue_email(
        db,
        email_type="org_admin_invite",
        to_email=email_norm,
        subject="Invito area amministrazione associazione",
        payload=build_email_payload(
            text_body=f"Sei stato invitato come amministratore di {org.name}.\nAccedi qui: {link}",
            meta={
                "admin_id": admin.id,
                "org_id": admin.org_id,
            },
        ),
        priority=1,
    )
    db.commit()

    audit.org_admin_created(
        admin_id=admin.id, org_id=admin.org_id, email_hash=audit._hash_email(email_norm)
    )

    return {
        "id": admin.id,
        "email": admin.email,
        "org_id": admin.org_id,
        "org_name": org.name,
        "is_active": admin.is_active,
        "created_at": admin.created_at.isoformat() if admin.created_at else None,
        "created": True,
        "email_status": "queued",
        "outbox_id": outbox_id,
    }


@router.get("/org-admins")
def list_org_admins(
    request: Request,
    org_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)

    query = db.query(AdminUser).filter(
        AdminUser.role == AdminRole.ORG_ADMIN, AdminUser.deleted_at.is_(None)
    )
    if org_id is not None:
        query = query.filter(AdminUser.org_id == org_id)

    admins = query.order_by(AdminUser.id).all()

    return [
        {
            "id": a.id,
            "email": a.email,
            "org_id": a.org_id,
            "org_name": a.organization.name if a.organization else None,
            "is_active": a.is_active,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in admins
    ]


@router.delete("/org-admins/{admin_id}")
def delete_org_admin(
    request: Request,
    admin_id: int,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)

    target = (
        db.query(AdminUser)
        .filter(
            AdminUser.id == admin_id,
            AdminUser.role == AdminRole.ORG_ADMIN,
        )
        .first()
    )

    if not target:
        raise HTTPException(status_code=404, detail="Org admin not found")

    if target.deleted_at is not None:
        return {"ok": True, "already_deleted": True}

    # Safety check: do NOT allow deleting the last active org-admin for that admin’s organization
    active_count = (
        db.query(func.count(AdminUser.id))
        .filter(
            AdminUser.org_id == target.org_id,
            AdminUser.role == AdminRole.ORG_ADMIN,
            AdminUser.deleted_at.is_(None),
            AdminUser.is_active.is_(True),
        )
        .scalar()
    )

    if active_count <= 1 and target.is_active:
        raise HTTPException(
            status_code=409,
            detail="Impossibile eliminare l'ultimo admin attivo dell'organizzazione.",
        )

    target.deleted_at = datetime.utcnow()
    target.is_active = False
    db.commit()

    audit.org_admin_deleted(
        admin_id=target.id, org_id=target.org_id, super_admin_id=admin.id
    )
    logger.info(
        "super_admin.org_admin_deleted: admin_id=%d org_id=%d by super_admin=%d",
        target.id,
        target.org_id,
        admin.id,
    )

    return {"ok": True}


@router.post("/org-admins/{admin_id}/restore")
def restore_org_admin(
    request: Request,
    admin_id: int,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)

    target = (
        db.query(AdminUser)
        .filter(
            AdminUser.id == admin_id,
            AdminUser.role == AdminRole.ORG_ADMIN,
        )
        .first()
    )

    if not target:
        raise HTTPException(status_code=404, detail="Org admin not found")

    if target.deleted_at is None:
        return {"ok": True, "already_active": True}

    target.deleted_at = None
    target.is_active = True
    target.password_hash = ""  # Reset credentials
    db.commit()

    audit.org_admin_restored(
        admin_id=target.id, org_id=target.org_id, super_admin_id=admin.id
    )
    logger.info(
        "super_admin.org_admin_restored: admin_id=%d org_id=%d by super_admin=%d",
        target.id,
        target.org_id,
        admin.id,
    )

    return {"ok": True}


@router.patch("/org-admins/{admin_id}")
def patch_org_admin(
    request: Request,
    admin_id: int,
    body: PatchOrgAdmin,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)

    target = (
        db.query(AdminUser)
        .filter(
            AdminUser.id == admin_id,
            AdminUser.role == AdminRole.ORG_ADMIN,
        )
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Org admin not found")

    target.is_active = body.is_active
    db.commit()

    return {
        "id": target.id,
        "email": target.email,
        "org_id": target.org_id,
        "is_active": target.is_active,
    }


# ── Organization Management ──────────────────────────────────────


@router.post("/organizations")
def create_organization(
    request: Request,
    body: CreateOrganization,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)

    # Slug Logic
    slug = body.slug
    if not slug:
        slug = re.sub(r"[^a-z0-9]+", "-", body.name.lower()).strip("-")

    # Unique check
    if db.query(Organization).filter(Organization.slug == slug).first():
        raise HTTPException(status_code=409, detail="Slug already exists")

    description = body.description
    if not description and body.description_short:
        description = body.description_short

    normalized_name = _normalize_tag_culture(body.name) or body.name
    normalized_club_display_name = _normalize_tag_culture(body.club_display_name)
    normalized_card_email_subject = _normalize_tag_culture(body.card_email_subject)

    org = Organization(
        name=normalized_name,
        slug=slug,
        club_display_name=normalized_club_display_name,
        card_email_subject=normalized_card_email_subject,
        card_logo_url=body.card_logo_url,
        description=description,
        address_line1=body.address_line1,
        address_line2=body.address_line2,
        city=body.city,
        province=body.province,
        postal_code=body.postal_code,
        country=body.country,
        email=body.email,
        phone=body.phone,
        whatsapp_e164=body.whatsapp_e164,
        website=body.website,
        is_active=body.is_active,
        auto_approve_signup=body.auto_approve_signup,
        require_membership_document=body.require_membership_document,
        accounting_enabled=body.accounting_enabled,
        created_by_admin_id=admin.id,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    audit.log_operation(
        db,
        action="org.create",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="super_admin",
        metadata=body.model_dump(exclude_unset=True),
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(org)

    return org


def _delete_association_handler(
    request: Request,
    association_id: int,
    mode: Literal["archive", "purge"],
    release_range: bool,
    force: bool,
    db: Session,
):
    admin = _require_super_admin(request, db)
    return delete_association_and_release_range(
        db,
        request=request,
        association_id=association_id,
        mode=mode,
        release_range=release_range,
        force=force,
        actor_admin_id=admin.id,
    )


@associations_router.delete("/associations/{association_id}")
def delete_association(
    request: Request,
    association_id: int,
    mode: Literal["archive", "purge"] = "archive",
    release_range: bool = True,
    force: bool = False,
    db: Session = Depends(get_db),
):
    return _delete_association_handler(
        request=request,
        association_id=association_id,
        mode=mode,
        release_range=release_range,
        force=force,
        db=db,
    )


@router.delete("/organizations/{org_id}")
def delete_organization(
    request: Request,
    org_id: int,
    db: Session = Depends(get_db),
):
    # Legacy endpoint compatibility: preserve hard-delete behavior.
    return _delete_association_handler(
        request=request,
        association_id=org_id,
        mode="purge",
        release_range=True,
        force=True,
        db=db,
    )


@router.get("/organizations")
@associations_router.get("/organizations")
def list_organizations(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=200),
    limit: Optional[int] = Query(None, ge=10, le=200),
    q: Optional[str] = None,
    sort: Optional[str] = None,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    resolved_page_size = limit or page_size
    return _list_organizations_payload(
        q=q,
        page=page,
        page_size=resolved_page_size,
        sort=sort,
        db=db,
    )


@router.get("/organizations/{org_id}")
@associations_router.get("/organizations/{org_id}")
def get_organization(
    request: Request,
    org_id: int,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    card_range = (
        db.query(
            func.min(CardBatch.start_no).label("card_min"),
            func.max(CardBatch.end_no).label("card_max"),
        )
        .filter(CardBatch.org_id == org_id, CardBatch.released_at.is_(None))
        .first()
    )

    return _serialize_organization_row(
        org,
        card_min=(card_range.card_min if card_range else None),
        card_max=(card_range.card_max if card_range else None),
    )


@router.patch("/organizations/{org_id}")
@associations_router.patch("/organizations/{org_id}")
def update_organization(
    request: Request,
    org_id: int,
    body: PatchOrganization,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    update_data = body.model_dump(exclude_unset=True)

    if "description_short" in update_data:
        short = update_data.pop("description_short")
        if "description" not in update_data:
            update_data["description"] = short

    if "name" in update_data:
        update_data["name"] = _normalize_tag_culture(update_data.get("name"))
    if "club_display_name" in update_data:
        update_data["club_display_name"] = _normalize_tag_culture(
            update_data.get("club_display_name")
        )
    if "card_email_subject" in update_data:
        update_data["card_email_subject"] = _normalize_tag_culture(
            update_data.get("card_email_subject")
        )
    if "auto_approve_signup" in update_data:
        update_data["auto_approve_signup"] = bool(update_data["auto_approve_signup"])
    if "require_membership_document" in update_data:
        update_data["require_membership_document"] = bool(
            update_data["require_membership_document"]
        )
    if "accounting_enabled" in update_data:
        update_data["accounting_enabled"] = bool(update_data["accounting_enabled"])
    if "communications_enabled" in update_data:
        update_data["communications_enabled"] = bool(update_data["communications_enabled"])

    for key, value in update_data.items():
        setattr(org, key, value)

    db.commit()

    audit.log_operation(
        db,
        action="org.update",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="super_admin",
        metadata=update_data,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(org)

    return org


@router.get("/documents/targets")
def list_document_targets(
    request: Request,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    organizations = (
        db.query(Organization)
        .filter(Organization.deleted_at.is_(None))
        .order_by(Organization.name.asc(), Organization.id.asc())
        .all()
    )
    return {
        "items": [_serialize_document_target(org) for org in organizations],
        "total": len(organizations),
    }


@router.post("/documents")
async def create_shared_document(
    request: Request,
    title: str = Form(...),
    description: Optional[str] = Form(None),
    kind: str = Form(...),
    target_mode: str = Form(...),
    association_ids: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)

    normalized_title = (title or "").strip()
    if not normalized_title:
        raise HTTPException(status_code=422, detail="Titolo obbligatorio.")

    parsed_association_ids = _parse_association_ids(association_ids)
    targets = _resolve_document_targets(
        db=db,
        kind=(kind or "").strip().lower(),
        target_mode=(target_mode or "").strip().lower(),
        association_ids=parsed_association_ids,
    )

    rel_path, size_bytes, sha256 = await _save_shared_document_file(file)

    document = OrganizationSharedDocument(
        title=normalized_title,
        description=(description or "").strip() or None,
        kind=(kind or "").strip().lower(),
        rel_path=rel_path,
        original_filename=file.filename or os.path.basename(rel_path),
        mime_type=file.content_type,
        size_bytes=size_bytes,
        sha256=sha256,
        uploaded_by_admin_id=admin.id,
    )
    db.add(document)
    db.flush()

    accounting_folder = None
    accounting_category = None
    if document.kind == "accounting":
        ensure_accounting_seed_data(db)
        accounting_folder = get_default_accounting_folder(db)
        accounting_category = get_default_accounting_category(db)

    for org in targets:
        db.add(
            OrganizationSharedDocumentAssignment(
                document_id=document.id,
                association_id=org.id,
            )
        )
        if document.kind == "accounting" and accounting_folder and accounting_category:
            db.add(
                AccountingDocument(
                    org_id=org.id,
                    folder_id=accounting_folder.id,
                    category_id=accounting_category.id,
                    title=document.title,
                    description=document.description,
                    storage_key=document.rel_path,
                    original_filename=document.original_filename,
                    mime_type=document.mime_type,
                    file_size=document.size_bytes,
                    sha256=document.sha256,
                    preview_enabled=is_accounting_previewable_mime(document.mime_type),
                    is_share_enabled=False,
                    uploaded_by_admin_id=admin.id,
                    legacy_shared_document_id=document.id,
                    created_at=document.created_at,
                    updated_at=document.created_at,
                )
            )

    notification_totals = {"notifications_created": 0, "emails_queued": 0}
    for org in targets:
        result = notify_org_admins_about_shared_document(
            db,
            organization=org,
            document=document,
            request=request,
        )
        notification_totals["notifications_created"] += int(
            result.get("notifications_created", 0)
        )
        notification_totals["emails_queued"] += int(result.get("emails_queued", 0))

    audit.log_operation(
        db,
        action="org_shared_document.create",
        entity_type="organization_shared_document",
        entity_id=document.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.SUPER_ADMIN.value,
        metadata={
            "title": document.title,
            "kind": document.kind,
            "target_mode": target_mode,
            "association_ids": [org.id for org in targets],
            "size_bytes": size_bytes,
            "filename": document.original_filename,
            "notifications_created": notification_totals["notifications_created"],
            "emails_queued": notification_totals["emails_queued"],
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(document)

    document = (
        db.query(OrganizationSharedDocument)
        .options(
            joinedload(OrganizationSharedDocument.uploaded_by_admin),
            joinedload(OrganizationSharedDocument.assignments).joinedload(
                OrganizationSharedDocumentAssignment.organization
            ),
        )
        .filter(OrganizationSharedDocument.id == document.id)
        .first()
    )
    return {"ok": True, "document": _serialize_shared_document(document, include_recipients=True)}


@router.get("/documents")
def list_shared_documents(
    request: Request,
    kind: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    query = db.query(OrganizationSharedDocument).options(
        joinedload(OrganizationSharedDocument.uploaded_by_admin),
        joinedload(OrganizationSharedDocument.assignments).joinedload(
            OrganizationSharedDocumentAssignment.organization
        ),
    )
    normalized_kind = (kind or "").strip().lower()
    if normalized_kind:
        query = query.filter(OrganizationSharedDocument.kind == normalized_kind)

    documents = (
        query.order_by(
            OrganizationSharedDocument.created_at.desc(),
            OrganizationSharedDocument.id.desc(),
        ).all()
    )
    return {
        "items": [_serialize_shared_document(document) for document in documents],
        "total": len(documents),
    }


@router.get("/documents/{document_id}")
def get_shared_document_detail(
    request: Request,
    document_id: int,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    document = (
        db.query(OrganizationSharedDocument)
        .options(
            joinedload(OrganizationSharedDocument.uploaded_by_admin),
            joinedload(OrganizationSharedDocument.assignments).joinedload(
                OrganizationSharedDocumentAssignment.organization
            ),
        )
        .filter(OrganizationSharedDocument.id == document_id)
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Documento non trovato.")
    return _serialize_shared_document(document, include_recipients=True)


@router.get("/documents/{document_id}/download")
def download_shared_document(
    request: Request,
    document_id: int,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    document = (
        db.query(OrganizationSharedDocument)
        .filter(OrganizationSharedDocument.id == document_id)
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Documento non trovato.")

    full_path = os.path.join(settings.UPLOAD_DIR, document.rel_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File non trovato su disco.")

    return FileResponse(
        full_path,
        filename=document.original_filename,
        media_type=document.mime_type or "application/octet-stream",
        content_disposition_type="attachment",
    )


@router.get("/accounting/folders")
def list_accounting_folders(
    request: Request,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    ensure_accounting_seed_data(db)
    folders = (
        db.query(AccountingFolder)
        .filter(AccountingFolder.org_id.is_(None))
        .order_by(
            AccountingFolder.sort_order.asc(),
            AccountingFolder.year.is_(None).asc(),
            AccountingFolder.year.desc(),
            AccountingFolder.name.asc(),
            AccountingFolder.id.asc(),
        )
        .all()
    )
    counts = {
        folder_id: total
        for folder_id, total in db.query(
            AccountingDocument.folder_id,
            func.count(AccountingDocument.id),
        )
        .group_by(AccountingDocument.folder_id)
        .all()
    }
    return {
        "items": [
            _serialize_accounting_folder(folder, document_count=counts.get(folder.id, 0))
            for folder in folders
        ],
        "total": len(folders),
    }


@router.post("/accounting/folders", status_code=201)
def create_accounting_folder(
    body: CreateAccountingFolderBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    del admin
    normalized_name = _normalize_optional_text(body.name)
    if normalized_name is None:
        raise HTTPException(status_code=422, detail="Nome cartella obbligatorio.")
    folder = AccountingFolder(
        org_id=None,
        name=normalized_name,
        slug=_build_unique_folder_slug(db, name=normalized_name),
        year=body.year,
        sort_order=body.sort_order
        if body.sort_order is not None
        else _next_global_sort_order(db, AccountingFolder),
        is_active=bool(body.is_active),
        is_default=False,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return {"folder": _serialize_accounting_folder(folder)}


@router.patch("/accounting/folders/{folder_id}")
def update_accounting_folder(
    folder_id: int,
    body: UpdateAccountingFolderBody,
    request: Request,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    folder = _get_accounting_folder_or_404(db, folder_id)
    payload = body.model_dump(exclude_unset=True)
    if "name" in payload:
        normalized_name = _normalize_optional_text(payload["name"])
        if normalized_name is None:
            raise HTTPException(status_code=422, detail="Nome cartella obbligatorio.")
        folder.name = normalized_name
        folder.slug = _build_unique_folder_slug(
            db,
            name=normalized_name,
            folder_id=folder.id,
        )
    if "year" in payload:
        folder.year = payload["year"]
    if "is_active" in payload:
        folder.is_active = bool(payload["is_active"])
    if "sort_order" in payload and payload["sort_order"] is not None:
        folder.sort_order = int(payload["sort_order"])
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return {"folder": _serialize_accounting_folder(folder)}


@router.delete("/accounting/folders/{folder_id}")
def delete_accounting_folder(
    folder_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    folder = _get_accounting_folder_or_404(db, folder_id)
    if folder.is_default:
        raise HTTPException(
            status_code=409,
            detail="La cartella di fallback non puo essere eliminata.",
        )
    documents_count = (
        db.query(func.count(AccountingDocument.id))
        .filter(AccountingDocument.folder_id == folder.id)
        .scalar()
        or 0
    )
    if documents_count:
        raise HTTPException(
            status_code=409,
            detail="Impossibile eliminare la cartella: contiene documenti.",
        )
    db.delete(folder)
    db.commit()
    return {"ok": True, "deleted_folder_id": folder_id}


@router.get("/accounting/categories")
def list_accounting_categories(
    request: Request,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    ensure_accounting_seed_data(db)
    categories = (
        db.query(AccountingCategory)
        .filter(AccountingCategory.org_id.is_(None))
        .order_by(
            AccountingCategory.sort_order.asc(),
            AccountingCategory.name.asc(),
            AccountingCategory.id.asc(),
        )
        .all()
    )
    counts = {
        category_id: total
        for category_id, total in db.query(
            AccountingDocument.category_id,
            func.count(AccountingDocument.id),
        )
        .group_by(AccountingDocument.category_id)
        .all()
    }
    return {
        "items": [
            _serialize_accounting_category(
                category,
                document_count=counts.get(category.id, 0),
            )
            for category in categories
        ],
        "total": len(categories),
    }


@router.post("/accounting/categories", status_code=201)
def create_accounting_category(
    body: CreateAccountingCategoryBody,
    request: Request,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    normalized_name = _normalize_optional_text(body.name)
    if normalized_name is None:
        raise HTTPException(status_code=422, detail="Nome categoria obbligatorio.")
    category = AccountingCategory(
        org_id=None,
        code=_build_unique_category_code(db, name=normalized_name),
        name=normalized_name,
        is_system=False,
        sort_order=body.sort_order
        if body.sort_order is not None
        else _next_global_sort_order(db, AccountingCategory),
        is_active=bool(body.is_active),
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return {"category": _serialize_accounting_category(category)}


@router.patch("/accounting/categories/{category_id}")
def update_accounting_category(
    category_id: int,
    body: UpdateAccountingCategoryBody,
    request: Request,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    category = _get_accounting_category_or_404(db, category_id)
    payload = body.model_dump(exclude_unset=True)
    if "name" in payload:
        normalized_name = _normalize_optional_text(payload["name"])
        if normalized_name is None:
            raise HTTPException(status_code=422, detail="Nome categoria obbligatorio.")
        category.name = normalized_name
        if not category.is_system:
            category.code = _build_unique_category_code(
                db,
                name=normalized_name,
                category_id=category.id,
            )
    if "is_active" in payload:
        category.is_active = bool(payload["is_active"])
    if "sort_order" in payload and payload["sort_order"] is not None:
        category.sort_order = int(payload["sort_order"])
    db.add(category)
    db.commit()
    db.refresh(category)
    return {"category": _serialize_accounting_category(category)}


@router.delete("/accounting/categories/{category_id}")
def delete_accounting_category(
    category_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    category = _get_accounting_category_or_404(db, category_id)
    if category.is_system or category.code == DEFAULT_ACCOUNTING_CATEGORY_CODE:
        raise HTTPException(
            status_code=409,
            detail="La categoria selezionata non puo essere eliminata.",
        )
    documents_count = (
        db.query(func.count(AccountingDocument.id))
        .filter(AccountingDocument.category_id == category.id)
        .scalar()
        or 0
    )
    if documents_count:
        raise HTTPException(
            status_code=409,
            detail="Impossibile eliminare la categoria: contiene documenti.",
        )
    db.delete(category)
    db.commit()
    return {"ok": True, "deleted_category_id": category_id}


@router.get("/accounting/documents")
def list_accounting_documents(
    request: Request,
    q: Optional[str] = Query(default=None),
    org_id: Optional[int] = Query(default=None),
    folder_id: Optional[int] = Query(default=None),
    category_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    query = (
        db.query(AccountingDocument)
        .options(
            joinedload(AccountingDocument.organization),
            joinedload(AccountingDocument.folder),
            joinedload(AccountingDocument.category),
            joinedload(AccountingDocument.uploaded_by_admin),
            joinedload(AccountingDocument.share_links),
        )
        .join(Organization, Organization.id == AccountingDocument.org_id)
        .filter(Organization.deleted_at.is_(None))
    )
    normalized_q = _normalize_optional_text(q)
    if normalized_q:
        pattern = f"%{normalized_q}%"
        query = query.filter(
            or_(
                AccountingDocument.title.ilike(pattern),
                AccountingDocument.description.ilike(pattern),
                AccountingDocument.original_filename.ilike(pattern),
                Organization.name.ilike(pattern),
            )
        )
    if org_id is not None:
        query = query.filter(AccountingDocument.org_id == org_id)
    if folder_id is not None:
        query = query.filter(AccountingDocument.folder_id == folder_id)
    if category_id is not None:
        query = query.filter(AccountingDocument.category_id == category_id)

    items = (
        query.order_by(
            AccountingDocument.created_at.desc(),
            AccountingDocument.id.desc(),
        )
        .all()
    )
    return {
        "items": [
            _serialize_accounting_document(request, document, include_share_links=True)
            for document in items
        ],
        "total": len(items),
    }


@router.post("/accounting/documents", status_code=201)
async def create_accounting_document(
    request: Request,
    org_id: int = Form(...),
    folder_id: int = Form(...),
    category_id: int = Form(...),
    title: str = Form(...),
    description: Optional[str] = Form(None),
    preview_enabled: bool = Form(True),
    is_share_enabled: bool = Form(False),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    organization = _ensure_accounting_enabled_org(db, org_id)
    folder = _get_accounting_folder_or_404(db, folder_id)
    category = _get_accounting_category_or_404(db, category_id)
    normalized_title = _normalize_optional_text(title)
    if normalized_title is None:
        raise HTTPException(status_code=422, detail="Titolo obbligatorio.")

    rel_path, size_bytes, sha256 = await save_accounting_upload_file(file)
    document = AccountingDocument(
        org_id=organization.id,
        folder_id=folder.id,
        category_id=category.id,
        title=normalized_title,
        description=_normalize_optional_text(description),
        storage_key=rel_path,
        original_filename=file.filename or os.path.basename(rel_path),
        mime_type=file.content_type,
        file_size=size_bytes,
        sha256=sha256,
        preview_enabled=bool(preview_enabled),
        is_share_enabled=bool(is_share_enabled),
        uploaded_by_admin_id=admin.id,
    )
    db.add(document)
    db.flush()
    notify_org_admins_about_accounting_document(
        db,
        organization=organization,
        document=document,
        request=request,
    )
    db.commit()
    document = _get_accounting_document_or_404(db, document.id)
    return {
        "ok": True,
        "document": _serialize_accounting_document(
            request, document, include_share_links=True
        ),
    }


@router.patch("/accounting/documents/{document_id}")
async def update_accounting_document(
    document_id: int,
    request: Request,
    org_id: Optional[int] = Form(None),
    folder_id: Optional[int] = Form(None),
    category_id: Optional[int] = Form(None),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    preview_enabled: Optional[bool] = Form(None),
    is_share_enabled: Optional[bool] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    document = _get_accounting_document_or_404(db, document_id)
    del admin
    if org_id is not None:
        organization = _ensure_accounting_enabled_org(db, org_id)
        document.org_id = organization.id
    if folder_id is not None:
        document.folder_id = _get_accounting_folder_or_404(db, folder_id).id
    if category_id is not None:
        document.category_id = _get_accounting_category_or_404(db, category_id).id
    if title is not None:
        normalized_title = _normalize_optional_text(title)
        if normalized_title is None:
            raise HTTPException(status_code=422, detail="Titolo obbligatorio.")
        document.title = normalized_title
    if description is not None:
        document.description = _normalize_optional_text(description)
    if preview_enabled is not None:
        document.preview_enabled = bool(preview_enabled)
    if is_share_enabled is not None:
        document.is_share_enabled = bool(is_share_enabled)
    if file is not None:
        rel_path, size_bytes, sha256 = await save_accounting_upload_file(file)
        document.storage_key = rel_path
        document.original_filename = file.filename or os.path.basename(rel_path)
        document.mime_type = file.content_type
        document.file_size = size_bytes
        document.sha256 = sha256
    db.add(document)
    db.commit()
    document = _get_accounting_document_or_404(db, document.id)
    return {
        "ok": True,
        "document": _serialize_accounting_document(
            request, document, include_share_links=True
        ),
    }


@router.delete("/accounting/documents/{document_id}")
def delete_accounting_document(
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    document = _get_accounting_document_or_404(db, document_id)
    db.delete(document)
    db.commit()
    return {"ok": True, "deleted_document_id": document_id}


@router.get("/accounting/documents/{document_id}")
def get_accounting_document(
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    document = _get_accounting_document_or_404(db, document_id)
    return _serialize_accounting_document(request, document, include_share_links=True)


@router.get("/accounting/documents/{document_id}/preview")
def preview_accounting_document(
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    document = _get_accounting_document_or_404(db, document_id)
    if not accounting_document_preview_available(document):
        raise HTTPException(
            status_code=409,
            detail="Preview web non disponibile per questo file.",
        )
    return build_accounting_file_response(
        document,
        content_disposition_type="inline",
    )


@router.get("/accounting/documents/{document_id}/download")
def download_accounting_document(
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    document = _get_accounting_document_or_404(db, document_id)
    return build_accounting_file_response(
        document,
        content_disposition_type="attachment",
    )


@router.post("/accounting/share-links/{share_link_id}/revoke")
def revoke_accounting_share_link(
    share_link_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    share_link = (
        db.query(AccountingShareLink)
        .filter(AccountingShareLink.id == share_link_id)
        .first()
    )
    if share_link is None:
        raise HTTPException(status_code=404, detail="Link di condivisione non trovato.")
    if share_link.revoked_at is None:
        share_link.revoked_at = datetime.utcnow()
        db.add(share_link)
        db.commit()
    return {"ok": True, "share_link_id": share_link_id}


@router.post("/organizations/{org_id}/logo")
async def upload_org_logo(
    request: Request,
    org_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    rel_path, size, sha = await save_upload_file(
        file,
        allowed_types=["image/jpeg", "image/png", "image/svg+xml"],
        max_size=2 * 1024 * 1024,
    )

    org.logo_path = rel_path
    db.commit()

    audit.log_operation(
        db,
        action="org.logo.upload",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="super_admin",
        metadata={"filename": file.filename, "size": size, "sha256": sha},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {"logo_path": rel_path}


@router.post("/organizations/{org_id}/statute")
async def upload_org_statute(
    request: Request,
    org_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    try:
        enforce_statute_request_size_from_headers(request.headers)
        rel_path, size, sha = await save_statute_pdf(file)
    except HTTPException as exc:
        if exc.status_code in {413, 415, 422}:
            logger.warning(
                "Rejected super-admin statute upload status=%s request_id=%s org_id=%s content_length=%s filename=%s mime=%s",
                exc.status_code,
                getattr(request.state, "request_id", None),
                org_id,
                request.headers.get("content-length"),
                file.filename,
                file.content_type,
            )
        raise

    new_version = "v1"
    if org.statute_version:
        if org.statute_version.startswith("v") and org.statute_version[1:].isdigit():
            ver_num = int(org.statute_version[1:])
            new_version = f"v{ver_num + 1}"
        else:
            new_version = f"{org.statute_version}_new"

    org.statute_pdf_path = rel_path
    org.statute_version = new_version
    org.statute_updated_at = datetime.utcnow()
    db.commit()

    audit.log_operation(
        db,
        action="org.statute.upload",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="super_admin",
        metadata={
            "filename": file.filename,
            "size": size,
            "sha256": sha,
            "version": new_version,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "statute_version": new_version,
        "updated_at": org.statute_updated_at,
        "has_statute": True,
    }


# ── Card stock management ────────────────────────────────────────


class SetCardRange(BaseModel):
    from_no: int
    to_no: int
    year: Optional[int] = None


class AddCardBatch(BaseModel):
    from_no: int
    to_no: int
    year: Optional[int] = None


class PatchCardLot(BaseModel):
    status: Optional[Literal["active", "inactive"]] = None
    year: Optional[int] = None
    notes: Optional[str] = None
    range_start: Optional[int] = None
    range_end: Optional[int] = None


def check_card_overlap(
    db: Session, start_no: int, end_no: int, exclude_batch_id: Optional[int] = None
):
    """
    Check if the given range [start_no, end_no] overlaps with any existing CardBatch globally.
    Returns the conflicting batch if found, else None.
    Overlap logic: NOT (new_end < old_start OR new_start > old_end)
    Equivalent to: (new_end >= old_start) AND (new_start <= old_end)
    """
    query = db.query(CardBatch).filter(
        CardBatch.released_at.is_(None),
        CardBatch.start_no <= end_no,
        CardBatch.end_no >= start_no,
    )
    if exclude_batch_id is not None:
        query = query.filter(CardBatch.id != exclude_batch_id)

    return query.first()


def _resolve_batch_year(raw_year: Optional[int]) -> int:
    default_year = datetime.utcnow().year
    if raw_year is None:
        return default_year
    if raw_year < 2000 or raw_year > default_year + 20:
        raise HTTPException(status_code=400, detail="Anno lotto non valido")
    return raw_year


def _count_assigned_cards_for_batch(db: Session, batch: CardBatch) -> int:
    return int(
        db.query(func.count(func.distinct(Member.card_no)))
        .filter(
            Member.org_id == batch.org_id,
            Member.deleted_at.is_(None),
            Member.card_year == batch.year,
            Member.card_no.isnot(None),
            Member.card_no >= batch.start_no,
            Member.card_no <= batch.end_no,
        )
        .scalar()
        or 0
    )


def _count_linked_members_for_batch(db: Session, batch: CardBatch) -> int:
    range_filter = and_(
        Member.card_year == batch.year,
        Member.card_no.isnot(None),
        Member.card_no >= batch.start_no,
        Member.card_no <= batch.end_no,
    )
    return int(
        db.query(func.count(func.distinct(Member.id)))
        .filter(
            Member.org_id == batch.org_id,
            or_(
                Member.batch_id == batch.id,
                range_filter,
            ),
        )
        .scalar()
        or 0
    )


def _batch_manual_enabled(batch: CardBatch) -> bool:
    value = batch.is_enabled
    if value is None:
        return True
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value != 0
    return bool(value)


def _batch_is_assignable(batch: CardBatch) -> bool:
    batch_next_no = batch.next_no if batch.next_no is not None else batch.start_no
    return bool(
        _batch_manual_enabled(batch)
        and batch.released_at is None
        and batch_next_no <= batch.end_no
    )


def _batch_status_label(batch: CardBatch) -> str:
    if batch.released_at is not None:
        return "Rilasciato"
    if not _batch_manual_enabled(batch):
        return "Disattivo"
    if not _batch_is_assignable(batch):
        return "Esaurito"
    return "Attivo"


def _serialize_batch_usage(db: Session, batch: CardBatch) -> dict[str, object]:
    total = int(batch.end_no - batch.start_no + 1)
    assigned = _count_assigned_cards_for_batch(db, batch)
    linked_members = _count_linked_members_for_batch(db, batch)
    remaining = max(total - assigned, 0)
    return {
        "id": batch.id,
        "start_no": batch.start_no,
        "end_no": batch.end_no,
        "next_no": batch.next_no,
        "year": batch.year,
        "is_enabled": _batch_manual_enabled(batch),
        "is_active": _batch_is_assignable(batch),
        "status_label": _batch_status_label(batch),
        "notes": batch.notes,
        "total": total,
        "assigned": assigned,
        "remaining": remaining,
        "linked_members": linked_members,
        "range_editable": linked_members == 0,
        "deletable": assigned == 0 and linked_members == 0,
    }


def _normalize_batch_notes(raw_notes: Optional[str]) -> Optional[str]:
    if raw_notes is None:
        return None
    normalized = raw_notes.strip()
    return normalized or None


def _get_organization_and_batch_or_404(
    db: Session,
    org_id: int,
    lot_id: int,
) -> tuple[Organization, CardBatch]:
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    batch = (
        db.query(CardBatch)
        .filter(
            CardBatch.id == lot_id,
            CardBatch.org_id == org_id,
            CardBatch.released_at.is_(None),
        )
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Lotto tessere non trovato")

    return org, batch


def _begin_card_allocation_transaction(db: Session) -> None:
    """Serialize card-range allocation for both SQLite and Postgres."""
    db.commit()

    bind = db.get_bind()
    dialect_name = ""
    if bind is not None and getattr(bind, "dialect", None) is not None:
        dialect_name = (bind.dialect.name or "").lower()

    if dialect_name == "sqlite":
        db.execute(text("BEGIN IMMEDIATE"))
        return

    if dialect_name == "postgresql":
        # Lock the shared batch table so overlap checks + inserts stay serialized.
        db.execute(text("LOCK TABLE card_batches IN SHARE ROW EXCLUSIVE MODE"))
        return


@router.post("/organizations/{org_id}/card-range")
def set_initial_card_range(
    request: Request,
    org_id: int,
    body: SetCardRange,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    # Ensure strict serialization for card allocation
    _begin_card_allocation_transaction(db)

    if body.from_no <= 0 or body.to_no <= 0:
        raise HTTPException(status_code=400, detail="Range must be positive integers")
    if body.from_no > body.to_no:
        raise HTTPException(
            status_code=400, detail="FROM must be less than or equal to TO"
        )
    batch_year = _resolve_batch_year(body.year)

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Check if org already has batches
    existing_count = (
        db.query(CardBatch)
        .filter(
            CardBatch.org_id == org_id,
            CardBatch.released_at.is_(None),
        )
        .count()
    )
    if existing_count > 0:
        raise HTTPException(
            status_code=400,
            detail="L'organizzazione ha già delle tessere assegnate. Usa 'Aggiungi tessere'.",
        )

    # Check global overlap
    conflict = check_card_overlap(db, body.from_no, body.to_no)
    if conflict:
        # Fetch conflicting org name
        conflicting_org = (
            db.query(Organization).filter(Organization.id == conflict.org_id).first()
        )
        org_name = (
            conflicting_org.name if conflicting_org else f"Org #{conflict.org_id}"
        )
        raise HTTPException(
            status_code=409,
            detail=f"Intervallo tessere in conflitto con {org_name} ({conflict.start_no}–{conflict.end_no})",
        )

    batch = CardBatch(
        org_id=org_id,
        year=batch_year,
        start_no=body.from_no,
        end_no=body.to_no,
        next_no=body.from_no,
    )
    db.add(batch)
    db.flush()

    movement = CardMovement(
        org_id=org_id,
        admin_id=admin.id,
        delta=(body.to_no - body.from_no + 1),
        reason="initial_allocation",
    )
    db.add(movement)

    audit.log_operation(
        db,
        action="org.cards.range_set",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="super_admin",
        metadata={"from": body.from_no, "to": body.to_no},
        ip=get_client_ip(request),
    )
    db.commit()

    return {
        "ok": True,
        "year": batch_year,
        "start_no": body.from_no,
        "end_no": body.to_no,
    }


@router.post("/orgs/{org_id}/cards/add-batch")
def add_card_batch(
    request: Request,
    org_id: int,
    body: AddCardBatch,
    db: Session = Depends(get_db),
):
    """Add a new card batch with explicit from/to range."""
    admin = _require_super_admin(request, db)
    # Ensure strict serialization for card allocation
    _begin_card_allocation_transaction(db)

    if body.from_no <= 0 or body.to_no <= 0:
        raise HTTPException(
            status_code=400, detail="I numeri devono essere interi positivi"
        )
    if body.from_no > body.to_no:
        raise HTTPException(
            status_code=400,
            detail="Il numero iniziale deve essere minore o uguale al finale",
        )
    batch_year = _resolve_batch_year(body.year)

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Check global overlap (across all organizations)
    conflict = check_card_overlap(db, body.from_no, body.to_no)
    if conflict:
        conflicting_org = (
            db.query(Organization).filter(Organization.id == conflict.org_id).first()
        )
        org_name = (
            conflicting_org.name if conflicting_org else f"Org #{conflict.org_id}"
        )
        raise HTTPException(
            status_code=409,
            detail=f"Intervallo tessere in conflitto con {org_name} ({conflict.start_no}–{conflict.end_no})",
        )

    batch = CardBatch(
        org_id=org_id,
        year=batch_year,
        start_no=body.from_no,
        end_no=body.to_no,
        next_no=body.from_no,
    )
    db.add(batch)
    db.flush()

    amount = body.to_no - body.from_no + 1
    movement = CardMovement(
        org_id=org_id,
        admin_id=admin.id,
        delta=amount,
        reason="batch_added",
    )
    db.add(movement)
    db.commit()

    audit.log_operation(
        db,
        action="org.cards.batch_added",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="super_admin",
        metadata={"from": body.from_no, "to": body.to_no, "batch_id": batch.id},
        ip=get_client_ip(request),
    )
    db.commit()

    # Return updated stock summary
    batches = (
        db.query(CardBatch)
        .filter(
            CardBatch.org_id == org_id,
            CardBatch.year == batch_year,
            CardBatch.released_at.is_(None),
        )
        .order_by(CardBatch.start_no)
        .all()
    )
    serialized_batches = [_serialize_batch_usage(db, b) for b in batches]
    total = int(sum(int(item["total"]) for item in serialized_batches))
    remaining = int(sum(int(item["remaining"]) for item in serialized_batches))

    return {
        "ok": True,
        "batch_id": batch.id,
        "year": batch_year,
        "start_no": body.from_no,
        "end_no": body.to_no,
        "cards_total": total,
        "cards_remaining": remaining,
    }


@router.get("/organizations/{org_id}/batches")
def get_org_batches(
    request: Request,
    org_id: int,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Get all card batches for an organization."""
    _require_super_admin(request, db)

    now = datetime.utcnow()
    target_year = _resolve_batch_year(year if year is not None else now.year)
    next_reset = datetime(target_year + 1, 1, 1)

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    batches = (
        db.query(CardBatch)
        .filter(
            CardBatch.org_id == org_id,
            CardBatch.year == target_year,
            CardBatch.released_at.is_(None),
        )
        .order_by(CardBatch.start_no)
        .all()
    )
    serialized_batches = [_serialize_batch_usage(db, b) for b in batches]
    summary_total = int(sum(int(item["total"]) for item in serialized_batches))
    summary_assigned = int(sum(int(item["assigned"]) for item in serialized_batches))
    summary_remaining = int(sum(int(item["remaining"]) for item in serialized_batches))

    return {
        "batches": serialized_batches,
        "current_year": target_year,
        "next_reset_at": next_reset.isoformat() + "Z",
        "summary": {
            "total": summary_total,
            "assigned": summary_assigned,
            "remaining": summary_remaining,
        },
    }


@associations_router.patch("/organizations/{org_id}/card-lots/{lot_id}")
def patch_org_card_lot(
    request: Request,
    org_id: int,
    lot_id: int,
    body: PatchCardLot,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    org, batch = _get_organization_and_batch_or_404(db, org_id, lot_id)
    payload = body.model_dump(exclude_unset=True)
    if not payload:
        return {"ok": True, "item": _serialize_batch_usage(db, batch)}

    current_enabled = _batch_manual_enabled(batch)
    current_notes = _normalize_batch_notes(batch.notes)
    requested_year = batch.year
    requested_start = batch.start_no
    requested_end = batch.end_no

    if "year" in payload:
        requested_year = _resolve_batch_year(payload["year"])
    if "range_start" in payload and payload["range_start"] is not None:
        requested_start = int(payload["range_start"])
    if "range_end" in payload and payload["range_end"] is not None:
        requested_end = int(payload["range_end"])

    range_changed = requested_start != batch.start_no or requested_end != batch.end_no
    year_changed = requested_year != batch.year
    if range_changed:
        if requested_start <= 0 or requested_end <= 0:
            raise HTTPException(
                status_code=400, detail="I numeri devono essere interi positivi"
            )
        if requested_start > requested_end:
            raise HTTPException(
                status_code=400,
                detail="Il numero iniziale deve essere minore o uguale al finale",
            )

    linked_members = _count_linked_members_for_batch(db, batch)
    if linked_members > 0 and (range_changed or year_changed):
        raise HTTPException(
            status_code=409,
            detail="Impossibile modificare il range o l'anno: esistono tessere gia assegnate",
        )

    if range_changed:
        _begin_card_allocation_transaction(db)
        conflict = check_card_overlap(
            db,
            requested_start,
            requested_end,
            exclude_batch_id=batch.id,
        )
        if conflict:
            conflicting_org = (
                db.query(Organization)
                .filter(Organization.id == conflict.org_id)
                .first()
            )
            org_name = (
                conflicting_org.name if conflicting_org else f"Org #{conflict.org_id}"
            )
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Intervallo tessere in conflitto con {org_name} "
                    f"({conflict.start_no}-{conflict.end_no})"
                ),
            )

    changes: dict[str, object] = {}

    if "status" in payload:
        next_enabled = payload["status"] == "active"
        if next_enabled != current_enabled:
            batch.is_enabled = next_enabled
            changes["status"] = payload["status"]

    if "notes" in payload:
        next_notes = _normalize_batch_notes(payload["notes"])
        if next_notes != current_notes:
            batch.notes = next_notes
            changes["notes"] = next_notes

    if year_changed:
        batch.year = requested_year
        changes["year"] = requested_year

    if range_changed:
        batch.start_no = requested_start
        batch.end_no = requested_end
        batch.next_no = requested_start
        changes["range"] = {
            "start_no": requested_start,
            "end_no": requested_end,
        }

    if not changes:
        return {"ok": True, "item": _serialize_batch_usage(db, batch)}

    db.flush()
    audit.log_operation(
        db,
        action="org.cards.batch_updated",
        entity_type="card_batch",
        entity_id=batch.id,
        actor_admin_id=admin.id,
        actor_role="super_admin",
        metadata={
            "org_id": org.id,
            "batch_id": batch.id,
            "changes": changes,
        },
        ip=get_client_ip(request),
    )
    db.commit()
    db.refresh(batch)

    return {
        "ok": True,
        "item": _serialize_batch_usage(db, batch),
    }


@associations_router.delete("/organizations/{org_id}/card-lots/{lot_id}")
def delete_org_card_lot(
    request: Request,
    org_id: int,
    lot_id: int,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    org, batch = _get_organization_and_batch_or_404(db, org_id, lot_id)

    assigned = _count_assigned_cards_for_batch(db, batch)
    linked_members = _count_linked_members_for_batch(db, batch)
    if assigned > 0 or linked_members > 0:
        raise HTTPException(
            status_code=409,
            detail="Impossibile eliminare: esistono tessere gia assegnate",
        )

    snapshot = {
        "org_id": org.id,
        "batch_id": batch.id,
        "year": batch.year,
        "start_no": batch.start_no,
        "end_no": batch.end_no,
        "is_enabled": _batch_manual_enabled(batch),
        "notes": batch.notes,
    }

    db.delete(batch)
    audit.log_operation(
        db,
        action="org.cards.batch_deleted",
        entity_type="card_batch",
        entity_id=lot_id,
        actor_admin_id=admin.id,
        actor_role="super_admin",
        metadata=snapshot,
        ip=get_client_ip(request),
    )
    db.commit()

    return {
        "ok": True,
        "deleted_lot_id": lot_id,
    }


# Legacy endpoint redirect (deprecated)
@router.post("/orgs/{org_id}/cards/increase")
def increase_card_stock_legacy(
    request: Request,
    org_id: int,
    db: Session = Depends(get_db),
):
    """Deprecated: use /orgs/{org_id}/cards/add-batch instead."""
    _require_super_admin(request, db)
    raise HTTPException(
        status_code=400,
        detail="Endpoint deprecato. Usa il nuovo formato con range dalla/alla.",
    )


# ── Test email ──────────────────────────────────────────────────


class TestEmailBody(BaseModel):
    to: EmailStr


@router.post("/test-email")
def test_email(
    request: Request,
    body: TestEmailBody,
    db: Session = Depends(get_db),
):
    """Send a test email to verify SMTP configuration. Super admin only."""
    _require_super_admin(request, db)
    outbox_id = enqueue_email(
        db,
        email_type="test_email",
        to_email=body.to,
        subject="ASSO.N.A.M. — Test Email",
        payload=build_email_payload(
            text_body=(
            "Questa email di test conferma che la configurazione SMTP "
            f"del portale ASSO.N.A.M. funziona correttamente.\n\n"
            f"Server: {settings.BASE_URL}\n"
                f"SMTP Host: {settings.SMTP_HOST or '(missing)'}"
            )
        ),
        priority=9,
    )
    db.commit()
    return {
        "ok": True,
        "status": "queued",
        "outbox_id": outbox_id,
        "smtp_configured": bool(
            settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD
        ),
        "to": body.to,
    }
