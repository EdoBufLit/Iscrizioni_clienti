import csv
import hashlib
import io
import json

import os
import random
import secrets
from fastapi import APIRouter, Depends, HTTPException, Request, Form, Body, Query
from fastapi.responses import StreamingResponse, FileResponse, Response
from sqlalchemy import func, or_, case, and_, select, cast, String
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timedelta, date
from decimal import Decimal
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, TypeAdapter

from fastapi import UploadFile, File
from app.db import get_db
from app.models import (
    AdminUser,
    AdminRole,
    Booking,
    OrgAdminToken,
    Member,
    MemberStatus,
    PaymentMethod,
    CardBatch,
    CardMovement,
    Organization,
    MemberDocument,
    MembershipPayment,
    DocStatus,
    MemberPayment,
    OperationLog,
    Token,
    TokenType,
    SignupSource,
    Referral,
    ReferralStatus,
    AffiliationEvent,
    OrganizationSharedDocument,
    OrganizationSharedDocumentAssignment,
    OrgAdminNotification,
    AccountingCategory,
    AccountingDocument,
    AccountingFolder,
    AccountingShareLink,
    EmailCampaign,
    EmailCampaignRecipient,
    EmailBuilderAsset,
    EmailTemplate,
    Form as AssociationForm,
    FormField,
    FormSubmission,
    WhatsAppAutomation,
    Room,
    RoomTable,
)
from app.models_affiliation import (
    AffiliationApplication,
    AffiliationApplicationStatus,
    AffiliationDocsStatus,
    AffiliationPaymentStatus,
)
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import (
    build_sender_payload,
    resolve_email_sender,
    sanitize_email_local_part,
)
from app.services.email_campaigns import (
    ALLOWED_AUDIENCE_TYPES,
    ALLOWED_RECIPIENT_MODES,
    campaign_status_counts,
    create_campaign_draft,
    deserialize_selected_member_ids,
    normalize_recipient_mode,
    normalize_selected_member_ids,
    RECIPIENT_MODE_ALL_MEMBERS,
    RECIPIENT_MODE_SELECTED_MEMBERS,
    resolve_audience_recipients,
    send_test_email_now,
    send_campaign,
    update_campaign_draft,
)
from app.services.email_templates import (
    AVAILABLE_TEMPLATE_VARIABLES,
    EMAIL_TEMPLATE_CHANNEL,
    EMAIL_EDITOR_STATUS_DRAFT,
    EMAIL_EDITOR_STATUS_READY,
    EMAIL_TEMPLATE_TYPE_GENERIC_NOTICE,
    EMAIL_TEMPLATE_TYPES,
    decorate_rendered_email,
    build_template_context,
    build_linked_form_url,
    normalize_email_editor_status,
    normalize_email_design,
    normalize_email_template_type,
    normalize_template_bodies,
    normalize_template_channel,
    normalize_template_scope,
    render_template_content,
)
from app.services.email_builder_assets import (
    enforce_email_builder_asset_request_size_from_headers,
    save_email_builder_asset_file,
)
from app.services.accounting import (
    accounting_document_preview_available,
    build_accounting_file_response,
    create_accounting_share_link,
    ensure_accounting_seed_data,
)
from app.services.forms import (
    ALLOWED_FORM_FIELD_TYPES,
    ALLOWED_FORM_VISIBILITY,
    apply_form_field_updates,
    apply_form_updates,
    build_unique_form_slug,
    ensure_forms_module_enabled,
    export_submissions_csv,
    FORM_SUBMISSION_STATUS_PENDING,
    FORM_SUBMISSION_STATUS_REJECTED,
    get_form_for_org_admin,
    normalize_form_whatsapp_template,
    normalize_submission_status,
    normalize_form_slug,
    serialize_form,
    serialize_form_field,
    serialize_submission,
)
from app.services.whatsapp_automation import (
    maybe_send_form_submission_decision_whatsapp_message,
)
from app.services.whatsapp_automations import (
    ALLOWED_WHATSAPP_PHONE_SOURCES,
    ALLOWED_WHATSAPP_RECIPIENTS,
    ALLOWED_WHATSAPP_SOURCES,
    ALLOWED_WHATSAPP_TRIGGERS,
    apply_whatsapp_automation_updates,
    serialize_whatsapp_automation,
)
from app.services.bookings import (
    agenda_day_payload,
    agenda_week_payload,
    list_bookings,
    serialize_booking,
    update_booking_status,
)
from app.services.booking_rooms import (
    apply_room_table_updates,
    apply_room_updates,
    get_room_for_org_admin,
    get_room_table_for_org_admin,
    list_room_tables_for_org_admin,
    list_rooms_for_org_admin,
    resolve_assignment_targets,
    room_map_payload,
    serialize_room,
    serialize_room_table,
    update_table_positions,
    validate_booking_assignment,
)
from app.services.card_allocation import release_card_number
from app.services.card_inventory import compute_org_card_stock
from app.services.card_lot_registry import format_card_number
from app.services.card_pdf import generate_card_pdf_bytes
from app.services.card_verification import build_card_verification_token
from app.services.fiscal_code import validate_fiscal_code
from app.utils import (
    PermanentEmailDeliveryError,
    RetryableEmailDeliveryError,
    generate_token,
    hash_token,
    send_email_via_transport_low_level,
)
from app.services.municipalities import (
    get_municipality_by_code,
    normalize_municipality_text,
)
from app.services.member_activity import (
    member_expired_filters,
    get_member_lifecycle_status,
    is_member_active,
    member_active_filters,
)
from app.services.member_membership import (
    MEMBERSHIP_TYPE_ANNUAL,
    apply_membership_defaults,
    membership_amount_to_float,
    membership_type_label,
    normalize_membership_type,
    normalize_temporary_duration_unit,
    organization_allows_custom_membership_types,
    organization_membership_fee_amount,
    resolve_member_membership_type,
    resolve_member_valid_from,
    resolve_member_valid_until,
    resolve_temporary_duration,
    serialize_membership_configuration,
    quantize_membership_amount,
)
from app.services.member_card_delivery import (
    maybe_send_member_card_ready_email,
    queue_member_card_email,
)
from app.services.membership_payments import (
    PAID_MEMBERSHIP_STATUSES,
    apply_manual_membership_payment,
    create_legacy_manual_member_payment,
    maybe_fulfill_member_card,
    normalize_membership_payment_reason,
    organization_requires_membership_payment,
    payment_status_is_paid,
)
from app.services.org_branding import (
    resolve_club_display_name,
    wallet_branding_defaults,
)
from app.services.statute_upload import (
    enforce_statute_request_size_from_headers,
    save_statute_pdf,
)
from app.services.wallet_asset_upload import (
    enforce_wallet_asset_request_size_from_headers,
    save_wallet_hero_image_file,
    save_wallet_logo_file,
)
from app.config import settings
from app.middleware import auth_limiter, get_client_ip
from app import audit
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/org-admin")

auth_router = APIRouter(prefix="/auth")

_ORG_SHARED_DOCUMENT_KINDS = {"general", "accounting"}
_EMAIL_STR_ADAPTER = TypeAdapter(EmailStr)


def _get_current_org_admin(request: Request, db: Session):
    """Return the authenticated org admin from the session, or None.

    Note: We only check for org_admin_id. If someone is also logged in as
    super admin (admin_id), they can still use org_admin endpoints if they
    have a valid org_admin session. This prevents confusing authorization
    failures when both sessions coexist.
    """
    admin_id = request.session.get("org_admin_id")
    if not admin_id:
        return None
    admin = (
        db.query(AdminUser)
        .filter(
            AdminUser.id == admin_id,
            AdminUser.role == AdminRole.ORG_ADMIN,
            AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None),  # Added deleted_at filter
        )
        .first()
    )
    return admin


def _hash_email_for_log(email: str | None) -> str:
    normalized = (email or "").strip().lower()
    if not normalized:
        return "unknown"
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def _normalize_login_email(email: str | None) -> str:
    return (email or "").strip().lower()


def _resolve_org_admin_magic_link_candidate(
    db: Session, normalized_email: str
) -> tuple[AdminUser | None, str, list[AdminUser]]:
    if not normalized_email:
        return None, "empty_email", []

    candidates = (
        db.query(AdminUser)
        .filter(
            func.lower(func.trim(AdminUser.email)) == normalized_email,
            AdminUser.role == AdminRole.ORG_ADMIN,
        )
        .order_by(AdminUser.id.desc())
        .all()
    )
    if not candidates:
        return None, "admin_not_found", []

    for candidate in candidates:
        if candidate.deleted_at is not None:
            continue
        if candidate.org_id is None:
            continue
        if not candidate.is_active:
            continue
        return candidate, "ok", candidates

    if any(candidate.deleted_at is not None for candidate in candidates):
        return None, "admin_deleted", candidates
    if any(candidate.org_id is None for candidate in candidates):
        return None, "admin_missing_org", candidates
    if any(not candidate.is_active for candidate in candidates):
        return None, "admin_inactive", candidates
    return None, "admin_not_eligible", candidates


ACCESS_EMAIL_THROTTLE_MINUTES = 10
_ALLOWED_MEMBER_PAYMENT_METHODS = {
    PaymentMethod.CASH.value,
    PaymentMethod.BONIFICO.value,
}

REFERRAL_REWARD_OPTIONS = [
    {
        "code": "discount_10_next_year",
        "title": "10% di sconto sulla prossima affiliazione annuale",
        "description": "Sconto economico applicato al rinnovo dell'anno successivo.",
        "delivery_timing": "Applicazione automatica sulla prossima fattura annuale.",
        "weight": 34,
    },
    {
        "code": "cards_50_bonus",
        "title": "50 tessere digitali gratuite",
        "description": "Credito extra per emettere 50 tessere aggiuntive ai soci.",
        "delivery_timing": "Accredito operativo entro 10 giorni lavorativi.",
        "weight": 28,
    },
    {
        "code": "cards_100_bonus",
        "title": "100 tessere digitali gratuite",
        "description": "Pacchetto premium di 100 tessere digitali aggiuntive.",
        "delivery_timing": "Accredito operativo entro 15 giorni lavorativi.",
        "weight": 14,
    },
    {
        "code": "onboarding_premium",
        "title": "Onboarding premium segreteria (60 minuti)",
        "description": "Sessione dedicata con team ASSONAM su processi e best practice.",
        "delivery_timing": "Pianificazione call entro 30 giorni dalla conferma.",
        "weight": 14,
    },
    {
        "code": "communication_bundle",
        "title": "Pacchetto comunicazione soci",
        "description": "Template email/social per promuovere iscrizioni e rinnovi.",
        "delivery_timing": "Invio materiali entro 7 giorni lavorativi.",
        "weight": 10,
    },
]


def _normalize_tag_culture(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return value.replace("T.A.G.", "TAG")


def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _validate_optional_email(value: Optional[str], *, field_name: str) -> Optional[str]:
    normalized = _normalize_optional_text(value)
    if normalized is None:
        return None
    try:
        return str(_EMAIL_STR_ADAPTER.validate_python(normalized))
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"{field_name} non valida.",
        ) from exc


def _parse_optional_birth_date(value: Optional[str | date]) -> Optional[date]:
    if value is None or isinstance(value, date):
        return value
    cleaned = value.strip()
    if not cleaned:
        return None
    try:
        return date.fromisoformat(cleaned)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="Data di nascita non valida.",
        ) from exc


def _normalize_member_identity_document_fields(
    *, birth_place: Optional[str], birth_place_code: Optional[str]
) -> tuple[Optional[str], Optional[str]]:
    normalized_name = normalize_municipality_text(birth_place)
    normalized_code = (birth_place_code or "").strip().upper() or None

    if normalized_name is None and normalized_code is None:
        return None, None
    if normalized_name is None or normalized_code is None:
        raise HTTPException(
            status_code=422,
            detail="Comune di nascita non valido. Seleziona un comune valido dall'elenco.",
        )

    municipality = get_municipality_by_code(normalized_code)
    if municipality is None:
        raise HTTPException(
            status_code=422,
            detail="Comune di nascita non valido. Seleziona un comune valido dall'elenco.",
        )
    if normalize_municipality_text(municipality["name"]) != normalized_name:
        raise HTTPException(
            status_code=422,
            detail="Comune di nascita non valido. Seleziona un comune valido dall'elenco.",
        )

    return municipality["name"], municipality["code"]


def _resolve_org_logo_disk_path(org: Organization | None) -> str | None:
    if org is None:
        return None
    if org.logo_path:
        candidate = os.path.join(settings.UPLOAD_DIR, org.logo_path)
        return candidate if os.path.exists(candidate) else None
    slug = (getattr(org, "slug", None) or "").strip().lower()
    if slug:
        static_candidate = os.path.normpath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "static",
                "card-logos",
                f"{slug}.png",
            )
        )
        return static_candidate if os.path.exists(static_candidate) else None
    return None


def _resolve_assonam_disk_path() -> str | None:
    static_dir = (settings.FRONTEND_STATIC_DIR or "").strip()
    if static_dir:
        candidate = os.path.join(static_dir, "logo-transparent.png")
        return candidate if os.path.exists(candidate) else None
    candidate = os.path.normpath(
        os.path.join(
            os.path.dirname(__file__),
            "..",
            "..",
            "frontend",
            "public",
            "logo-transparent.png",
        )
    )
    return candidate if os.path.exists(candidate) else None


def _member_card_pdf_bytes(member: Member, request: Request) -> bytes:
    if member.card_no is None or member.card_year is None:
        raise HTTPException(
            status_code=409,
            detail="Tessera non disponibile per questo socio.",
        )

    token = build_card_verification_token(
        member_id=member.id,
        org_id=member.org_id,
        card_number=member.card_no,
        card_year=member.card_year,
    )
    backend_base = (settings.BASE_URL or "").strip().rstrip("/") or str(request.base_url).rstrip("/")
    verification_url = f"{backend_base}/api/cards/verify/{token}"
    organization = member.organization
    if organization is None:
        raise HTTPException(status_code=404, detail="Associazione non trovata.")

    try:
        return generate_card_pdf_bytes(
            member_full_name=f"{(member.first_name or '').strip()} {(member.last_name or '').strip()}".strip() or "Socio",
            organization_name=organization.name or "ASSONAM",
            club_display_name=resolve_club_display_name(organization) or organization.name or "ASSONAM",
            organization_slug=organization.slug,
            card_number=member.card_no,
            card_year=member.card_year,
            card_status="attiva" if is_member_active(member, now=datetime.utcnow()) else "non_attiva",
            verification_url=verification_url,
            org_logo_path=_resolve_org_logo_disk_path(organization),
            assonam_logo_path=_resolve_assonam_disk_path(),
            membership_type_label=membership_type_label(
                resolve_member_membership_type(member)
            ),
            valid_until_text=(
                resolve_member_valid_until(member).strftime("%d/%m/%Y %H:%M")
                if resolve_member_valid_until(member)
                else None
            ),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Member card PDF generation failed for member_id=%s", member.id)
        raise HTTPException(
            status_code=500,
            detail="Errore generazione PDF tessera.",
        ) from exc


def _normalize_org_communications_update(
    update_data: dict[str, object],
) -> dict[str, object]:
    normalized = dict(update_data)

    if "sender_email_local_part" in normalized:
        raw_local_part = _normalize_optional_text(
            normalized.get("sender_email_local_part")  # type: ignore[arg-type]
        )
        normalized["sender_email_local_part"] = (
            sanitize_email_local_part(raw_local_part) if raw_local_part else None
        )

    if "email_from_name_override" in normalized:
        raw_override = _normalize_optional_text(
            normalized.get("email_from_name_override")  # type: ignore[arg-type]
        )
        normalized["email_from_name_override"] = (
            _normalize_tag_culture(raw_override) if raw_override else None
        )

    if "reply_to_email" in normalized:
        normalized["reply_to_email"] = _validate_optional_email(
            normalized.get("reply_to_email"),  # type: ignore[arg-type]
            field_name="reply_to_email",
        )

    return normalized


COMMUNICATIONS_MODULE_LOCKED_MESSAGE = (
    "Modulo Comunicazioni non attivo. Contatta ASSONAM per abilitarlo."
)


def _require_active_communications_module(org: Organization) -> None:
    if not bool(org.communications_enabled):
        raise HTTPException(
            status_code=403,
            detail=COMMUNICATIONS_MODULE_LOCKED_MESSAGE,
        )


def _serialize_communications_sender(sender) -> dict[str, object]:
    return {
        "from_name": sender.from_name,
        "from_email": sender.from_email,
        "from_header": sender.from_header,
        "reply_to": sender.reply_to,
        "selected_mode": sender.selected_mode,
        "fallback_used": sender.fallback_used,
    }


def _serialize_org_admin_communications_settings(
    org: Organization,
) -> dict[str, object]:
    system_sender = resolve_email_sender(mode="system")
    association_sender = resolve_email_sender(mode="association", association=org)
    return {
        "communications_enabled": bool(org.communications_enabled),
        "whatsapp_evolution_enabled": bool(settings.ENABLE_WHATSAPP_EVOLUTION),
        "sender_email_local_part": org.sender_email_local_part,
        "email_from_name_override": org.email_from_name_override,
        "reply_to_email": org.reply_to_email,
        "mail_from_domain": (settings.MAIL_FROM_DOMAIN or "").strip().lower() or None,
        "system_email_sender": _serialize_communications_sender(system_sender),
        "association_email_sender": _serialize_communications_sender(association_sender),
    }


def _serialize_org_admin_organization(
    request: Request,
    org: Organization,
) -> dict[str, object]:
    wallet_defaults = wallet_branding_defaults(
        org, base_url=str(request.base_url).rstrip("/")
    )
    communications_settings = _serialize_org_admin_communications_settings(org)
    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "description": org.description,
        "address_line1": org.address_line1,
        "address_line2": org.address_line2,
        "city": org.city,
        "province": org.province,
        "postal_code": org.postal_code,
        "country": org.country,
        "email": org.email,
        "phone": org.phone,
        "website": org.website,
        "logo_url": f"/api/organizations/{org.slug}/logo" if org.logo_path else None,
        "statute_version": org.statute_version,
        "statute_updated_at": org.statute_updated_at,
        "statute_url": f"/api/organizations/{org.slug}/statute"
        if org.statute_pdf_path
        else None,
        "has_statute": bool(org.statute_pdf_path),
        "wallet_bg_color": org.wallet_bg_color,
        "wallet_logo_url": org.wallet_logo_url,
        "wallet_hero_image_url": org.wallet_hero_image_url,
        "wallet_title_override": org.wallet_title_override,
        "wallet_is_test_prefix": bool(org.wallet_is_test_prefix),
        "accounting_enabled": bool(org.accounting_enabled),
        "communications_enabled": communications_settings["communications_enabled"],
        "sender_email_local_part": communications_settings["sender_email_local_part"],
        "email_from_name_override": communications_settings["email_from_name_override"],
        "reply_to_email": communications_settings["reply_to_email"],
        "mail_from_domain": communications_settings["mail_from_domain"],
        "wallet_effective_bg_color": wallet_defaults["wallet_bg_color"],
        "wallet_effective_logo_url": wallet_defaults["wallet_logo_url"],
        "wallet_effective_hero_image_url": wallet_defaults["wallet_hero_image_url"],
        "wallet_effective_title_override": wallet_defaults["wallet_title_override"],
        "system_email_sender": communications_settings["system_email_sender"],
        "association_email_sender": communications_settings["association_email_sender"],
        "membership_config": serialize_membership_configuration(org),
    }


def _serialize_org_membership_settings(org: Organization) -> dict[str, object]:
    duration_value, duration_unit = resolve_temporary_duration(org)
    return {
        "custom_membership_types_enabled": organization_allows_custom_membership_types(org),
        "membership_fee_amount": membership_amount_to_float(org.membership_fee_amount),
        "temporary_membership_fee_amount": membership_amount_to_float(
            getattr(org, "temporary_membership_fee_amount", None)
        ),
        "membership_fee_currency": getattr(org, "membership_fee_currency", "EUR"),
        "temporary_membership_duration_value": duration_value,
        "temporary_membership_duration_unit": duration_unit,
    }


def _serialize_org_shared_document(
    document: OrganizationSharedDocument,
) -> dict[str, object]:
    return {
        "id": document.id,
        "title": document.title,
        "description": document.description,
        "kind": document.kind,
        "created_at": document.created_at.isoformat() if document.created_at else None,
        "original_filename": document.original_filename,
        "mime_type": document.mime_type,
        "size_bytes": document.size_bytes,
        "download_url": f"/api/org-admin/shared-documents/{document.id}/download",
    }


def _serialize_org_admin_accounting_share_link(
    request: Request,
    link: AccountingShareLink,
) -> dict[str, object]:
    base_url = str(request.base_url).rstrip("/")
    return {
        "id": link.id,
        "url": f"{base_url}/api/public/accounting-share/{link.token}",
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        "revoked_at": link.revoked_at.isoformat() if link.revoked_at else None,
        "created_at": link.created_at.isoformat() if link.created_at else None,
    }


def _serialize_org_admin_accounting_document(
    request: Request,
    document: AccountingDocument,
) -> dict[str, object]:
    preview_available = accounting_document_preview_available(document)
    active_share_links = [
        link
        for link in sorted(
            document.share_links or [],
            key=lambda item: (item.created_at or datetime.min),
            reverse=True,
        )
        if link.revoked_at is None
        and (link.expires_at is None or link.expires_at > datetime.utcnow())
    ]
    return {
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
        "folder": (
            {
                "id": document.folder.id,
                "name": document.folder.name,
                "slug": document.folder.slug,
                "year": document.folder.year,
                "sort_order": document.folder.sort_order,
            }
            if document.folder is not None
            else None
        ),
        "category": (
            {
                "id": document.category.id,
                "code": document.category.code,
                "name": document.category.name,
                "is_system": bool(document.category.is_system),
                "sort_order": document.category.sort_order,
            }
            if document.category is not None
            else None
        ),
        "download_url": f"/api/org-admin/accounting/documents/{document.id}/download",
        "preview_url": f"/api/org-admin/accounting/documents/{document.id}/preview"
        if preview_available
        else None,
        "open_url": (
            f"/api/org-admin/accounting/documents/{document.id}/preview"
            if preview_available
            else f"/api/org-admin/accounting/documents/{document.id}/download"
        ),
        "share_links": [
            _serialize_org_admin_accounting_share_link(request, link)
            for link in active_share_links
        ],
    }


def _get_org_admin_accounting_document_or_404(
    db: Session,
    *,
    admin: AdminUser,
    document_id: int,
) -> AccountingDocument:
    document = (
        db.query(AccountingDocument)
        .options(
            joinedload(AccountingDocument.folder),
            joinedload(AccountingDocument.category),
            joinedload(AccountingDocument.share_links),
        )
        .filter(
            AccountingDocument.id == document_id,
            AccountingDocument.org_id == admin.org_id,
        )
        .first()
    )
    if document is None:
        raise HTTPException(
            status_code=404,
            detail="Documento contabile non trovato.",
        )
    if (
        document.folder is None
        or not bool(document.folder.is_active)
        or document.category is None
        or not bool(document.category.is_active)
    ):
        raise HTTPException(
            status_code=404,
            detail="Documento contabile non disponibile.",
        )
    return document


class CreateAccountingShareLinkBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expires_in_days: Optional[int] = Field(default=None, ge=1, le=365)


def _serialize_org_admin_notification(
    notification: OrgAdminNotification,
) -> dict[str, object]:
    return {
        "id": notification.id,
        "type": notification.type,
        "title": notification.title,
        "body": notification.body,
        "href": notification.href,
        "is_read": bool(notification.is_read),
        "created_at": notification.created_at.isoformat()
        if notification.created_at
        else None,
        "read_at": notification.read_at.isoformat() if notification.read_at else None,
    }


def _serialize_email_campaign(
    campaign: EmailCampaign,
    *,
    include_body: bool = False,
) -> dict[str, object]:
    recipients = list(campaign.recipients or [])
    recipient_mode = normalize_recipient_mode(
        getattr(campaign, "recipient_mode", None) or RECIPIENT_MODE_ALL_MEMBERS
    )
    selected_member_ids = deserialize_selected_member_ids(
        getattr(campaign, "selected_member_ids_json", None)
    )
    selected_member_count = len(selected_member_ids)
    target_summary = (
        f"{selected_member_count} socio selezionato"
        if selected_member_count == 1
        else f"{selected_member_count} soci selezionati"
    ) if recipient_mode == RECIPIENT_MODE_SELECTED_MEMBERS else (
        "Tutti i soci"
    )
    payload = {
        "id": campaign.id,
        "association_id": campaign.association_id,
        "name": campaign.name,
        "source_template_id": getattr(campaign, "source_template_id", None),
        "subject": campaign.subject,
        "audience_type": campaign.audience_type,
        "recipient_mode": recipient_mode,
        "selected_member_ids": selected_member_ids,
        "selected_member_count": selected_member_count,
        "target_summary": target_summary,
        "status": campaign.status,
        "editor_status": normalize_email_editor_status(
            getattr(campaign, "editor_status", None) or EMAIL_EDITOR_STATUS_DRAFT
        ),
        "created_at": campaign.created_at.isoformat() if campaign.created_at else None,
        "scheduled_at": campaign.scheduled_at.isoformat() if campaign.scheduled_at else None,
        "sent_at": campaign.sent_at.isoformat() if campaign.sent_at else None,
        "recipient_count": len(recipients),
        "planned_recipient_count": len(recipients) or selected_member_count,
        "recipient_status_counts": campaign_status_counts(recipients),
        "design": normalize_email_design(getattr(campaign, "design_json", None)),
        "linked_form_id": getattr(campaign, "linked_form_id", None),
        "linked_form": _serialize_form_summary(getattr(campaign, "linked_form", None)),
        "source_template": _serialize_email_template(getattr(campaign, "source_template", None))
        if getattr(campaign, "source_template", None) is not None
        else None,
        "created_by": (
            {
                "id": campaign.created_by_user.id,
                "email": campaign.created_by_user.email,
            }
            if campaign.created_by_user is not None
            else None
        ),
    }
    if include_body:
        payload["body_html"] = campaign.body_html
        payload["body_text"] = campaign.body_text
        payload["grapesjs_project_json"] = getattr(campaign, "grapesjs_project_json", None)
        payload["mjml_source"] = getattr(campaign, "mjml_source", None)
        payload["compiled_html"] = getattr(campaign, "compiled_html", None)
    return payload


def _serialize_email_campaign_recipient(
    recipient: EmailCampaignRecipient,
) -> dict[str, object]:
    return {
        "id": recipient.id,
        "campaign_id": recipient.campaign_id,
        "association_id": recipient.association_id,
        "user_id": recipient.user_id,
        "recipient_email": recipient.recipient_email,
        "recipient_name": recipient.recipient_name,
        "provider_message_id": recipient.provider_message_id,
        "delivery_status": recipient.delivery_status,
        "error_message": recipient.error_message,
        "created_at": recipient.created_at.isoformat() if recipient.created_at else None,
        "sent_at": recipient.sent_at.isoformat() if recipient.sent_at else None,
    }


def _serialize_email_template(
    template: EmailTemplate | None,
    *,
    include_body: bool = False,
) -> dict[str, object] | None:
    if template is None:
        return None
    payload = {
        "id": template.id,
        "association_id": template.association_id,
        "is_system": bool(template.is_system),
        "name": template.name,
        "category": template.category,
        "template_type": normalize_email_template_type(
            getattr(template, "template_type", None)
            or getattr(template, "category", None)
            or EMAIL_TEMPLATE_TYPE_GENERIC_NOTICE
        ),
        "subject": template.subject,
        "channel": template.channel,
        "is_active": bool(template.is_active),
        "editor_status": normalize_email_editor_status(
            getattr(template, "editor_status", None) or EMAIL_EDITOR_STATUS_DRAFT
        ),
        "created_by_user_id": template.created_by_user_id,
        "created_at": template.created_at.isoformat() if template.created_at else None,
        "updated_at": template.updated_at.isoformat() if template.updated_at else None,
        "is_editable": not bool(template.is_system),
        "is_duplicable": True,
        "scope": "system" if template.is_system else "association",
        "design": normalize_email_design(getattr(template, "design_json", None)),
        "linked_form_id": getattr(template, "linked_form_id", None),
        "linked_form": _serialize_form_summary(getattr(template, "linked_form", None)),
    }
    if include_body:
        payload["body_html"] = template.body_html
        payload["body_text"] = template.body_text
        payload["grapesjs_project_json"] = getattr(template, "grapesjs_project_json", None)
        payload["mjml_source"] = getattr(template, "mjml_source", None)
        payload["compiled_html"] = getattr(template, "compiled_html", None)
    return payload


def _serialize_email_builder_asset(asset: EmailBuilderAsset) -> dict[str, object]:
    return {
        "id": asset.id,
        "association_id": asset.association_id,
        "created_by_user_id": asset.created_by_user_id,
        "name": asset.name,
        "file_name": asset.file_name,
        "mime_type": asset.mime_type,
        "size_bytes": asset.size_bytes,
        "storage_path": asset.storage_path,
        "public_url": asset.public_url,
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
        "updated_at": asset.updated_at.isoformat() if asset.updated_at else None,
    }


def _resolve_email_builder_bodies(
    *,
    body_html: str | None,
    body_text: str | None,
    compiled_html: str | None,
) -> tuple[str | None, str | None, str | None]:
    normalized_compiled = (compiled_html or "").strip() or None
    normalized_html = normalized_compiled or body_html
    resolved_html, resolved_text = normalize_template_bodies(
        body_html=normalized_html,
        body_text=body_text,
    )
    return resolved_html, resolved_text, normalized_compiled or resolved_html


def _serialize_form_summary(form: AssociationForm | None) -> dict[str, object] | None:
    if form is None:
        return None
    public_path = (
        f"/forms/{form.organization.slug}/{form.public_slug}"
        if form.organization is not None and getattr(form.organization, "slug", None)
        else f"/forms/{form.public_slug}"
    )
    return {
        "id": form.id,
        "title": form.title,
        "public_slug": form.public_slug,
        "public_path": public_path,
        "public_url": build_linked_form_url(
            association=form.organization,
            linked_form=form,
        ),
    }


def _get_email_template_for_admin(
    db: Session,
    *,
    admin: AdminUser,
    template_id: int,
) -> EmailTemplate:
    template = (
        db.query(EmailTemplate)
        .filter(
            EmailTemplate.id == template_id,
            or_(
                EmailTemplate.is_system.is_(True),
                EmailTemplate.association_id == admin.org_id,
            ),
            EmailTemplate.channel == EMAIL_TEMPLATE_CHANNEL,
        )
        .first()
    )
    if template is None:
        raise HTTPException(status_code=404, detail="Template non trovato.")
    return template


def _normalize_template_name(value: str | None) -> str:
    normalized = _normalize_optional_text(value)
    if normalized is None:
        raise HTTPException(status_code=422, detail="Nome template obbligatorio.")
    return normalized


def _normalize_template_subject(value: str | None) -> str:
    normalized = _normalize_optional_text(value)
    if normalized is None:
        raise HTTPException(status_code=422, detail="Oggetto template obbligatorio.")
    return normalized


def _resolve_optional_linked_form_for_admin(
    db: Session,
    *,
    admin: AdminUser,
    form_id: int | None,
) -> AssociationForm | None:
    if form_id in (None, 0):
        return None
    form = (
        db.query(AssociationForm)
        .options(joinedload(AssociationForm.organization))
        .filter(
            AssociationForm.id == int(form_id),
            AssociationForm.association_id == admin.org_id,
        )
        .first()
    )
    if form is None:
        raise HTTPException(status_code=422, detail="Form collegato non trovato.")
    return form


def _resolve_optional_source_template_for_admin(
    db: Session,
    *,
    admin: AdminUser,
    template_id: int | None,
) -> EmailTemplate | None:
    if template_id in (None, 0):
        return None
    return _get_email_template_for_admin(db, admin=admin, template_id=int(template_id))


def _resolve_frontend_base(request: Request) -> str:
    configured = (settings.FRONTEND_URL or "").strip().rstrip("/")
    if configured:
        return configured
    return str(request.base_url).rstrip("/")


def _draw_referral_reward() -> dict[str, str]:
    total_weight = sum(int(item.get("weight", 0)) for item in REFERRAL_REWARD_OPTIONS)
    if total_weight <= 0:
        return {
            "code": "discount_10_next_year",
            "title": "10% di sconto sulla prossima affiliazione annuale",
            "description": "Sconto economico applicato al rinnovo dell'anno successivo.",
            "delivery_timing": "Applicazione automatica sulla prossima fattura annuale.",
        }

    draw = random.randint(1, total_weight)
    cumulative = 0
    for option in REFERRAL_REWARD_OPTIONS:
        cumulative += int(option.get("weight", 0))
        if draw <= cumulative:
            return {
                "code": str(option["code"]),
                "title": str(option["title"]),
                "description": str(option["description"]),
                "delivery_timing": str(option["delivery_timing"]),
            }

    last = REFERRAL_REWARD_OPTIONS[-1]
    return {
        "code": str(last["code"]),
        "title": str(last["title"]),
        "description": str(last["description"]),
        "delivery_timing": str(last["delivery_timing"]),
    }


def _derive_referral_invite_status(referral: Referral) -> str:
    application = referral.application
    app_status = (application.status or "").strip().lower() if application else ""

    if app_status == AffiliationApplicationStatus.APPROVED.value:
        return "approved"
    if app_status == AffiliationApplicationStatus.REJECTED.value:
        return "rejected"
    if app_status in {
        AffiliationApplicationStatus.UNDER_REVIEW.value,
        AffiliationApplicationStatus.CHANGES_REQUESTED.value,
    }:
        if application and application.submitted_at and application.reviewed_at is None:
            return "completed_by_association"
        return "under_review"
    if application and application.submitted_at is not None:
        return "completed_by_association"
    return "invited"


def _is_referral_wheel_enabled(referral: Referral) -> bool:
    return (
        _derive_referral_invite_status(referral) == "approved"
        and (referral.status or "").strip().lower() == ReferralStatus.APPROVED.value
    )


def _serialize_org_admin_referral(referral: Referral) -> dict[str, object]:
    application = referral.application
    raw_wheel_result = referral.wheel_result
    wheel_result: dict[str, str] | None
    if isinstance(raw_wheel_result, dict):
        wheel_result = {
            "code": str(raw_wheel_result.get("code") or "") or None,
            "title": str(raw_wheel_result.get("title") or "") or None,
            "description": str(raw_wheel_result.get("description") or "") or None,
            "delivery_timing": str(raw_wheel_result.get("delivery_timing") or "") or None,
        }
    elif isinstance(raw_wheel_result, str):
        parsed = None
        try:
            parsed = json.loads(raw_wheel_result)
        except Exception:
            parsed = None
        if isinstance(parsed, dict):
            wheel_result = {
                "code": str(parsed.get("code") or "") or None,
                "title": str(parsed.get("title") or "") or None,
                "description": str(parsed.get("description") or "") or None,
                "delivery_timing": str(parsed.get("delivery_timing") or "") or None,
            }
        else:
            wheel_result = None
    else:
        wheel_result = None

    if wheel_result is None and referral.reward_title:
        wheel_result = {
            "code": referral.reward_code,
            "title": referral.reward_title,
            "description": referral.reward_description,
            "delivery_timing": referral.reward_delivery_timing,
        }

    wheel_spun_at = referral.wheel_spun_at or referral.rewarded_at
    invite_status = _derive_referral_invite_status(referral)

    return {
        "id": referral.id,
        "application_id": referral.application_id,
        "status": referral.status,
        "invite_status": invite_status,
        "wheel_enabled": _is_referral_wheel_enabled(referral),
        "created_at": referral.created_at.isoformat() if referral.created_at else None,
        "approved_at": referral.approved_at.isoformat() if referral.approved_at else None,
        "rewarded_at": referral.rewarded_at.isoformat() if referral.rewarded_at else None,
        "wheel_spun_at": wheel_spun_at.isoformat() if wheel_spun_at else None,
        "wheel_spun_by_org_admin_id": referral.wheel_spun_by_org_admin_id,
        "organization_name": (application.organization_name if application else None) or "-",
        "applicant_email": application.applicant_email if application else None,
        "reward_code": referral.reward_code,
        "reward_title": referral.reward_title,
        "reward_description": referral.reward_description,
        "reward_delivery_timing": referral.reward_delivery_timing,
        "wheel_result": wheel_result,
    }


def _compute_org_card_stock(
    db: Session, org_id: int, now: datetime | None = None
) -> dict[str, int]:
    return compute_org_card_stock(db, org_id, now=now)


def _batch_enabled_flag(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value != 0
    return bool(value)


def _org_admin_batch_status_label(batch: CardBatch) -> str:
    next_no = batch.next_no if batch.next_no is not None else batch.start_no
    if batch.released_at is not None:
        return "Rilasciato"
    if not _batch_enabled_flag(batch.is_enabled):
        return "Disattivo"
    if next_no > batch.end_no:
        return "Esaurito"
    return "Attivo"


def _serialize_org_admin_card_lot(batch: CardBatch) -> dict[str, object]:
    return {
        "id": batch.id,
        "created_at": batch.created_at.isoformat() if batch.created_at else None,
        "year": batch.year,
        "range_start": batch.start_no,
        "range_end": batch.end_no,
        "range_start_label": format_card_number(batch.start_no),
        "range_end_label": format_card_number(batch.end_no),
        "quantity": int(batch.end_no - batch.start_no + 1),
        "status_label": _org_admin_batch_status_label(batch),
    }


def _normalize_member_payment_method(
    raw_value: Optional[str], required: bool = False
) -> Optional[str]:
    if raw_value is None:
        if required:
            raise HTTPException(
                status_code=400,
                detail="Modalita di pagamento obbligatoria. Seleziona CASH o BONIFICO.",
            )
        return None

    normalized = raw_value.strip().upper()
    if normalized == "":
        if required:
            raise HTTPException(
                status_code=400,
                detail="Modalita di pagamento obbligatoria. Seleziona CASH o BONIFICO.",
            )
        return None

    if normalized not in _ALLOWED_MEMBER_PAYMENT_METHODS:
        raise HTTPException(
            status_code=400,
            detail="Modalita di pagamento non valida. Valori ammessi: CASH, BONIFICO.",
        )
    return normalized


def _serialize_member_payment_method(value: Optional[object]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, PaymentMethod):
        return value.value
    text = str(value).strip()
    if text == "":
        return None
    upper = text.upper()
    return upper if upper in _ALLOWED_MEMBER_PAYMENT_METHODS else text


def _get_last_access_email_token(db: Session, member_id: int) -> Optional[Token]:
    return (
        db.query(Token)
        .filter(
            Token.member_id == member_id,
            Token.purpose == TokenType.LOGIN_MAGIC_LINK,
        )
        .order_by(Token.created_at.desc())
        .first()
    )


def _document_status_from_statuses(statuses: list[Optional[str]]) -> str:
    normalized = [s for s in statuses if s]
    if not normalized:
        return "not_provided"
    if DocStatus.REJECTED.value in normalized:
        return DocStatus.REJECTED.value
    if any(
        s in {DocStatus.PENDING.value, DocStatus.UPLOADED.value} for s in normalized
    ):
        return DocStatus.PENDING.value
    if all(s == DocStatus.APPROVED.value for s in normalized):
        return DocStatus.APPROVED.value
    return DocStatus.PENDING.value


def _send_member_magic_link(
    db: Session,
    request: Request,
    member: Member,
) -> tuple[str, datetime]:
    if not is_member_active(member, now=datetime.utcnow()):
        raise HTTPException(status_code=403, detail="account non attivo")

    token_str = generate_token()
    token = Token(
        member_id=member.id,
        purpose=TokenType.LOGIN_MAGIC_LINK,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow()
        + timedelta(minutes=settings.LOGIN_TOKEN_EXPIRE_MINUTES),
    )
    db.add(token)
    db.flush()

    frontend_base = settings.FRONTEND_URL.rstrip("/")
    if not frontend_base:
        frontend_base = str(request.base_url).rstrip("/")

    link = f"{frontend_base}/auth/verify?token={token_str}&role=member"
    logger.info("Generated member magic link: %s", link.replace(token_str, "***"))

    outbox_id = enqueue_email(
        db,
        email_type="member_magic_link",
        to_email=member.email,
        subject="Accesso Area Riservata - ASSO.N.A.M.",
        payload=build_email_payload(
            text_body=(
                "Sei stato registrato come socio. "
                f"Clicca qui per accedere alla tua area riservata: {link}\n\n"
                f"Il link scade tra {settings.LOGIN_TOKEN_EXPIRE_MINUTES} minuti."
            ),
            sender=build_sender_payload(
                mode="association",
                association=member.organization,
            ),
            meta={
                "member_id": member.id,
                "token_purpose": TokenType.LOGIN_MAGIC_LINK.value,
            },
        ),
        priority=1,
    )
    return outbox_id, token.created_at or datetime.utcnow()


class CreateMemberBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    first_name: str = Field(..., min_length=1)
    last_name: str = Field(..., min_length=1)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    fiscal_code: Optional[str] = None
    payment_method: Optional[str] = None
    joined_at: Optional[date] = None
    member_type: Optional[str] = None
    membership_type: Optional[Literal["annual", "temporary"]] = None
    membership_fee_snapshot: Optional[float] = Field(default=None, gt=0)
    internal_notes: Optional[str] = None
    is_manual: bool = True
    send_access_email: bool = False


class UpdateMemberProfileBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    first_name: str = Field(..., min_length=1)
    last_name: str = Field(..., min_length=1)
    email: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[date] = None
    birth_place: Optional[str] = None
    birth_place_code: Optional[str] = None
    fiscal_code: Optional[str] = None
    membership_type: Optional[Literal["annual", "temporary"]] = None
    membership_fee_snapshot: Optional[float] = Field(default=None, gt=0)
    internal_notes: Optional[str] = None


def _get_org_admin_member_or_404(
    *,
    db: Session,
    admin: AdminUser,
    member_id: int,
    include_deleted: bool = True,
) -> Member:
    query = db.query(Member).options(joinedload(Member.organization)).filter(
        Member.id == member_id,
        Member.org_id == admin.org_id,
    )
    if not include_deleted:
        query = query.filter(Member.deleted_at.is_(None))
    member = query.first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    return member


def _build_org_member_detail_payload(
    *,
    db: Session,
    admin: AdminUser,
    member: Member,
    request: Request,
) -> dict:
    current_time = datetime.utcnow()
    last_token = _get_last_access_email_token(db, member.id)
    last_access_email_at = (
        last_token.created_at.isoformat()
        if last_token and last_token.created_at
        else None
    )
    payments = (
        db.query(MemberPayment)
        .filter(MemberPayment.member_id == member.id)
        .order_by(MemberPayment.paid_at.desc(), MemberPayment.id.desc())
        .limit(5)
        .all()
    )
    membership_payments = (
        db.query(MembershipPayment)
        .filter(MembershipPayment.socio_id == member.id)
        .order_by(MembershipPayment.created_at.desc(), MembershipPayment.id.desc())
        .limit(10)
        .all()
    )
    doc_ids_sub = select(MemberDocument.id).where(MemberDocument.member_id == member.id)
    payment_ids_sub = select(MemberPayment.id).where(
        MemberPayment.member_id == member.id
    )
    membership_payment_ids_sub = select(MembershipPayment.id).where(
        MembershipPayment.socio_id == member.id
    )

    activities = (
        db.query(OperationLog)
        .filter(
            or_(
                and_(
                    OperationLog.entity_type == "member",
                    OperationLog.entity_id == member.id,
                ),
                and_(
                    OperationLog.entity_type == "member_document",
                    OperationLog.entity_id.in_(doc_ids_sub),
                ),
                and_(
                    OperationLog.entity_type == "member_payment",
                    OperationLog.entity_id.in_(payment_ids_sub),
                ),
                and_(
                    OperationLog.entity_type == "membership_payment",
                    OperationLog.entity_id.in_(membership_payment_ids_sub),
                ),
            )
        )
        .order_by(OperationLog.created_at.desc())
        .limit(20)
        .all()
    )
    admin_ids = {a.actor_admin_id for a in activities if a.actor_admin_id}
    admin_emails = {}
    if admin_ids:
        admin_rows = (
            db.query(AdminUser.id, AdminUser.email)
            .filter(
                AdminUser.id.in_(admin_ids),
                or_(
                    AdminUser.org_id == admin.org_id,
                    AdminUser.role == AdminRole.SUPER_ADMIN,
                ),
            )
            .all()
        )
        admin_emails = {row[0]: row[1] for row in admin_rows}
    document_status = _document_status_from_statuses(
        [d.status for d in member.documents]
    )

    card_token = None
    card_verification_url = None
    if member.card_no is not None and member.card_year is not None:
        card_token = build_card_verification_token(
            member_id=member.id,
            org_id=member.org_id,
            card_number=member.card_no,
            card_year=member.card_year,
        )
        backend_base = (settings.BASE_URL or "").strip().rstrip("/") or str(request.base_url).rstrip("/")
        card_verification_url = f"{backend_base}/api/cards/verify/{card_token}"

    return {
        "id": member.id,
        "first_name": member.first_name,
        "last_name": member.last_name,
        "email": member.email,
        "phone": member.phone,
        "birth_date": member.birth_date.isoformat() if member.birth_date else None,
        "birth_place": member.birth_place,
        "birth_place_code": member.birth_place_code,
        "fiscal_code": member.fiscal_code,
        "payment_method": _serialize_member_payment_method(member.payment_method),
        "payment_required": bool(member.payment_required),
        "payment_status": member.payment_status,
        "payment_completed_at": member.payment_completed_at.isoformat()
        if member.payment_completed_at
        else None,
        "card_is_paid": bool(member.card_is_paid),
        "card_paid_at": member.card_paid_at.isoformat() if member.card_paid_at else None,
        "card_payment_status": member.card_payment_status,
        "status": get_member_lifecycle_status(member, now=current_time),
        "workflow_status": member.status.value if member.status else None,
        "is_active": is_member_active(member, now=current_time),
        "deleted_at": member.deleted_at.isoformat() if member.deleted_at else None,
        "card_no": member.card_no,
        "card_number": member.card_no,
        "card_year": member.card_year,
        "membership_type": resolve_member_membership_type(member),
        "membership_type_label": membership_type_label(
            resolve_member_membership_type(member)
        ),
        "valid_from": (
            resolve_member_valid_from(member).isoformat()
            if resolve_member_valid_from(member)
            else None
        ),
        "valid_until": (
            resolve_member_valid_until(member).isoformat()
            if resolve_member_valid_until(member)
            else None
        ),
        "membership_fee_snapshot": membership_amount_to_float(
            getattr(member, "membership_fee_snapshot", None)
        ),
        "card_token": card_token,
        "card_verification_url": card_verification_url,
        "joined_at": member.joined_at.isoformat() if member.joined_at else None,
        "member_type": member.member_type,
        "internal_notes": member.internal_notes,
        "is_manual": member.is_manual,
        "has_access": bool(member.password_hash),
        "last_access_email_at": last_access_email_at,
        "document_status": document_status,
        "documents": [
            {
                "id": d.id,
                "type": d.doc_type,
                "filename": d.original_filename,
                "mime_type": d.mime_type,
                "size_bytes": d.size_bytes,
                "rel_path": d.rel_path,
                "download_url": f"/api/org-admin/members/{member.id}/documents/{d.id}",
                "uploaded_at": d.uploaded_at.isoformat(),
                "status": d.status,
                "review_notes": d.review_notes,
                "rejection_note": d.rejection_note,
                "reviewed_at": d.reviewed_at.isoformat() if d.reviewed_at else None,
                "reviewed_by_admin_id": d.reviewed_by_admin_id or d.reviewed_by,
                "replaces_document_id": d.replaces_document_id,
            }
            for d in member.documents
        ],
        "payments": [
            {
                "id": p.id,
                "amount_cents": p.amount_cents,
                "amount": round(p.amount_cents / 100, 2),
                "method": p.method,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
                "notes": p.notes,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in payments
        ],
        "membership_payments": [
            {
                "id": p.id,
                "provider": p.provider,
                "source": p.source,
                "status": p.status,
                "payment_reason": p.payment_reason,
                "amount": float(p.amount) if p.amount is not None else None,
                "currency": p.currency,
                "checkout_reference": p.checkout_reference,
                "sumup_checkout_id": p.sumup_checkout_id,
                "hosted_checkout_url": p.hosted_checkout_url,
                "confirmed_at": p.confirmed_at.isoformat() if p.confirmed_at else None,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
                "notes": p.notes,
            }
            for p in membership_payments
        ],
        "activities": [
            {
                "id": a.id,
                "action": a.action,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "actor_admin_id": a.actor_admin_id,
                "actor_admin_email": admin_emails.get(a.actor_admin_id)
                if a.actor_admin_id
                else None,
                "actor_member_id": a.actor_member_id,
                "actor_member_name": f"{member.first_name} {member.last_name}"
                if a.actor_member_id == member.id
                else None,
                "actor_role": a.actor_role,
                "entity_type": a.entity_type,
                "entity_id": a.entity_id,
                "metadata": a.metadata_json,
            }
            for a in activities
        ],
    }


@auth_router.post("/magic-link")
def request_magic_link(
    request: Request,
    email: str = Form(...),
    db: Session = Depends(get_db),
):
    """
    Send a magic-link email to an active org admin.
    Always returns 200 to prevent email enumeration.
    """
    auth_limiter.check(get_client_ip(request))
    client_ip = get_client_ip(request)
    normalized_email = _normalize_login_email(email)
    email_hash = _hash_email_for_log(normalized_email)
    normalization_changed = (email or "") != normalized_email
    logger.info(
        "org_admin_magic_link_request_received email_hash=%s normalized=%s normalization_changed=%s ip=%s",
        email_hash,
        bool(normalized_email),
        normalization_changed,
        client_ip,
    )

    admin, resolution, candidates = _resolve_org_admin_magic_link_candidate(
        db, normalized_email
    )
    logger.info(
        "org_admin_magic_link_lookup_result email_hash=%s resolution=%s candidate_count=%s matched_admin_ids=%s",
        email_hash,
        resolution,
        len(candidates),
        [candidate.id for candidate in candidates],
    )

    if admin is None:
        logger.warning(
            "org_admin_magic_link_blocked email_hash=%s block_reason=%s candidate_states=%s",
            email_hash,
            resolution,
            [
                {
                    "id": candidate.id,
                    "org_id": candidate.org_id,
                    "is_active": bool(candidate.is_active),
                    "deleted": candidate.deleted_at is not None,
                }
                for candidate in candidates
            ],
        )
        audit.org_admin_magic_link_requested(email=normalized_email, ip=client_ip)
        return {"ok": True}

    logger.info(
        "org_admin_magic_link_admin_selected email_hash=%s admin_id=%s org_id=%s is_active=%s",
        email_hash,
        admin.id,
        admin.org_id,
        bool(admin.is_active),
    )

    try:
        token_str = generate_token()
        token = OrgAdminToken(
            admin_id=admin.id,
            token_hash=hash_token(token_str),
            expires_at=datetime.utcnow()
            + timedelta(minutes=settings.LOGIN_TOKEN_EXPIRE_MINUTES),
        )
        db.add(token)
        db.flush()
        logger.info(
            "org_admin_magic_link_token_created email_hash=%s admin_id=%s token_id=%s expires_at=%s",
            email_hash,
            admin.id,
            token.id,
            token.expires_at.isoformat() if token.expires_at else None,
        )

        frontend_base = settings.FRONTEND_URL.rstrip("/")
        if not frontend_base:
            frontend_base = str(request.base_url).rstrip("/")

        link = f"{frontend_base}/auth/verify?token={token_str}&role=org_admin"
        logger.info(
            "Generated org-admin magic link: %s", link.replace(token_str, "***")
        )

        logger.info(
            "org_admin_magic_link_send_enqueuing email_hash=%s admin_id=%s normalized_to_email=%s",
            email_hash,
            admin.id,
            normalized_email,
        )
        outbox_id = enqueue_email(
            db,
            email_type="org_admin_magic_link",
            to_email=normalized_email,
            subject="Accesso area amministrazione associazione",
            payload=build_email_payload(
                text_body=f"Clicca qui per accedere: {link}",
                meta={
                    "admin_id": admin.id,
                    "token_purpose": "org_admin_magic_link",
                },
            ),
            priority=1,
        )
        logger.info(
            "org_admin_magic_link_send_enqueued email_hash=%s admin_id=%s outbox_id=%s",
            email_hash,
            admin.id,
            outbox_id,
        )
        db.commit()
        logger.info(
            "org_admin_magic_link_request_completed email_hash=%s admin_id=%s outbox_id=%s",
            email_hash,
            admin.id,
            outbox_id,
        )
    except Exception:
        db.rollback()
        logger.exception(
            "org_admin_magic_link_request_failed email_hash=%s admin_id=%s resolution=%s",
            email_hash,
            admin.id,
            resolution,
        )
        raise

    audit.org_admin_magic_link_requested(email=normalized_email, ip=client_ip)
    return {"ok": True}


@auth_router.get("/verify")
def verify_magic_link(
    request: Request,
    token: str,
    db: Session = Depends(get_db),
):
    """Verify a magic-link token and create an org-admin session."""
    auth_limiter.check(get_client_ip(request))
    client_ip = get_client_ip(request)
    token_hash = hash_token(token)
    token_hash_prefix = token_hash[:12]
    logger.info(
        "org_admin_magic_link_verify_received token_hash_prefix=%s ip=%s",
        token_hash_prefix,
        client_ip,
    )
    token_entry = (
        db.query(OrgAdminToken)
        .filter(
            OrgAdminToken.token_hash == token_hash,
            OrgAdminToken.expires_at > datetime.utcnow(),
            OrgAdminToken.used_at.is_(None),
        )
        .first()
    )

    if not token_entry:
        logger.warning(
            "org_admin_magic_link_verify_blocked token_hash_prefix=%s block_reason=token_not_found_or_expired",
            token_hash_prefix,
        )
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    admin = (
        db.query(AdminUser)
        .filter(
            AdminUser.id == token_entry.admin_id,
            AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None),  # Added deleted_at filter
        )
        .first()
    )

    if not admin:
        logger.warning(
            "org_admin_magic_link_verify_blocked token_hash_prefix=%s admin_id=%s block_reason=admin_not_eligible",
            token_hash_prefix,
            token_entry.admin_id,
        )
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    # Mark token as used (one-time)
    token_entry.used_at = datetime.utcnow()
    db.commit()
    logger.info(
        "org_admin_magic_link_verify_token_consumed token_hash_prefix=%s admin_id=%s used_at=%s",
        token_hash_prefix,
        admin.id,
        token_entry.used_at.isoformat() if token_entry.used_at else None,
    )

    # Create session
    request.session["org_admin_id"] = admin.id
    audit.org_admin_verified(
        admin_id=admin.id, org_id=admin.org_id, ip=client_ip
    )
    logger.info(
        "org_admin_magic_link_verify_completed token_hash_prefix=%s admin_id=%s org_id=%s redirect_to=%s",
        token_hash_prefix,
        admin.id,
        admin.org_id,
        "/org-admin",
    )

    from fastapi.responses import RedirectResponse

    return RedirectResponse(url="/org-admin", status_code=302)


@auth_router.post("/logout")
def logout(request: Request):
    """Clear the org-admin session."""
    request.session.pop("org_admin_id", None)
    return {"ok": True}


@auth_router.get("/me")
def me(request: Request, db: Session = Depends(get_db)):
    """Return the authenticated org admin profile."""
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return {
        "id": admin.id,
        "email": admin.email,
        "org_id": admin.org_id,
        "role": AdminRole.ORG_ADMIN.value,
        "organization": {
            "id": admin.organization.id,
            "name": admin.organization.name,
            "slug": admin.organization.slug,
            "accounting_enabled": bool(admin.organization.accounting_enabled),
        }
        if admin.organization
        else None,
    }


router.include_router(auth_router)


@router.get("/notifications")
def list_org_admin_notifications(
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    items = (
        db.query(OrgAdminNotification)
        .filter(OrgAdminNotification.admin_user_id == admin.id)
        .order_by(
            OrgAdminNotification.created_at.desc(),
            OrgAdminNotification.id.desc(),
        )
        .limit(limit)
        .all()
    )
    unread_count = (
        db.query(func.count(OrgAdminNotification.id))
        .filter(
            OrgAdminNotification.admin_user_id == admin.id,
            OrgAdminNotification.is_read.is_(False),
        )
        .scalar()
        or 0
    )
    return {
        "items": [_serialize_org_admin_notification(item) for item in items],
        "unread_count": int(unread_count),
    }


@router.get("/notifications/unread-count")
def get_org_admin_notifications_unread_count(
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    unread_count = (
        db.query(func.count(OrgAdminNotification.id))
        .filter(
            OrgAdminNotification.admin_user_id == admin.id,
            OrgAdminNotification.is_read.is_(False),
        )
        .scalar()
        or 0
    )
    return {"unread_count": int(unread_count)}


@router.post("/notifications/{notification_id}/read")
def mark_org_admin_notification_read(
    request: Request,
    notification_id: int,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    notification = (
        db.query(OrgAdminNotification)
        .filter(
            OrgAdminNotification.id == notification_id,
            OrgAdminNotification.admin_user_id == admin.id,
        )
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notifica non trovata.")

    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.utcnow()
        db.add(notification)
        db.commit()

    return {"ok": True, "notification": _serialize_org_admin_notification(notification)}


@router.post("/notifications/read-all")
def mark_all_org_admin_notifications_read(
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    now = datetime.utcnow()
    updated = (
        db.query(OrgAdminNotification)
        .filter(
            OrgAdminNotification.admin_user_id == admin.id,
            OrgAdminNotification.is_read.is_(False),
        )
        .update(
            {
                OrgAdminNotification.is_read: True,
                OrgAdminNotification.read_at: now,
            },
            synchronize_session=False,
        )
    )
    db.commit()
    return {"ok": True, "updated": int(updated or 0)}


class PatchOrgOrganization(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    wallet_bg_color: Optional[str] = None
    wallet_title_override: Optional[str] = None
    wallet_is_test_prefix: Optional[bool] = None


class PatchOrgMembershipSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    membership_fee_amount: Optional[float] = Field(default=None, gt=0)
    temporary_membership_fee_amount: Optional[float] = Field(default=None, gt=0)
    membership_fee_currency: Optional[str] = Field(default=None, min_length=1, max_length=8)
    temporary_membership_duration_value: Optional[int] = Field(default=None, ge=1, le=8760)
    temporary_membership_duration_unit: Optional[Literal["hours", "days"]] = None


class PutOrgCommunicationSettings(BaseModel):
    sender_email_local_part: Optional[str] = None
    email_from_name_override: Optional[str] = None
    reply_to_email: Optional[str] = None


class SendOrgCommunicationTestEmailBody(BaseModel):
    to_email: EmailStr


class CreateEmailCampaignBody(BaseModel):
    name: Optional[str] = Field(default=None, max_length=160)
    subject: str = Field(min_length=1, max_length=255)
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    compiled_html: Optional[str] = None
    mjml_source: Optional[str] = None
    grapesjs_project_json: Optional[dict[str, object]] = None
    audience_type: str
    recipient_mode: str = Field(default=RECIPIENT_MODE_ALL_MEMBERS, max_length=40)
    member_ids: list[int] = Field(default_factory=list)
    scheduled_at: Optional[datetime] = None
    design: Optional[dict[str, object]] = None
    linked_form_id: Optional[int] = None
    source_template_id: Optional[int] = None
    editor_status: Optional[str] = Field(default=None, max_length=40)


class CreateEmailTemplateBody(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    category: Optional[str] = Field(default=None, max_length=80)
    template_type: Optional[str] = Field(default=None, max_length=80)
    subject: str = Field(min_length=1, max_length=255)
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    compiled_html: Optional[str] = None
    mjml_source: Optional[str] = None
    grapesjs_project_json: Optional[dict[str, object]] = None
    channel: str = Field(default=EMAIL_TEMPLATE_CHANNEL, max_length=40)
    editor_status: Optional[str] = Field(default=None, max_length=40)
    design: Optional[dict[str, object]] = None
    linked_form_id: Optional[int] = None


class UpdateEmailTemplateBody(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    category: Optional[str] = Field(default=None, max_length=80)
    template_type: Optional[str] = Field(default=None, max_length=80)
    subject: str = Field(min_length=1, max_length=255)
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    compiled_html: Optional[str] = None
    mjml_source: Optional[str] = None
    grapesjs_project_json: Optional[dict[str, object]] = None
    channel: str = Field(default=EMAIL_TEMPLATE_CHANNEL, max_length=40)
    is_active: Optional[bool] = None
    editor_status: Optional[str] = Field(default=None, max_length=40)
    design: Optional[dict[str, object]] = None
    linked_form_id: Optional[int] = None


class DuplicateEmailTemplateBody(BaseModel):
    name: Optional[str] = Field(default=None, max_length=160)


class RenderEmailTemplatePreviewBody(BaseModel):
    template_id: Optional[int] = None
    subject: Optional[str] = None
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    compiled_html: Optional[str] = None
    mjml_source: Optional[str] = None
    grapesjs_project_json: Optional[dict[str, object]] = None
    design: Optional[dict[str, object]] = None
    linked_form_id: Optional[int] = None


class SendCommunicationBuilderTestBody(BaseModel):
    to_email: EmailStr
    subject: str = Field(min_length=1, max_length=255)
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    compiled_html: Optional[str] = None
    design: Optional[dict[str, object]] = None
    linked_form_id: Optional[int] = None
    message_name: Optional[str] = Field(default=None, max_length=160)


class CreateCampaignFromTemplateBody(BaseModel):
    template_id: int = Field(ge=1)
    name: Optional[str] = Field(default=None, max_length=160)
    subject: Optional[str] = Field(default=None, max_length=255)
    linked_form_id: Optional[int] = None
    audience_type: str
    recipient_mode: str = Field(default=RECIPIENT_MODE_ALL_MEMBERS, max_length=40)
    member_ids: list[int] = Field(default_factory=list)
    scheduled_at: Optional[datetime] = None
    design: Optional[dict[str, object]] = None


class UpsertWhatsAppAutomationBody(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    form_id: Optional[int] = Field(default=None, ge=1)
    source_type: str = Field(default="public_form", max_length=40)
    trigger_event: str = Field(default="form_submitted", max_length=40)
    recipient_type: str = Field(default="submitter", max_length=40)
    phone_source: str = Field(default="form_field", max_length=40)
    phone_field_key: Optional[str] = Field(default=None, max_length=64)
    custom_phone: Optional[str] = Field(default=None, max_length=40)
    template_name: str = Field(min_length=1, max_length=160)
    template_body: str = Field(min_length=1, max_length=4000)
    is_active: bool = True


class CreateAssociationFormBody(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: Optional[str] = None
    accent_color: Optional[str] = Field(default=None, max_length=16)
    submit_button_text: Optional[str] = Field(default=None, max_length=120)
    show_logo: bool = True
    cover_image_url: Optional[str] = None
    page_style: Optional[str] = Field(default="editorial", max_length=40)
    public_slug: Optional[str] = Field(default=None, max_length=120)
    is_active: bool = False
    visibility: str = Field(default="public", max_length=40)
    success_message: Optional[str] = None
    notification_email: Optional[EmailStr] = None
    allow_multiple_submissions: bool = True
    form_type: str = Field(default="generic", max_length=40)
    booking_enabled: bool = False
    booking_requires_manual_confirmation: bool = True
    booking_success_message_override: Optional[str] = None
    booking_notification_enabled: bool = True
    booking_auto_assign_enabled: bool = False
    booking_field_mapping: dict[str, str] = Field(default_factory=dict)
    notify_admin_on_submit: bool = True
    send_user_confirmation: bool = True
    whatsapp_auto_reply_enabled: bool = False
    whatsapp_auto_reply_template: Optional[str] = None
    whatsapp_confirmation_template: Optional[str] = None
    whatsapp_rejection_template: Optional[str] = None
    admin_notification_template_id: Optional[int] = None
    user_confirmation_template_id: Optional[int] = None
    create_internal_request: bool = False
    create_booking: bool = False


class UpdateAssociationFormBody(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: Optional[str] = None
    accent_color: Optional[str] = Field(default=None, max_length=16)
    submit_button_text: Optional[str] = Field(default=None, max_length=120)
    show_logo: bool = True
    cover_image_url: Optional[str] = None
    page_style: Optional[str] = Field(default="editorial", max_length=40)
    public_slug: Optional[str] = Field(default=None, max_length=120)
    is_active: bool = False
    visibility: str = Field(default="public", max_length=40)
    success_message: Optional[str] = None
    notification_email: Optional[EmailStr] = None
    allow_multiple_submissions: bool = True
    form_type: str = Field(default="generic", max_length=40)
    booking_enabled: bool = False
    booking_requires_manual_confirmation: bool = True
    booking_success_message_override: Optional[str] = None
    booking_notification_enabled: bool = True
    booking_auto_assign_enabled: bool = False
    booking_field_mapping: dict[str, str] = Field(default_factory=dict)
    notify_admin_on_submit: bool = True
    send_user_confirmation: bool = True
    whatsapp_auto_reply_enabled: bool = False
    whatsapp_auto_reply_template: Optional[str] = None
    whatsapp_confirmation_template: Optional[str] = None
    whatsapp_rejection_template: Optional[str] = None
    admin_notification_template_id: Optional[int] = None
    user_confirmation_template_id: Optional[int] = None
    create_internal_request: bool = False
    create_booking: bool = False


class DuplicateAssociationFormBody(BaseModel):
    title: Optional[str] = Field(default=None, max_length=160)
    public_slug: Optional[str] = Field(default=None, max_length=120)


class UpsertAssociationFormFieldBody(BaseModel):
    field_key: Optional[str] = Field(default=None, max_length=64)
    field_type: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=160)
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    is_required: bool = False
    sort_order: int = 0
    options: Optional[list[str] | str] = None


class UpdateFormSubmissionStatusBody(BaseModel):
    status: str = Field(min_length=1, max_length=40)
    reason: Optional[str] = None
    whatsapp_message: Optional[str] = None


class UpdateBookingStatusBody(BaseModel):
    status: str = Field(min_length=1, max_length=40)
    room_id: Optional[int] = None
    table_id: Optional[int] = None
    notes: Optional[str] = None


class CreateRoomBody(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    is_active: bool = True


class UpdateRoomBody(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    is_active: bool = True


class CreateRoomTableBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    capacity: int = Field(default=2, ge=1, le=100)
    shape: str = Field(default="round", min_length=1, max_length=40)
    pos_x: int = Field(default=80, ge=0, le=4000)
    pos_y: int = Field(default=80, ge=0, le=4000)
    width: Optional[int] = Field(default=None, ge=40, le=600)
    height: Optional[int] = Field(default=None, ge=40, le=600)
    is_active: bool = True
    is_out_of_service: bool = False


class UpdateRoomTableBody(BaseModel):
    room_id: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=120)
    capacity: int = Field(default=2, ge=1, le=100)
    shape: str = Field(default="round", min_length=1, max_length=40)
    pos_x: int = Field(default=80, ge=0, le=4000)
    pos_y: int = Field(default=80, ge=0, le=4000)
    width: Optional[int] = Field(default=None, ge=40, le=600)
    height: Optional[int] = Field(default=None, ge=40, le=600)
    is_active: bool = True
    is_out_of_service: bool = False


class SaveRoomMapBody(BaseModel):
    positions: list[dict[str, int | None]] = Field(default_factory=list)


class AssignBookingTableBody(BaseModel):
    room_id: Optional[int] = None
    table_id: Optional[int] = None


@router.get("/organization")
def get_organization_detail(
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    org = admin.organization
    return _serialize_org_admin_organization(request, org)


@router.get("/organization/membership-settings")
def get_org_membership_settings(
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return _serialize_org_membership_settings(admin.organization)


@router.patch("/organization/membership-settings")
def patch_org_membership_settings(
    request: Request,
    body: PatchOrgMembershipSettings,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    org = admin.organization
    updates = body.model_dump(exclude_unset=True)
    changed_fields: dict[str, object] = {}

    if "membership_fee_amount" in updates:
        org.membership_fee_amount = quantize_membership_amount(updates["membership_fee_amount"])
        changed_fields["membership_fee_amount"] = membership_amount_to_float(org.membership_fee_amount)

    if "membership_fee_currency" in updates:
        currency = str(updates["membership_fee_currency"] or "").strip().upper()
        if not currency:
            raise HTTPException(status_code=422, detail="Valuta quota obbligatoria.")
        org.membership_fee_currency = currency
        changed_fields["membership_fee_currency"] = currency

    if organization_allows_custom_membership_types(org):
        if "temporary_membership_fee_amount" in updates:
            org.temporary_membership_fee_amount = quantize_membership_amount(
                updates["temporary_membership_fee_amount"]
            )
            changed_fields["temporary_membership_fee_amount"] = membership_amount_to_float(
                org.temporary_membership_fee_amount
            )
        if "temporary_membership_duration_value" in updates:
            org.temporary_membership_duration_value = int(updates["temporary_membership_duration_value"])
            changed_fields["temporary_membership_duration_value"] = org.temporary_membership_duration_value
        if "temporary_membership_duration_unit" in updates:
            org.temporary_membership_duration_unit = normalize_temporary_duration_unit(
                updates["temporary_membership_duration_unit"]
            )
            changed_fields["temporary_membership_duration_unit"] = org.temporary_membership_duration_unit

    db.add(org)
    db.commit()
    db.refresh(org)

    audit.log_operation(
        db,
        action="org.membership_settings.update",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="org_admin",
        metadata=changed_fields,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return {"ok": True, "settings": _serialize_org_membership_settings(org)}


@router.get("/shared-documents")
def list_org_shared_documents(
    request: Request,
    kind: str = Query(default="general"),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    normalized_kind = (kind or "").strip().lower()
    if normalized_kind not in _ORG_SHARED_DOCUMENT_KINDS:
        raise HTTPException(status_code=422, detail="Tipo documento non valido.")
    if normalized_kind == "accounting" and not bool(admin.organization.accounting_enabled):
        raise HTTPException(status_code=403, detail="Contabilita non abilitata.")

    documents = (
        db.query(OrganizationSharedDocument)
        .join(
            OrganizationSharedDocumentAssignment,
            OrganizationSharedDocumentAssignment.document_id == OrganizationSharedDocument.id,
        )
        .filter(
            OrganizationSharedDocumentAssignment.association_id == admin.org_id,
            OrganizationSharedDocument.kind == normalized_kind,
        )
        .order_by(
            OrganizationSharedDocument.created_at.desc(),
            OrganizationSharedDocument.id.desc(),
        )
        .all()
    )
    return {
        "items": [_serialize_org_shared_document(document) for document in documents],
        "total": len(documents),
    }


@router.get("/shared-documents/{document_id}/download")
def download_org_shared_document(
    request: Request,
    document_id: int,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    assignment = (
        db.query(OrganizationSharedDocumentAssignment)
        .join(
            OrganizationSharedDocument,
            OrganizationSharedDocument.id == OrganizationSharedDocumentAssignment.document_id,
        )
        .filter(
            OrganizationSharedDocumentAssignment.document_id == document_id,
            OrganizationSharedDocumentAssignment.association_id == admin.org_id,
        )
        .first()
    )
    if not assignment or not assignment.document:
        raise HTTPException(status_code=404, detail="Documento non trovato.")

    document = assignment.document
    if document.kind == "accounting" and not bool(admin.organization.accounting_enabled):
        raise HTTPException(status_code=403, detail="Contabilita non abilitata.")

    full_path = os.path.join(settings.UPLOAD_DIR, document.rel_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File non trovato su disco.")

    return FileResponse(
        full_path,
        filename=document.original_filename,
        media_type=document.mime_type or "application/octet-stream",
        content_disposition_type="attachment",
    )


@router.get("/accounting/archive")
def get_org_admin_accounting_archive(
    request: Request,
    q: Optional[str] = Query(default=None),
    folder_id: Optional[int] = Query(default=None),
    category_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not bool(admin.organization.accounting_enabled):
        raise HTTPException(status_code=403, detail="Contabilita non abilitata.")

    ensure_accounting_seed_data(db)

    folder_query = (
        db.query(AccountingFolder)
        .filter(AccountingFolder.org_id.is_(None), AccountingFolder.is_active.is_(True))
        .order_by(
            AccountingFolder.sort_order.asc(),
            AccountingFolder.year.is_(None).asc(),
            AccountingFolder.year.desc(),
            AccountingFolder.name.asc(),
            AccountingFolder.id.asc(),
        )
    )
    category_query = (
        db.query(AccountingCategory)
        .filter(
            AccountingCategory.org_id.is_(None),
            AccountingCategory.is_active.is_(True),
        )
        .order_by(
            AccountingCategory.sort_order.asc(),
            AccountingCategory.name.asc(),
            AccountingCategory.id.asc(),
        )
    )
    folders = folder_query.all()
    categories = category_query.all()

    document_query = (
        db.query(AccountingDocument)
        .options(
            joinedload(AccountingDocument.folder),
            joinedload(AccountingDocument.category),
            joinedload(AccountingDocument.share_links),
        )
        .join(AccountingFolder, AccountingFolder.id == AccountingDocument.folder_id)
        .join(AccountingCategory, AccountingCategory.id == AccountingDocument.category_id)
        .filter(
            AccountingDocument.org_id == admin.org_id,
            AccountingFolder.is_active.is_(True),
            AccountingCategory.is_active.is_(True),
        )
    )
    normalized_q = _normalize_optional_text(q)
    if normalized_q:
        pattern = f"%{normalized_q}%"
        document_query = document_query.filter(
            or_(
                AccountingDocument.title.ilike(pattern),
                AccountingDocument.description.ilike(pattern),
                AccountingDocument.original_filename.ilike(pattern),
            )
        )
    if folder_id is not None:
        document_query = document_query.filter(AccountingDocument.folder_id == folder_id)
    if category_id is not None:
        document_query = document_query.filter(
            AccountingDocument.category_id == category_id
        )

    documents = (
        document_query.order_by(
            AccountingFolder.sort_order.asc(),
            AccountingCategory.sort_order.asc(),
            AccountingDocument.created_at.desc(),
            AccountingDocument.id.desc(),
        ).all()
    )

    grouped: dict[int, dict[str, object]] = {}
    for document in documents:
        if document.folder is None or document.category is None:
            continue
        folder_bucket = grouped.setdefault(
            document.folder.id,
            {
                "id": document.folder.id,
                "name": document.folder.name,
                "slug": document.folder.slug,
                "year": document.folder.year,
                "sort_order": document.folder.sort_order,
                "categories_map": {},
            },
        )
        categories_map = folder_bucket["categories_map"]
        category_bucket = categories_map.setdefault(
            document.category.id,
            {
                "id": document.category.id,
                "code": document.category.code,
                "name": document.category.name,
                "is_system": bool(document.category.is_system),
                "sort_order": document.category.sort_order,
                "documents": [],
            },
        )
        category_bucket["documents"].append(
            _serialize_org_admin_accounting_document(request, document)
        )

    folder_items = []
    for folder in folders:
        bucket = grouped.get(folder.id)
        if bucket is None:
            continue
        categories_map = bucket.pop("categories_map")
        category_items = sorted(
            categories_map.values(),
            key=lambda item: (item["sort_order"], item["name"], item["id"]),
        )
        folder_items.append(
            {
                **bucket,
                "document_count": sum(
                    len(item["documents"]) for item in category_items
                ),
                "categories": category_items,
            }
        )

    return {
        "items": folder_items,
        "filters": {
            "folders": [
                {
                    "id": folder.id,
                    "name": folder.name,
                    "year": folder.year,
                    "slug": folder.slug,
                }
                for folder in folders
            ],
            "categories": [
                {
                    "id": category.id,
                    "name": category.name,
                    "code": category.code,
                    "is_system": bool(category.is_system),
                }
                for category in categories
            ],
            "selected_folder_id": folder_id,
            "selected_category_id": category_id,
            "query": normalized_q,
        },
        "total_documents": len(documents),
    }


@router.get("/accounting/documents/{document_id}/preview")
def preview_org_admin_accounting_document(
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not bool(admin.organization.accounting_enabled):
        raise HTTPException(status_code=403, detail="Contabilita non abilitata.")
    document = _get_org_admin_accounting_document_or_404(
        db,
        admin=admin,
        document_id=document_id,
    )
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
def download_org_admin_accounting_document(
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not bool(admin.organization.accounting_enabled):
        raise HTTPException(status_code=403, detail="Contabilita non abilitata.")
    document = _get_org_admin_accounting_document_or_404(
        db,
        admin=admin,
        document_id=document_id,
    )
    return build_accounting_file_response(
        document,
        content_disposition_type="attachment",
    )


@router.post("/accounting/documents/{document_id}/share-links", status_code=201)
def create_org_admin_accounting_share_link(
    document_id: int,
    body: CreateAccountingShareLinkBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not bool(admin.organization.accounting_enabled):
        raise HTTPException(status_code=403, detail="Contabilita non abilitata.")
    document = _get_org_admin_accounting_document_or_404(
        db,
        admin=admin,
        document_id=document_id,
    )
    expires_at = None
    if body.expires_in_days is not None:
        expires_at = datetime.utcnow() + timedelta(days=body.expires_in_days)
    link = create_accounting_share_link(
        db,
        document=document,
        created_by_admin_id=admin.id,
        expires_at=expires_at,
    )
    db.commit()
    db.refresh(link)
    return {"share_link": _serialize_org_admin_accounting_share_link(request, link)}


@router.get("/accounting/documents/{document_id}/share-links")
def list_org_admin_accounting_share_links(
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not bool(admin.organization.accounting_enabled):
        raise HTTPException(status_code=403, detail="Contabilita non abilitata.")
    document = _get_org_admin_accounting_document_or_404(
        db,
        admin=admin,
        document_id=document_id,
    )
    items = [
        _serialize_org_admin_accounting_share_link(request, link)
        for link in sorted(
            document.share_links or [],
            key=lambda item: (item.created_at or datetime.min),
            reverse=True,
        )
        if link.revoked_at is None
        and (link.expires_at is None or link.expires_at > datetime.utcnow())
    ]
    return {"items": items, "total": len(items)}


@router.post("/accounting/share-links/{share_link_id}/revoke")
def revoke_org_admin_accounting_share_link(
    share_link_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not bool(admin.organization.accounting_enabled):
        raise HTTPException(status_code=403, detail="Contabilita non abilitata.")
    share_link = (
        db.query(AccountingShareLink)
        .join(AccountingDocument, AccountingDocument.id == AccountingShareLink.document_id)
        .filter(
            AccountingShareLink.id == share_link_id,
            AccountingDocument.org_id == admin.org_id,
        )
        .first()
    )
    if share_link is None:
        raise HTTPException(status_code=404, detail="Link di condivisione non trovato.")
    if share_link.revoked_at is None:
        share_link.revoked_at = datetime.utcnow()
        db.add(share_link)
        db.commit()
    return {"ok": True, "share_link_id": share_link_id}


@router.patch("/organization")
def patch_organization(
    request: Request,
    body: PatchOrgOrganization,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    org = admin.organization
    update_data = body.model_dump(exclude_unset=True)

    if "wallet_bg_color" in update_data:
        raw_color = str(update_data.get("wallet_bg_color") or "").strip()
        if raw_color == "":
            update_data["wallet_bg_color"] = None
        else:
            is_hex = (
                len(raw_color) == 7
                and raw_color.startswith("#")
                and all(ch in "0123456789abcdefABCDEF" for ch in raw_color[1:])
            )
            if not is_hex:
                raise HTTPException(
                    status_code=422,
                    detail="wallet_bg_color deve essere in formato #RRGGBB",
                )
            update_data["wallet_bg_color"] = raw_color.upper()

    if "wallet_title_override" in update_data:
        raw_title = str(update_data.get("wallet_title_override") or "").strip()
        update_data["wallet_title_override"] = _normalize_tag_culture(raw_title) or None

    if "name" in update_data:
        update_data["name"] = _normalize_tag_culture(update_data.get("name"))

    for key, value in update_data.items():
        setattr(org, key, value)

    db.commit()
    db.refresh(org)

    audit.log_operation(
        db,
        action="org.update",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="org_admin",
        metadata=update_data,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "ok": True,
        "organization": _serialize_org_admin_organization(request, org),
    }


@router.get("/communications/settings")
def get_communications_settings(
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return _serialize_org_admin_communications_settings(admin.organization)


@router.put("/communications/settings")
def put_communications_settings(
    request: Request,
    body: PutOrgCommunicationSettings,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    org = admin.organization
    _require_active_communications_module(org)
    update_data = _normalize_org_communications_update(body.model_dump())

    for key, value in update_data.items():
        setattr(org, key, value)

    db.commit()
    db.refresh(org)

    audit.log_operation(
        db,
        action="org.communications_settings.update",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="org_admin",
        metadata=update_data,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "ok": True,
        "settings": _serialize_org_admin_communications_settings(org),
    }


@router.post("/communications/test-email")
def send_communications_test_email(
    request: Request,
    body: SendOrgCommunicationTestEmailBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    org = admin.organization
    _require_active_communications_module(org)
    try:
        provider_message_id = send_test_email_now(
            organization=org,
            to_email=str(body.to_email),
            requested_by_user_id=admin.id,
        )
    except PermanentEmailDeliveryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except RetryableEmailDeliveryError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    sender = resolve_email_sender(mode="association", association=org)
    return {
        "ok": True,
        "provider_message_id": provider_message_id,
        "sender": _serialize_communications_sender(sender),
        "message": "Email di test inviata correttamente.",
    }


@router.get("/communications/templates")
def list_communication_templates(
    request: Request,
    scope: str = Query(default="all"),
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    normalized_scope = normalize_template_scope(scope)
    query = (
        db.query(EmailTemplate)
        .options(
            joinedload(EmailTemplate.linked_form).joinedload(AssociationForm.organization),
        )
        .filter(EmailTemplate.channel == EMAIL_TEMPLATE_CHANNEL)
        .order_by(
            EmailTemplate.is_system.desc(),
            EmailTemplate.name.asc(),
            EmailTemplate.id.desc(),
        )
    )
    if normalized_scope == "system":
        query = query.filter(EmailTemplate.is_system.is_(True))
    elif normalized_scope == "association":
        query = query.filter(
            EmailTemplate.is_system.is_(False),
            EmailTemplate.association_id == admin.org_id,
        )
    else:
        query = query.filter(
            or_(
                EmailTemplate.is_system.is_(True),
                EmailTemplate.association_id == admin.org_id,
            )
        )
    if not include_inactive:
        query = query.filter(EmailTemplate.is_active.is_(True))

    items = query.all()
    return {
        "items": [_serialize_email_template(item) for item in items],
        "total": len(items),
        "scope": normalized_scope,
    }


@router.post("/communications/templates", status_code=201)
def create_communication_template(
    request: Request,
    body: CreateEmailTemplateBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    body_html, body_text, compiled_html = _resolve_email_builder_bodies(
        body_html=body.body_html,
        body_text=body.body_text,
        compiled_html=body.compiled_html,
    )
    template = EmailTemplate(
        association_id=admin.org_id,
        is_system=False,
        name=_normalize_template_name(body.name),
        category=_normalize_optional_text(body.category),
        template_type=normalize_email_template_type(body.template_type or body.category),
        subject=_normalize_template_subject(body.subject),
        body_html=body_html,
        body_text=body_text,
        editor_status=normalize_email_editor_status(body.editor_status or EMAIL_EDITOR_STATUS_DRAFT),
        design_json=normalize_email_design(body.design),
        grapesjs_project_json=body.grapesjs_project_json,
        mjml_source=_normalize_optional_text(body.mjml_source),
        compiled_html=compiled_html,
        linked_form_id=(
            _resolve_optional_linked_form_for_admin(db, admin=admin, form_id=body.linked_form_id).id
            if body.linked_form_id
            else None
        ),
        channel=normalize_template_channel(body.channel),
        is_active=True,
        created_by_user_id=admin.id,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return {
        "ok": True,
        "template": _serialize_email_template(template, include_body=True),
    }


@router.get("/communications/templates/variables")
def get_communication_template_variables(
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    fake_context = build_template_context(association=admin.organization, fake=True)
    return {
        "items": AVAILABLE_TEMPLATE_VARIABLES,
        "fake_context": fake_context,
    }


@router.post("/communications/templates/preview")
def preview_communication_template(
    request: Request,
    body: RenderEmailTemplatePreviewBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    template = None
    if body.template_id is not None:
        template = _get_email_template_for_admin(db, admin=admin, template_id=body.template_id)

    subject = _normalize_optional_text(body.subject) or (template.subject if template else None)
    body_html = _normalize_optional_text(body.body_html) if body.body_html is not None else (
        template.body_html if template else None
    )
    body_text = _normalize_optional_text(body.body_text) if body.body_text is not None else (
        template.body_text if template else None
    )
    compiled_html = _normalize_optional_text(body.compiled_html) if body.compiled_html is not None else (
        getattr(template, "compiled_html", None) if template else None
    )
    if subject is None:
        raise HTTPException(status_code=422, detail="Oggetto template obbligatorio.")
    linked_form = (
        _resolve_optional_linked_form_for_admin(db, admin=admin, form_id=body.linked_form_id)
        if body.linked_form_id is not None
        else getattr(template, "linked_form", None)
    )
    design = normalize_email_design(body.design if body.design is not None else getattr(template, "design_json", None))
    body_html, body_text, compiled_html = _resolve_email_builder_bodies(
        body_html=body_html,
        body_text=body_text,
        compiled_html=compiled_html,
    )
    rendered = render_template_content(
        subject=subject,
        body_html=compiled_html or body_html,
        body_text=body_text,
        association=admin.organization,
        fake=True,
        extra_context={
            "titolo_form": linked_form.title if linked_form is not None else "",
            "link_form_collegato": build_linked_form_url(
                association=admin.organization,
                linked_form=linked_form,
            ) or "",
        },
    )
    rendered = decorate_rendered_email(
        rendered,
        association=admin.organization,
        design=design,
        linked_form=linked_form,
    )
    return {
        "preview": {
            "subject": rendered.subject,
            "body_html": rendered.body_html,
            "body_text": rendered.body_text,
            "compiled_html": compiled_html,
        },
        "fake_context": rendered.context,
    }


@router.get("/communications/templates/{template_id}")
def get_communication_template_detail(
    template_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    template = _get_email_template_for_admin(db, admin=admin, template_id=template_id)
    return {
        "template": _serialize_email_template(template, include_body=True),
    }


@router.put("/communications/templates/{template_id}")
def update_communication_template(
    template_id: int,
    request: Request,
    body: UpdateEmailTemplateBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    template = _get_email_template_for_admin(db, admin=admin, template_id=template_id)
    if template.is_system:
        raise HTTPException(
            status_code=409,
            detail="I template di sistema non possono essere modificati direttamente.",
        )
    if template.association_id != admin.org_id:
        raise HTTPException(status_code=404, detail="Template non trovato.")

    body_html, body_text, compiled_html = _resolve_email_builder_bodies(
        body_html=body.body_html,
        body_text=body.body_text,
        compiled_html=body.compiled_html,
    )
    template.name = _normalize_template_name(body.name)
    template.category = _normalize_optional_text(body.category)
    template.template_type = normalize_email_template_type(body.template_type or body.category or template.category)
    template.subject = _normalize_template_subject(body.subject)
    template.body_html = body_html
    template.body_text = body_text
    template.editor_status = normalize_email_editor_status(body.editor_status or getattr(template, "editor_status", None))
    template.design_json = normalize_email_design(body.design)
    template.grapesjs_project_json = body.grapesjs_project_json
    template.mjml_source = _normalize_optional_text(body.mjml_source)
    template.compiled_html = compiled_html
    template.linked_form_id = (
        _resolve_optional_linked_form_for_admin(db, admin=admin, form_id=body.linked_form_id).id
        if body.linked_form_id
        else None
    )
    template.channel = normalize_template_channel(body.channel)
    if body.is_active is not None:
        template.is_active = bool(body.is_active)
    db.commit()
    db.refresh(template)
    return {
        "ok": True,
        "template": _serialize_email_template(template, include_body=True),
    }


@router.post("/communications/templates/{template_id}/duplicate", status_code=201)
def duplicate_communication_template(
    template_id: int,
    request: Request,
    body: DuplicateEmailTemplateBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    template = _get_email_template_for_admin(db, admin=admin, template_id=template_id)
    duplicate = EmailTemplate(
        association_id=admin.org_id,
        is_system=False,
        name=_normalize_template_name(body.name or f"{template.name} (copia)"),
        category=template.category,
        template_type=getattr(template, "template_type", None) or normalize_email_template_type(template.category),
        subject=template.subject,
        body_html=template.body_html,
        body_text=template.body_text,
        editor_status=getattr(template, "editor_status", None) or EMAIL_EDITOR_STATUS_DRAFT,
        design_json=normalize_email_design(getattr(template, "design_json", None)),
        grapesjs_project_json=getattr(template, "grapesjs_project_json", None),
        mjml_source=getattr(template, "mjml_source", None),
        compiled_html=getattr(template, "compiled_html", None),
        linked_form_id=getattr(template, "linked_form_id", None),
        channel=template.channel,
        is_active=True,
        created_by_user_id=admin.id,
    )
    db.add(duplicate)
    db.commit()
    db.refresh(duplicate)
    return {
        "ok": True,
        "template": _serialize_email_template(duplicate, include_body=True),
    }


@router.post("/communications/templates/{template_id}/archive")
def archive_communication_template(
    template_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    template = _get_email_template_for_admin(db, admin=admin, template_id=template_id)
    if template.is_system:
        raise HTTPException(
            status_code=409,
            detail="I template di sistema non possono essere archiviati.",
        )
    if template.association_id != admin.org_id:
        raise HTTPException(status_code=404, detail="Template non trovato.")

    template.is_active = False
    db.commit()
    db.refresh(template)
    return {
        "ok": True,
        "template": _serialize_email_template(template, include_body=True),
    }


@router.delete("/communications/templates/{template_id}")
def delete_communication_template(
    template_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    template = _get_email_template_for_admin(db, admin=admin, template_id=template_id)
    if template.is_system:
        raise HTTPException(
            status_code=409,
            detail="I template di sistema non possono essere eliminati.",
        )
    if template.association_id != admin.org_id:
        raise HTTPException(status_code=404, detail="Template non trovato.")

    db.delete(template)
    db.commit()
    return {"ok": True}


@router.get("/communications/assets")
def list_communication_assets(
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    items = (
        db.query(EmailBuilderAsset)
        .filter(EmailBuilderAsset.association_id == admin.org_id)
        .order_by(EmailBuilderAsset.created_at.desc(), EmailBuilderAsset.id.desc())
        .all()
    )
    return {
        "items": [_serialize_email_builder_asset(item) for item in items],
        "total": len(items),
    }


@router.post("/communications/assets", status_code=201)
async def upload_communication_asset(
    request: Request,
    file: UploadFile = File(...),
    name: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    enforce_email_builder_asset_request_size_from_headers(request.headers)
    rel_path, size_bytes, _sha = await save_email_builder_asset_file(file, org_id=admin.org_id)
    public_url = f"/uploads/{rel_path.replace(os.sep, '/')}"
    asset = EmailBuilderAsset(
        association_id=admin.org_id,
        created_by_user_id=admin.id,
        name=(name or file.filename or "Asset builder").strip()[:160] or "Asset builder",
        file_name=(file.filename or "asset").strip()[:255] or "asset",
        mime_type=file.content_type or "application/octet-stream",
        size_bytes=size_bytes,
        storage_path=rel_path.replace(os.sep, "/"),
        public_url=public_url,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return {"ok": True, "asset": _serialize_email_builder_asset(asset)}


@router.delete("/communications/assets/{asset_id}")
def delete_communication_asset(
    asset_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    asset = (
        db.query(EmailBuilderAsset)
        .filter(
            EmailBuilderAsset.id == asset_id,
            EmailBuilderAsset.association_id == admin.org_id,
        )
        .first()
    )
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset non trovato.")

    file_path = os.path.join(settings.UPLOAD_DIR, asset.storage_path)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            logger.warning("Failed to delete communication asset file path=%s", file_path)

    db.delete(asset)
    db.commit()
    return {"ok": True, "deleted_asset_id": asset_id}


@router.get("/communications/whatsapp/automations")
def list_whatsapp_automations(
    request: Request,
    form_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    automations_query = (
        db.query(WhatsAppAutomation)
        .options(
            joinedload(WhatsAppAutomation.form).joinedload(AssociationForm.organization),
        )
        .filter(WhatsAppAutomation.association_id == admin.org_id)
        .order_by(
            WhatsAppAutomation.is_active.desc(),
            WhatsAppAutomation.updated_at.desc(),
            WhatsAppAutomation.id.desc(),
        )
    )
    if form_id is not None:
        automations_query = automations_query.filter(WhatsAppAutomation.form_id == form_id)
    items = automations_query.all()
    return {
        "items": [serialize_whatsapp_automation(item) for item in items],
        "total": len(items),
        "phone_source_options": sorted(ALLOWED_WHATSAPP_PHONE_SOURCES),
        "recipient_options": sorted(ALLOWED_WHATSAPP_RECIPIENTS),
        "source_options": sorted(ALLOWED_WHATSAPP_SOURCES),
        "trigger_options": sorted(ALLOWED_WHATSAPP_TRIGGERS),
    }


@router.post("/communications/whatsapp/automations", status_code=201)
def create_whatsapp_automation(
    request: Request,
    body: UpsertWhatsAppAutomationBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    form = _resolve_optional_linked_form_for_admin(db, admin=admin, form_id=body.form_id)
    automation = WhatsAppAutomation(
        association_id=admin.org_id,
        created_by_user_id=admin.id,
    )
    apply_whatsapp_automation_updates(
        automation,
        form=form,
        name=body.name,
        source_type=body.source_type,
        trigger_event=body.trigger_event,
        recipient_type=body.recipient_type,
        phone_source=body.phone_source,
        phone_field_key=body.phone_field_key,
        custom_phone=body.custom_phone,
        template_name=body.template_name,
        template_body=body.template_body,
        is_active=body.is_active,
    )
    db.add(automation)
    db.commit()
    db.refresh(automation)
    return {"ok": True, "automation": serialize_whatsapp_automation(automation)}


@router.put("/communications/whatsapp/automations/{automation_id}")
def update_whatsapp_automation(
    automation_id: int,
    request: Request,
    body: UpsertWhatsAppAutomationBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    automation = (
        db.query(WhatsAppAutomation)
        .options(
            joinedload(WhatsAppAutomation.form).joinedload(AssociationForm.organization),
        )
        .filter(
            WhatsAppAutomation.id == automation_id,
            WhatsAppAutomation.association_id == admin.org_id,
        )
        .first()
    )
    if automation is None:
        raise HTTPException(status_code=404, detail="Automazione WhatsApp non trovata.")
    form = _resolve_optional_linked_form_for_admin(db, admin=admin, form_id=body.form_id)
    apply_whatsapp_automation_updates(
        automation,
        form=form,
        name=body.name,
        source_type=body.source_type,
        trigger_event=body.trigger_event,
        recipient_type=body.recipient_type,
        phone_source=body.phone_source,
        phone_field_key=body.phone_field_key,
        custom_phone=body.custom_phone,
        template_name=body.template_name,
        template_body=body.template_body,
        is_active=body.is_active,
    )
    db.commit()
    db.refresh(automation)
    return {"ok": True, "automation": serialize_whatsapp_automation(automation)}


@router.get("/communications/audience-estimate")
def get_communications_audience_estimate(
    request: Request,
    audience_type: str = Query(...),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    normalized_audience = (audience_type or "").strip()
    recipients = resolve_audience_recipients(
        db,
        association_id=admin.org_id,
        audience_type=normalized_audience,
    )
    return {
        "audience_type": normalized_audience,
        "count": len(recipients),
        "available_audiences": sorted(ALLOWED_AUDIENCE_TYPES),
    }


@router.get("/communications/member-search")
def search_communications_members(
    request: Request,
    q: Optional[str] = Query(default=None),
    limit: int = Query(default=10, ge=1, le=25),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    query = (
        db.query(Member)
        .filter(
            Member.org_id == admin.org_id,
            Member.deleted_at.is_(None),
        )
        .order_by(Member.last_name.asc(), Member.first_name.asc(), Member.id.desc())
    )
    normalized_query = (q or "").strip()
    if normalized_query:
        pattern = f"%{normalized_query}%"
        query = query.filter(
            or_(
                Member.first_name.ilike(pattern),
                Member.last_name.ilike(pattern),
                Member.email.ilike(pattern),
                cast(Member.card_no, String).ilike(pattern),
            )
        )

    members = query.limit(limit).all()
    current_time = datetime.utcnow()
    return {
        "items": [
            {
                "id": member.id,
                "name": f"{member.first_name} {member.last_name}".strip() or member.email or f"Socio #{member.id}",
                "email": member.email,
                "card_no": member.card_no,
                "card_number": member.card_no,
                "status": get_member_lifecycle_status(member, now=current_time),
                "is_active": is_member_active(member, now=current_time),
            }
            for member in members
        ],
        "total": len(members),
        "query": normalized_query,
    }


@router.post("/communications/campaigns/from-template", status_code=201)
def create_communications_campaign_from_template(
    request: Request,
    body: CreateCampaignFromTemplateBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    template = _resolve_optional_source_template_for_admin(
        db,
        admin=admin,
        template_id=body.template_id,
    )
    if template is None:
        raise HTTPException(status_code=422, detail="Template sorgente obbligatorio.")
    campaign = create_campaign_draft(
        db,
        organization=admin.organization,
        created_by_user_id=admin.id,
        name=body.name or f"{template.name} - campagna",
        subject=body.subject or template.subject,
        body_html=template.body_html,
        body_text=template.body_text,
        audience_type=body.audience_type,
        recipient_mode=body.recipient_mode,
        selected_member_ids=body.member_ids,
        scheduled_at=body.scheduled_at,
        design=body.design or normalize_email_design(getattr(template, "design_json", None)),
        linked_form=_resolve_optional_linked_form_for_admin(
            db,
            admin=admin,
            form_id=body.linked_form_id if body.linked_form_id is not None else template.linked_form_id,
        ),
        source_template_id=template.id,
        editor_status=EMAIL_EDITOR_STATUS_DRAFT,
        grapesjs_project_json=getattr(template, "grapesjs_project_json", None),
        mjml_source=getattr(template, "mjml_source", None),
        compiled_html=getattr(template, "compiled_html", None),
    )
    db.commit()
    campaign = (
        db.query(EmailCampaign)
        .options(
            joinedload(EmailCampaign.recipients),
            joinedload(EmailCampaign.created_by_user),
            joinedload(EmailCampaign.linked_form).joinedload(AssociationForm.organization),
            joinedload(EmailCampaign.source_template),
        )
        .filter(EmailCampaign.id == campaign.id)
        .first()
    )
    return {"ok": True, "campaign": _serialize_email_campaign(campaign, include_body=True)}


@router.post("/communications/campaigns/test-send")
def send_communications_builder_test(
    request: Request,
    body: SendCommunicationBuilderTestBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    linked_form = _resolve_optional_linked_form_for_admin(
        db,
        admin=admin,
        form_id=body.linked_form_id,
    )
    body_html, body_text, compiled_html = _resolve_email_builder_bodies(
        body_html=body.body_html,
        body_text=body.body_text,
        compiled_html=body.compiled_html,
    )
    rendered = render_template_content(
        subject=_normalize_template_subject(body.subject),
        body_html=compiled_html or body_html,
        body_text=body_text,
        association=admin.organization,
        fake=True,
        extra_context={
            "titolo_form": linked_form.title if linked_form is not None else "",
            "link_form_collegato": build_linked_form_url(
                association=admin.organization,
                linked_form=linked_form,
            ) or "",
            "nome_evento": body.message_name or "",
        },
    )
    rendered = decorate_rendered_email(
        rendered,
        association=admin.organization,
        design=normalize_email_design(body.design),
        linked_form=linked_form,
    )
    try:
        provider_message_id = send_email_via_transport_low_level(
            to_email=str(body.to_email),
            subject=rendered.subject,
            text_body=rendered.body_text or "",
            html_body=rendered.body_html,
            mode="association",
            association=admin.organization,
        )
    except PermanentEmailDeliveryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except RetryableEmailDeliveryError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    sender = resolve_email_sender(mode="association", association=admin.organization)
    return {
        "ok": True,
        "provider_message_id": provider_message_id,
        "message": "Email di test builder inviata correttamente.",
        "preview": {
            "subject": rendered.subject,
            "body_html": rendered.body_html,
            "body_text": rendered.body_text,
        },
        "sender": _serialize_communications_sender(sender),
    }


@router.get("/communications/campaigns")
def list_communications_campaigns(
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    campaigns = (
        db.query(EmailCampaign)
        .options(
            joinedload(EmailCampaign.recipients),
            joinedload(EmailCampaign.created_by_user),
            joinedload(EmailCampaign.linked_form).joinedload(AssociationForm.organization),
            joinedload(EmailCampaign.source_template),
        )
        .filter(EmailCampaign.association_id == admin.org_id)
        .order_by(EmailCampaign.created_at.desc(), EmailCampaign.id.desc())
        .all()
    )
    return {
        "items": [_serialize_email_campaign(campaign) for campaign in campaigns],
        "total": len(campaigns),
    }


@router.post("/communications/campaigns", status_code=201)
def create_communications_campaign(
    request: Request,
    body: CreateEmailCampaignBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    campaign = create_campaign_draft(
        db,
        organization=admin.organization,
        created_by_user_id=admin.id,
        name=body.name,
        subject=body.subject,
        body_html=body.body_html,
        body_text=body.body_text,
        audience_type=body.audience_type,
        recipient_mode=body.recipient_mode,
        selected_member_ids=body.member_ids,
        scheduled_at=body.scheduled_at,
        design=body.design,
        linked_form=_resolve_optional_linked_form_for_admin(
            db,
            admin=admin,
            form_id=body.linked_form_id,
        ),
        source_template_id=(
            _resolve_optional_source_template_for_admin(
                db,
                admin=admin,
                template_id=body.source_template_id,
            ).id
            if body.source_template_id
            else None
        ),
        editor_status=body.editor_status,
        grapesjs_project_json=body.grapesjs_project_json,
        mjml_source=body.mjml_source,
        compiled_html=body.compiled_html,
    )
    db.commit()
    campaign = (
        db.query(EmailCampaign)
        .options(
            joinedload(EmailCampaign.recipients),
            joinedload(EmailCampaign.created_by_user),
            joinedload(EmailCampaign.linked_form).joinedload(AssociationForm.organization),
            joinedload(EmailCampaign.source_template),
        )
        .filter(EmailCampaign.id == campaign.id)
        .first()
    )
    return {
        "ok": True,
        "campaign": _serialize_email_campaign(campaign, include_body=True),
    }


@router.get("/communications/campaigns/{campaign_id}")
def get_communications_campaign_detail(
    request: Request,
    campaign_id: int,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    campaign = (
        db.query(EmailCampaign)
        .options(
            joinedload(EmailCampaign.recipients),
            joinedload(EmailCampaign.created_by_user),
            joinedload(EmailCampaign.linked_form).joinedload(AssociationForm.organization),
            joinedload(EmailCampaign.source_template),
        )
        .filter(
            EmailCampaign.id == campaign_id,
            EmailCampaign.association_id == admin.org_id,
        )
        .first()
    )
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campagna non trovata.")

    return {
        "campaign": _serialize_email_campaign(campaign, include_body=True),
    }


@router.put("/communications/campaigns/{campaign_id}")
def update_communications_campaign(
    request: Request,
    campaign_id: int,
    body: CreateEmailCampaignBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    campaign = (
        db.query(EmailCampaign)
        .filter(
            EmailCampaign.id == campaign_id,
            EmailCampaign.association_id == admin.org_id,
        )
        .first()
    )
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campagna non trovata.")

    campaign = update_campaign_draft(
        db,
        campaign=campaign,
        organization=admin.organization,
        name=body.name,
        subject=body.subject,
        body_html=body.body_html,
        body_text=body.body_text,
        audience_type=body.audience_type,
        recipient_mode=body.recipient_mode,
        selected_member_ids=body.member_ids,
        scheduled_at=body.scheduled_at,
        design=body.design,
        linked_form=_resolve_optional_linked_form_for_admin(
            db,
            admin=admin,
            form_id=body.linked_form_id,
        ),
        source_template_id=(
            _resolve_optional_source_template_for_admin(
                db,
                admin=admin,
                template_id=body.source_template_id,
            ).id
            if body.source_template_id
            else None
        ),
        editor_status=body.editor_status,
        grapesjs_project_json=body.grapesjs_project_json,
        mjml_source=body.mjml_source,
        compiled_html=body.compiled_html,
    )
    db.commit()
    campaign = (
        db.query(EmailCampaign)
        .options(
            joinedload(EmailCampaign.recipients),
            joinedload(EmailCampaign.created_by_user),
            joinedload(EmailCampaign.linked_form).joinedload(AssociationForm.organization),
            joinedload(EmailCampaign.source_template),
        )
        .filter(EmailCampaign.id == campaign.id)
        .first()
    )
    return {
        "ok": True,
        "campaign": _serialize_email_campaign(campaign, include_body=True),
    }


@router.delete("/communications/campaigns/{campaign_id}")
def delete_communications_campaign(
    request: Request,
    campaign_id: int,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    campaign = (
        db.query(EmailCampaign)
        .filter(
            EmailCampaign.id == campaign_id,
            EmailCampaign.association_id == admin.org_id,
        )
        .first()
    )
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campagna non trovata.")

    db.delete(campaign)
    db.commit()
    return {"ok": True}


@router.get("/communications/campaigns/{campaign_id}/recipients")
def get_communications_campaign_recipients(
    request: Request,
    campaign_id: int,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    campaign = (
        db.query(EmailCampaign)
        .filter(
            EmailCampaign.id == campaign_id,
            EmailCampaign.association_id == admin.org_id,
        )
        .first()
    )
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campagna non trovata.")

    recipients = (
        db.query(EmailCampaignRecipient)
        .filter(
            EmailCampaignRecipient.campaign_id == campaign_id,
            EmailCampaignRecipient.association_id == admin.org_id,
        )
        .order_by(
            EmailCampaignRecipient.created_at.desc(),
            EmailCampaignRecipient.id.desc(),
        )
        .all()
    )
    return {
        "items": [_serialize_email_campaign_recipient(recipient) for recipient in recipients],
        "total": len(recipients),
    }


@router.post("/communications/campaigns/{campaign_id}/send")
def send_communications_campaign(
    request: Request,
    campaign_id: int,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_active_communications_module(admin.organization)
    campaign = (
        db.query(EmailCampaign)
        .filter(
            EmailCampaign.id == campaign_id,
            EmailCampaign.association_id == admin.org_id,
        )
        .first()
    )
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campagna non trovata.")

    campaign, recipient_count = send_campaign(
        db,
        campaign=campaign,
        organization=admin.organization,
    )
    db.commit()
    campaign = (
        db.query(EmailCampaign)
        .options(
            joinedload(EmailCampaign.recipients),
            joinedload(EmailCampaign.created_by_user),
            joinedload(EmailCampaign.linked_form).joinedload(AssociationForm.organization),
            joinedload(EmailCampaign.source_template),
        )
        .filter(EmailCampaign.id == campaign.id)
        .first()
    )
    return {
        "ok": True,
        "campaign": _serialize_email_campaign(campaign, include_body=True),
        "recipient_count": recipient_count,
        "message": "Campagna accodata correttamente per l'invio.",
    }


@router.post("/organization/statute")
async def upload_statute(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        enforce_statute_request_size_from_headers(request.headers)
        rel_path, size, sha = await save_statute_pdf(file)
    except HTTPException as exc:
        if exc.status_code in {413, 415, 422}:
            logger.warning(
                "Rejected statute upload status=%s request_id=%s org_id=%s content_length=%s filename=%s mime=%s",
                exc.status_code,
                getattr(request.state, "request_id", None),
                admin.org_id,
                request.headers.get("content-length"),
                file.filename,
                file.content_type,
            )
        raise

    org = admin.organization

    # Increment version logic
    new_version = "v1"
    if org.statute_version:
        # Try parsing as vN
        if org.statute_version.startswith("v") and org.statute_version[1:].isdigit():
            ver_num = int(org.statute_version[1:])
            new_version = f"v{ver_num + 1}"
        else:
            # Fallback or manual handling if it was custom
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
        actor_role="org_admin",
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


@router.post("/organization/wallet-assets")
async def upload_wallet_assets(
    request: Request,
    logo: UploadFile | None = File(None),
    hero_image: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if logo is None and hero_image is None:
        raise HTTPException(
            status_code=400, detail="Carica almeno un asset (logo o hero image)."
        )

    org = admin.organization
    audit_metadata: dict[str, object] = {}

    try:
        enforce_wallet_asset_request_size_from_headers(request.headers)
        if logo is not None:
            logo_rel_path, logo_size, logo_sha = await save_wallet_logo_file(
                logo, org_id=org.id
            )
            org.wallet_logo_url = f"/uploads/{logo_rel_path.replace(os.sep, '/')}"
            audit_metadata["logo"] = {
                "filename": logo.filename,
                "size": logo_size,
                "sha256": logo_sha,
                "url": org.wallet_logo_url,
            }
        if hero_image is not None:
            hero_rel_path, hero_size, hero_sha = await save_wallet_hero_image_file(
                hero_image, org_id=org.id
            )
            org.wallet_hero_image_url = f"/uploads/{hero_rel_path.replace(os.sep, '/')}"
            audit_metadata["hero_image"] = {
                "filename": hero_image.filename,
                "size": hero_size,
                "sha256": hero_sha,
                "url": org.wallet_hero_image_url,
            }
    except HTTPException as exc:
        if exc.status_code in {400, 413, 415, 422}:
            logger.warning(
                "Rejected wallet asset upload status=%s request_id=%s org_id=%s content_length=%s logo=%s hero=%s",
                exc.status_code,
                getattr(request.state, "request_id", None),
                admin.org_id,
                request.headers.get("content-length"),
                getattr(logo, "filename", None),
                getattr(hero_image, "filename", None),
            )
        raise

    db.commit()

    audit.log_operation(
        db,
        action="org.wallet_assets.upload",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="org_admin",
        metadata=audit_metadata,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    wallet_defaults = wallet_branding_defaults(
        org, base_url=str(request.base_url).rstrip("/")
    )
    return {
        "ok": True,
        "wallet_logo_url": org.wallet_logo_url,
        "wallet_hero_image_url": org.wallet_hero_image_url,
        "wallet_effective_logo_url": wallet_defaults["wallet_logo_url"],
        "wallet_effective_hero_image_url": wallet_defaults["wallet_hero_image_url"],
    }


@router.get("/metrics")
def org_metrics(request: Request, db: Session = Depends(get_db)):
    """Return scoped metrics for the authenticated org admin's organization.

    PERFORMANCE: Uses combined queries with conditional aggregation to minimize
    database round-trips (was 4+ queries, now 3).
    """
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    org_id = admin.org_id

    current_time = datetime.utcnow()
    pending_statuses = [
        MemberStatus.PENDING_VERIFICATION,
        MemberStatus.PENDING_DOCS,
        MemberStatus.PENDING_CARDS,
    ]

    active_members_count = int(
        db.query(func.count(Member.id))
        .filter(
            Member.org_id == org_id,
            *member_active_filters(now=current_time),
        )
        .scalar()
        or 0
    )
    pending_requests_count = int(
        db.query(func.count(Member.id))
        .filter(
            Member.org_id == org_id,
            Member.deleted_at.is_(None),
            Member.status.in_(pending_statuses),
        )
        .scalar()
        or 0
    )
    members_count = active_members_count + pending_requests_count

    # Query 2: Document counts with conditional aggregation (combines 2 queries into 1)
    doc_stats = (
        db.query(
            func.sum(
                case(
                    (
                        MemberDocument.status.in_(
                            [DocStatus.PENDING.value, DocStatus.UPLOADED.value]
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label("pending"),
            func.sum(
                case((MemberDocument.status == DocStatus.REJECTED.value, 1), else_=0)
            ).label("rejected"),
        )
        .join(Member, MemberDocument.member_id == Member.id)
        .filter(
            Member.org_id == org_id,
            Member.deleted_at.is_(None),
            Member.status.notin_([MemberStatus.REJECTED, MemberStatus.EXPIRED]),
        )
        .first()
    )

    documents_pending_review = doc_stats.pending or 0
    documents_rejected = doc_stats.rejected or 0

    card_stock = _compute_org_card_stock(db, org_id, now=current_time)
    cards_total = card_stock["total"]
    cards_remaining = card_stock["remaining"]
    cards_used = card_stock["used"]

    return {
        "members_count": members_count,
        "active_members_count": active_members_count,
        "cards_total": cards_total,
        "cards_used": cards_used,
        "cards_remaining": cards_remaining,
        "pending_requests_count": pending_requests_count,
        "documents_pending_review": documents_pending_review,
        "documents_rejected": documents_rejected,
    }


@router.get("/referrals/summary")
def org_referrals_summary(request: Request, db: Session = Depends(get_db)):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    organization = (
        db.query(Organization)
        .filter(
            Organization.id == admin.org_id,
            Organization.deleted_at.is_(None),
        )
        .first()
    )
    if organization is None:
        raise HTTPException(status_code=404, detail="Organizzazione non trovata")

    referrals = (
        db.query(Referral)
        .filter(Referral.referrer_org_id == organization.id)
        .order_by(Referral.created_at.desc(), Referral.id.desc())
        .all()
    )

    invite_count = len(referrals)
    approved_count = sum(
        1
        for item in referrals
        if item.status in {ReferralStatus.APPROVED.value, ReferralStatus.REWARDED.value}
    )
    rewarded_count = sum(1 for item in referrals if item.status == ReferralStatus.REWARDED.value)

    pending_reward_referrals = []
    recent_referrals = []
    for item in referrals[:10]:
        row = _serialize_org_admin_referral(item)
        recent_referrals.append(row)
        if bool(row["wheel_enabled"]):
            pending_reward_referrals.append(row)

    latest_reward = next(
        (
            {
                "id": item.id,
                "application_id": item.application_id,
                "reward_code": item.reward_code,
                "reward_title": item.reward_title,
                "reward_description": item.reward_description,
                "reward_delivery_timing": item.reward_delivery_timing,
                "rewarded_at": (
                    (item.wheel_spun_at or item.rewarded_at).isoformat()
                    if (item.wheel_spun_at or item.rewarded_at)
                    else None
                ),
                "wheel_spun_by_org_admin_id": item.wheel_spun_by_org_admin_id,
                "wheel_result": _serialize_org_admin_referral(item)["wheel_result"],
            }
            for item in referrals
            if item.status == ReferralStatus.REWARDED.value
        ),
        None,
    )

    frontend_base = _resolve_frontend_base(request)
    return {
        "referral_slug": organization.slug,
        "referral_link": f"{frontend_base}/affiliazione?ref={organization.slug}",
        "invite_route": f"{frontend_base}/invito/{organization.slug}",
        "stats": {
            "sent": invite_count,
            "approved": approved_count,
            "rewarded": rewarded_count,
        },
        "pending_reward_referrals": pending_reward_referrals,
        "recent_referrals": recent_referrals,
        "latest_reward": latest_reward,
        "reward_options": [
            {
                "code": option["code"],
                "title": option["title"],
                "delivery_timing": option["delivery_timing"],
            }
            for option in REFERRAL_REWARD_OPTIONS
        ],
    }


@router.get("/referrals/invites")
def list_org_referral_invites(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    q: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    query = (
        db.query(Referral)
        .join(
            AffiliationApplication,
            AffiliationApplication.id == Referral.application_id,
        )
        .filter(Referral.referrer_org_id == admin.org_id)
    )

    normalized_q = (q or "").strip()
    if normalized_q:
        pattern = f"%{normalized_q}%"
        query = query.filter(
            or_(
                AffiliationApplication.organization_name.ilike(pattern),
                AffiliationApplication.organization_legal_name.ilike(pattern),
                AffiliationApplication.applicant_email.ilike(pattern),
            )
        )

    normalized_status = (status or "").strip().lower()
    referrals = query.order_by(Referral.created_at.desc(), Referral.id.desc()).all()
    serialized = [_serialize_org_admin_referral(item) for item in referrals]
    if normalized_status:
        serialized = [
            item
            for item in serialized
            if str(item.get("invite_status") or "").strip().lower() == normalized_status
        ]

    total = len(serialized)
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    start = (page - 1) * page_size
    end = start + page_size
    items = serialized[start:end]

    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
    }


class OrgAdminReferralInviteBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    applicant_email: EmailStr
    organization_name: str = Field(min_length=2, max_length=160)
    notes: Optional[str] = None


@router.post("/referrals/invite")
def create_referral_invite(
    request: Request,
    body: OrgAdminReferralInviteBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    organization = (
        db.query(Organization)
        .filter(
            Organization.id == admin.org_id,
            Organization.deleted_at.is_(None),
            Organization.is_active.is_(True),
        )
        .first()
    )
    if organization is None:
        raise HTTPException(status_code=404, detail="Organizzazione non trovata")

    applicant_email = body.applicant_email.strip().lower()
    organization_name = body.organization_name.strip()
    notes = body.notes.strip() if body.notes else None

    if organization.slug and organization.slug.lower() == organization_name.lower():
        raise HTTPException(
            status_code=400,
            detail="Nome associazione non valido per invito.",
        )

    for _ in range(5):
        public_token = secrets.token_urlsafe(24)
        exists = (
            db.query(AffiliationApplication.id)
            .filter(AffiliationApplication.public_token == public_token)
            .first()
        )
        if exists is None:
            break
    else:
        raise HTTPException(status_code=500, detail="Impossibile generare token pratica")

    application = AffiliationApplication(
        public_token=public_token,
        status=AffiliationApplicationStatus.DRAFT.value,
        docs_status=AffiliationDocsStatus.PENDING.value,
        payment_status=AffiliationPaymentStatus.UNPAID.value,
        payment_amount_cents=int(settings.STRIPE_AFFILIATION_PRICE_CENTS),
        organization_name=organization_name,
        applicant_email=applicant_email,
        notes=notes,
    )
    db.add(application)
    db.flush()

    referral = Referral(
        referrer_org_id=organization.id,
        application_id=application.id,
        status=ReferralStatus.PENDING.value,
    )
    db.add(referral)
    db.flush()

    db.add(
        AffiliationEvent(
            application_id=application.id,
            event_type="draft_created",
            actor_type="org_admin",
            actor_admin_id=admin.id,
            payload_json={"source": "org_admin_referral_invite", "ip": get_client_ip(request)},
        )
    )
    db.add(
        AffiliationEvent(
            application_id=application.id,
            event_type="referral_attached",
            actor_type="org_admin",
            actor_admin_id=admin.id,
            payload_json={
                "referrer_org_id": organization.id,
                "referrer_org_slug": organization.slug,
                "referrer_org_name": organization.name,
            },
        )
    )

    frontend_base = _resolve_frontend_base(request)
    invite_url = (
        f"{frontend_base}/affiliazione?token={public_token}&ref={organization.slug}"
    )

    enqueue_email(
        db,
        email_type="org_admin_referral_invite",
        to_email=applicant_email,
        subject=f"Invito ad affiliare {organization_name} su ASSONAM",
        payload=build_email_payload(
            text_body=(
                f"Hai ricevuto un invito ad affiliare '{organization_name}' su ASSONAM.\n"
                f"Apri questo link per completare la richiesta: {invite_url}\n\n"
                "La richiesta viene verificata dal Super Admin prima dell'attivazione."
            ),
            sender=build_sender_payload(
                mode="association",
                association=organization,
            ),
            meta={
                "application_id": application.id,
                "referral_id": referral.id,
                "inviter_org_id": organization.id,
                "inviter_org_slug": organization.slug,
            },
        ),
        priority=2,
    )

    audit.log_operation(
        db,
        action="referral.invite_created",
        entity_type="referral",
        entity_id=referral.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        metadata={
            "application_id": application.id,
            "invited_email": applicant_email,
            "invited_organization_name": organization_name,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    db.commit()

    return {
        "ok": True,
        "application_id": application.id,
        "status": application.status,
        "invite_url": invite_url,
        "referral_id": referral.id,
        "invite_status": "invited",
        "wheel_enabled": False,
    }


@router.post("/referrals/{referral_id}/spin")
def spin_referral_reward(
    request: Request,
    referral_id: int,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    referral = (
        db.query(Referral)
        .filter(
            Referral.id == referral_id,
            Referral.referrer_org_id == admin.org_id,
        )
        .first()
    )
    if referral is None:
        raise HTTPException(status_code=404, detail="Referral non trovato")

    if referral.status == ReferralStatus.REWARDED.value:
        existing = _serialize_org_admin_referral(referral)
        wheel_result = existing.get("wheel_result")
        if not isinstance(wheel_result, dict):
            wheel_result = {
                "code": referral.reward_code,
                "title": referral.reward_title,
                "description": referral.reward_description,
                "delivery_timing": referral.reward_delivery_timing,
            }
        return {
            "ok": True,
            "referral_id": referral.id,
            "status": referral.status,
            "reward": {
                "code": referral.reward_code,
                "title": referral.reward_title,
                "description": referral.reward_description,
                "delivery_timing": referral.reward_delivery_timing,
                "rewarded_at": referral.rewarded_at.isoformat() if referral.rewarded_at else None,
            },
            "wheel_result": wheel_result,
            "wheel_spun_at": existing.get("wheel_spun_at"),
            "wheel_spun_by_org_admin_id": referral.wheel_spun_by_org_admin_id,
            "message": "Premio gia assegnato per questo referral.",
            "super_admin_note": "Premio gia registrato nel sistema.",
        }

    if not _is_referral_wheel_enabled(referral):
        raise HTTPException(
            status_code=409,
            detail="La ruota e disponibile solo quando il referral e approvato dal super admin.",
        )

    reward = _draw_referral_reward()
    now = datetime.utcnow()
    referral.status = ReferralStatus.REWARDED.value
    referral.rewarded_at = now
    referral.reward_code = reward["code"]
    referral.reward_title = reward["title"]
    referral.reward_description = reward["description"]
    referral.reward_delivery_timing = reward["delivery_timing"]
    referral.wheel_result = reward
    referral.wheel_spun_at = now
    referral.wheel_spun_by_org_admin_id = admin.id
    referral.super_admin_notified_at = now

    super_admin_note = (
        f"Referral #{referral.id} premiato con '{reward['title']}'. "
        f"Erogazione prevista: {reward['delivery_timing']}"
    )

    db.add(
        AffiliationEvent(
            application_id=referral.application_id,
            event_type="referral_rewarded",
            actor_type="org_admin",
            actor_admin_id=admin.id,
            payload_json={
                "referral_id": referral.id,
                "reward_code": reward["code"],
                "reward_title": reward["title"],
                "reward_delivery_timing": reward["delivery_timing"],
                "wheel_spun_at": now.isoformat(),
                "wheel_spun_by_org_admin_id": admin.id,
                "super_admin_note": super_admin_note,
            },
        )
    )

    audit.log_operation(
        db,
        action="referral.rewarded",
        entity_type="referral",
        entity_id=referral.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        metadata={
            "application_id": referral.application_id,
            "reward_code": reward["code"],
            "reward_title": reward["title"],
            "reward_delivery_timing": reward["delivery_timing"],
            "super_admin_note": super_admin_note,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    db.commit()

    return {
        "ok": True,
        "referral_id": referral.id,
        "status": referral.status,
        "reward": {
            "code": reward["code"],
            "title": reward["title"],
            "description": reward["description"],
            "delivery_timing": reward["delivery_timing"],
            "rewarded_at": now.isoformat(),
        },
        "wheel_result": reward,
        "wheel_spun_at": now.isoformat(),
        "wheel_spun_by_org_admin_id": admin.id,
        "message": "Premio assegnato. Il risultato e stato comunicato al super admin.",
        "super_admin_note": super_admin_note,
    }


@router.get("/members")
def list_org_members(
    request: Request,
    q: Optional[str] = None,
    status: Optional[str] = None,
    access: Optional[str] = None,
    source: Optional[str] = None,
    docs: Optional[str] = None,
    order: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Return a paginated list of members scoped to the org admin's organization."""
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    current_time = datetime.utcnow()
    status_filter = (status or "").strip().lower()

    query = db.query(Member).filter(
        Member.org_id == admin.org_id,
    )

    if status_filter == "deleted":
        query = query.filter(Member.deleted_at.isnot(None))
    elif status_filter != "all":
        query = query.filter(Member.deleted_at.is_(None))

    exclude_rejected = (
        status_filter in {"", "active", "pending"}
        and status_filter != "all"
        and status_filter != "deleted"
    )
    if exclude_rejected:
        query = query.filter(
            Member.status.notin_([MemberStatus.REJECTED, MemberStatus.EXPIRED])
        )

    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(
                Member.first_name.ilike(pattern),
                Member.last_name.ilike(pattern),
                Member.email.ilike(pattern),
                Member.fiscal_code.ilike(pattern),
            )
        )

    if status_filter:
        if status_filter == "active":
            query = query.filter(*member_active_filters(now=current_time))
        elif status_filter == "pending":
            query = query.filter(
                Member.status.in_(
                    [
                        MemberStatus.PENDING_VERIFICATION,
                        MemberStatus.PENDING_DOCS,
                        MemberStatus.PENDING_CARDS,
                    ]
                )
            )
        elif status_filter in {"suspended", "rejected"}:
            query = query.filter(Member.status == MemberStatus.REJECTED)
        elif status_filter == "expired":
            query = query.filter(*member_expired_filters(now=current_time))
        elif status_filter != "all":
            query = query.filter(Member.status == status)

    if access in {"with", "without"}:
        if access == "with":
            query = query.filter(Member.password_hash.isnot(None))
        else:
            query = query.filter(Member.password_hash.is_(None))

    if source in {"manual", "online"}:
        if source == "manual":
            query = query.filter(Member.is_manual.is_(True))
        else:
            query = query.filter(
                or_(Member.is_manual.is_(False), Member.is_manual.is_(None))
            )

    if docs in {"pending", "rejected", "approved"}:
        pending_statuses = [DocStatus.PENDING.value, DocStatus.UPLOADED.value]
        if docs == "pending":
            query = query.filter(
                db.query(MemberDocument.id)
                .filter(
                    MemberDocument.member_id == Member.id,
                    MemberDocument.status.in_(pending_statuses),
                )
                .exists()
            )
        elif docs == "rejected":
            query = query.filter(
                db.query(MemberDocument.id)
                .filter(
                    MemberDocument.member_id == Member.id,
                    MemberDocument.status == DocStatus.REJECTED.value,
                )
                .exists()
            )
        else:
            has_docs = (
                db.query(MemberDocument.id)
                .filter(MemberDocument.member_id == Member.id)
                .exists()
            )
            has_bad = (
                db.query(MemberDocument.id)
                .filter(
                    MemberDocument.member_id == Member.id,
                    MemberDocument.status.in_(
                        pending_statuses + [DocStatus.REJECTED.value]
                    ),
                )
                .exists()
            )
            query = query.filter(has_docs, ~has_bad)

    total = query.count()
    status_rank = case(
        (Member.status == MemberStatus.ACTIVE, 1),
        (Member.status == MemberStatus.PENDING_VERIFICATION, 2),
        (Member.status == MemberStatus.PENDING_DOCS, 3),
        (Member.status == MemberStatus.PENDING_CARDS, 4),
        (Member.status == MemberStatus.REJECTED, 5),
        else_=9,
    )

    order_key = (order or "joined_at_desc").lower()
    if order_key == "joined_at_asc":
        query = query.order_by(Member.joined_at.is_(None), Member.joined_at.asc())
    elif order_key == "last_name_asc":
        query = query.order_by(Member.last_name.asc(), Member.first_name.asc())
    elif order_key == "last_name_desc":
        query = query.order_by(Member.last_name.desc(), Member.first_name.desc())
    elif order_key == "status_asc":
        query = query.order_by(status_rank.asc(), Member.last_name.asc())
    elif order_key == "status_desc":
        query = query.order_by(status_rank.desc(), Member.last_name.asc())
    else:
        query = query.order_by(Member.joined_at.is_(None), Member.joined_at.desc())

    members = query.offset(offset).limit(min(limit, 100)).all()

    # Avoid N+1 for docs_count
    member_ids = [m.id for m in members]
    docs_counts = {}
    docs_statuses = {}
    if member_ids:
        rows = (
            db.query(MemberDocument.member_id, func.count(MemberDocument.id))
            .filter(MemberDocument.member_id.in_(member_ids))
            .group_by(MemberDocument.member_id)
            .all()
        )
        docs_counts = {r[0]: r[1] for r in rows}
        status_rows = (
            db.query(MemberDocument.member_id, MemberDocument.status)
            .filter(MemberDocument.member_id.in_(member_ids))
            .all()
        )
        status_map = {}
        for member_id, doc_status in status_rows:
            status_map.setdefault(member_id, []).append(doc_status)
        docs_statuses = {
            member_id: _document_status_from_statuses(status_map.get(member_id, []))
            for member_id in member_ids
        }

    payments_latest = {}
    if member_ids:
        pay_rows = (
            db.query(MemberPayment.member_id, func.max(MemberPayment.paid_at))
            .filter(MemberPayment.member_id.in_(member_ids))
            .group_by(MemberPayment.member_id)
            .all()
        )
        payments_latest = {r[0]: r[1] for r in pay_rows}
    membership_latest = {}
    if member_ids:
        membership_rows = (
            db.query(MembershipPayment.socio_id, func.max(MembershipPayment.confirmed_at))
            .filter(
                MembershipPayment.socio_id.in_(member_ids),
                MembershipPayment.status.in_(list(PAID_MEMBERSHIP_STATUSES)),
            )
            .group_by(MembershipPayment.socio_id)
            .all()
        )
        membership_latest = {r[0]: r[1] for r in membership_rows}

    summary_row = (
        db.query(
            func.coalesce(func.sum(Member.membership_fee_snapshot), 0),
            func.count(Member.id),
        )
        .filter(
            Member.org_id == admin.org_id,
            Member.deleted_at.is_(None),
            Member.card_no.isnot(None),
            Member.card_year.isnot(None),
        )
        .one()
    )
    summary_total = summary_row[0]
    summary_issued_count = int(summary_row[1] or 0)

    return {
        "items": [
            {
                "id": m.id,
                "name": f"{m.first_name} {m.last_name}",
                "email": m.email,
                "status": get_member_lifecycle_status(m, now=current_time),
                "workflow_status": m.status.value if m.status else None,
                "is_active": is_member_active(m, now=current_time),
                "deleted_at": m.deleted_at.isoformat() if m.deleted_at else None,
                "card_no": m.card_no,
                "card_number": m.card_no,
                "card_year": m.card_year,
                "membership_type": resolve_member_membership_type(m),
                "membership_type_label": membership_type_label(
                    resolve_member_membership_type(m)
                ),
                "valid_from": (
                    resolve_member_valid_from(m).isoformat()
                    if resolve_member_valid_from(m)
                    else None
                ),
                "valid_until": (
                    resolve_member_valid_until(m).isoformat()
                    if resolve_member_valid_until(m)
                    else None
                ),
                "membership_fee_snapshot": membership_amount_to_float(
                    getattr(m, "membership_fee_snapshot", None)
                ),
                "joined_at": m.joined_at.isoformat() if m.joined_at else None,
                "created_at": m.joined_at.isoformat()
                if m.joined_at
                else None,  # fallback if no created_at
                "docs_count": docs_counts.get(m.id, 0),
                "document_status": docs_statuses.get(m.id, "not_provided"),
                "is_paid": bool(
                    payment_status_is_paid(m.payment_status) or m.id in payments_latest
                ),
                "last_payment_at": (
                    membership_latest.get(m.id)
                    or payments_latest.get(m.id)
                    or m.payment_completed_at
                ).isoformat()
                if (
                    membership_latest.get(m.id)
                    or payments_latest.get(m.id)
                    or m.payment_completed_at
                )
                else None,
                "has_access": bool(m.password_hash),
                "is_manual": bool(m.is_manual),
                "signup_source": m.signup_source,
                "external_customer_id": m.external_customer_id,
            }
            for m in members
        ],
        "total": total,
        "summary": {
            "total_theoretical_membership_fees": membership_amount_to_float(summary_total)
            or 0.0,
            "issued_members_count": summary_issued_count,
        },
    }


@router.post("/members")
def create_org_member(
    request: Request,
    body: CreateMemberBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    first_name = body.first_name.strip()
    last_name = body.last_name.strip()
    if not first_name or not last_name:
        raise HTTPException(status_code=400, detail="Nome e cognome sono obbligatori.")

    email = body.email.strip() if body.email else None
    if email == "":
        email = None
    phone = body.phone.strip() if body.phone else None
    if phone == "":
        phone = None
    fiscal_code = body.fiscal_code.strip() if body.fiscal_code else None
    if fiscal_code == "":
        fiscal_code = None
    member_type = body.member_type.strip() if body.member_type else None
    if member_type == "":
        member_type = None
    membership_type = normalize_membership_type(body.membership_type)
    if (
        membership_type == "temporary"
        and not organization_allows_custom_membership_types(admin.organization)
    ):
        raise HTTPException(
            status_code=400,
            detail="La tessera temporanea non e abilitata per la tua associazione.",
        )
    internal_notes = body.internal_notes.strip() if body.internal_notes else None
    if internal_notes == "":
        internal_notes = None
    payment_method = _normalize_member_payment_method(body.payment_method)

    if email:
        existing = (
            db.query(Member)
            .filter(
                func.lower(Member.email) == email.lower(),
                Member.org_id == admin.org_id,
                Member.deleted_at.is_(None),
                Member.status != MemberStatus.REJECTED,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=400, detail="Esiste già un socio con questa email."
            )

    if body.send_access_email and not email:
        raise HTTPException(
            status_code=400, detail="L'email è obbligatoria per inviare l'accesso."
        )

    joined_at_date = body.joined_at or datetime.utcnow().date()
    joined_at = datetime.combine(joined_at_date, datetime.min.time())

    member = Member(
        org_id=admin.org_id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=phone,
        fiscal_code=fiscal_code,
        payment_method=payment_method,
        status=MemberStatus.PENDING_DOCS,
        joined_at=joined_at,
        member_type=member_type,
        internal_notes=internal_notes,
        is_manual=body.is_manual,
        signup_source=SignupSource.ADMIN.value,
        signup_ip=get_client_ip(request),
        signup_user_agent=request.headers.get("user-agent"),
    )

    db.add(member)
    db.flush()
    apply_membership_defaults(
        member=member,
        org=admin.organization,
        membership_type=membership_type,
        reference_time=joined_at,
        membership_fee_snapshot=body.membership_fee_snapshot,
    )

    email_sent = False
    email_status = "not_requested"
    access_email_sent_at = None
    if body.send_access_email and email:
        _outbox_id, access_email_sent_at = _send_member_magic_link(db, request, member)
        email_status = "queued"

    audit.log_operation(
        db,
        action="member.manual_create",
        entity_type="member",
        entity_id=member.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        metadata={
            "org_id": admin.org_id,
            "email_sent": email_sent,
            "email_status": email_status,
            "is_manual": member.is_manual,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "id": member.id,
        "first_name": member.first_name,
        "last_name": member.last_name,
        "email": member.email,
        "phone": member.phone,
        "fiscal_code": member.fiscal_code,
        "payment_method": _serialize_member_payment_method(member.payment_method),
        "status": member.status.value if member.status else None,
        "joined_at": member.joined_at.isoformat() if member.joined_at else None,
        "member_type": member.member_type,
        "membership_type": resolve_member_membership_type(member),
        "membership_type_label": membership_type_label(
            resolve_member_membership_type(member)
        ),
        "valid_from": (
            resolve_member_valid_from(member).isoformat()
            if resolve_member_valid_from(member)
            else None
        ),
        "valid_until": (
            resolve_member_valid_until(member).isoformat()
            if resolve_member_valid_until(member)
            else None
        ),
        "membership_fee_snapshot": membership_amount_to_float(
            getattr(member, "membership_fee_snapshot", None)
        ),
        "internal_notes": member.internal_notes,
        "is_manual": member.is_manual,
        "email_sent": email_sent,
        "email_status": email_status,
        "access_email_sent_at": access_email_sent_at.isoformat()
        if access_email_sent_at
        else None,
    }


@router.get("/members/{member_id}")
def get_member_detail(
    request: Request,
    member_id: int,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    member = _get_org_admin_member_or_404(
        db=db,
        admin=admin,
        member_id=member_id,
    )
    return _build_org_member_detail_payload(
        db=db,
        admin=admin,
        member=member,
        request=request,
    )


@router.patch("/members/{member_id}/profile")
def update_member_profile(
    request: Request,
    member_id: int,
    body: UpdateMemberProfileBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    member = _get_org_admin_member_or_404(
        db=db,
        admin=admin,
        member_id=member_id,
        include_deleted=False,
    )

    first_name = body.first_name.strip()
    last_name = body.last_name.strip()
    if not first_name or not last_name:
        raise HTTPException(status_code=422, detail="Nome e cognome sono obbligatori.")

    email = _validate_optional_email(body.email, field_name="Email")
    phone = _normalize_optional_text(body.phone)
    fiscal_code = _normalize_optional_text(body.fiscal_code)
    if fiscal_code:
        fiscal_validation = validate_fiscal_code(fiscal_code=fiscal_code)
        if not fiscal_validation.is_formally_valid:
            raise HTTPException(
                status_code=422,
                detail="Codice fiscale non valido. Verifica formato e checksum.",
            )
        fiscal_code = fiscal_validation.normalized

    birth_date = _parse_optional_birth_date(body.birth_date)
    birth_place, birth_place_code = _normalize_member_identity_document_fields(
        birth_place=body.birth_place,
        birth_place_code=body.birth_place_code,
    )
    internal_notes = _normalize_optional_text(body.internal_notes)
    membership_type = normalize_membership_type(body.membership_type)
    if (
        membership_type == "temporary"
        and not organization_allows_custom_membership_types(admin.organization)
    ):
        raise HTTPException(
            status_code=400,
            detail="La tessera temporanea non e abilitata per la tua associazione.",
        )
    membership_fee_snapshot = (
        quantize_membership_amount(body.membership_fee_snapshot)
        if body.membership_fee_snapshot is not None
        else None
    )

    if email:
        existing = (
            db.query(Member)
            .filter(
                Member.id != member.id,
                func.lower(Member.email) == email.lower(),
                Member.org_id == admin.org_id,
                Member.deleted_at.is_(None),
                Member.status != MemberStatus.REJECTED,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail="Esiste già un socio con questa email per la tua associazione.",
            )

    changed_fields: list[str] = []

    def apply_change(field_name: str, new_value):
        current_value = getattr(member, field_name)
        if current_value != new_value:
            setattr(member, field_name, new_value)
            changed_fields.append(field_name)

    apply_change("first_name", first_name)
    apply_change("last_name", last_name)
    apply_change("email", email)
    apply_change("phone", phone)
    apply_change("birth_date", birth_date)
    apply_change("birth_place", birth_place)
    apply_change("birth_place_code", birth_place_code)
    apply_change("fiscal_code", fiscal_code)
    apply_change("internal_notes", internal_notes)

    current_membership_type = resolve_member_membership_type(member)
    if body.membership_type is not None and current_membership_type != membership_type:
        apply_membership_defaults(
            member=member,
            org=admin.organization,
            membership_type=membership_type,
            reference_time=member.joined_at or datetime.utcnow(),
            membership_fee_snapshot=membership_fee_snapshot,
        )
        changed_fields.extend(["membership_type", "valid_from", "valid_until", "membership_fee_snapshot"])
    elif membership_fee_snapshot is not None and member.membership_fee_snapshot != membership_fee_snapshot:
        member.membership_fee_snapshot = membership_fee_snapshot
        changed_fields.append("membership_fee_snapshot")

    if not changed_fields:
        return _build_org_member_detail_payload(
            db=db,
            admin=admin,
            member=member,
            request=request,
        )

    db.flush()
    audit.log_operation(
        db,
        action="member.update",
        entity_type="member",
        entity_id=member.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        metadata={
            "org_id": admin.org_id,
            "fields": changed_fields,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(member)

    return _build_org_member_detail_payload(
        db=db,
        admin=admin,
        member=member,
        request=request,
    )


@router.post("/members/{member_id}/card-email")
def send_member_card_email(
    request: Request,
    member_id: int,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    member = _get_org_admin_member_or_404(
        db=db,
        admin=admin,
        member_id=member_id,
        include_deleted=False,
    )
    result = queue_member_card_email(
        db,
        request,
        member.id,
        require_active=True,
        require_approved_document=False,
    )

    if not result.get("queued"):
        reason = result.get("reason")
        if reason == "member_email_missing":
            raise HTTPException(
                status_code=400,
                detail="Il socio non ha un'email valida salvata in anagrafica.",
            )
        if reason == "card_missing":
            raise HTTPException(
                status_code=409,
                detail="Tessera non disponibile per questo socio.",
            )
        if reason == "member_not_active":
            raise HTTPException(
                status_code=409,
                detail="La tessera può essere inviata solo a soci con tessera attiva.",
            )
        raise HTTPException(
            status_code=500,
            detail="Errore durante la preparazione dell'email tessera.",
        )

    audit.log_operation(
        db,
        action="member.card_email.manual",
        entity_type="member",
        entity_id=member.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        metadata={
            "org_id": admin.org_id,
            "outbox_id": result.get("outbox_id"),
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "ok": True,
        "queued": True,
        "outbox_id": result.get("outbox_id"),
    }


@router.get("/members/{member_id}/card.pdf")
def download_member_card_pdf(
    request: Request,
    member_id: int,
    disposition: str = Query(default="attachment"),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    member = _get_org_admin_member_or_404(
        db=db,
        admin=admin,
        member_id=member_id,
        include_deleted=False,
    )
    pdf_bytes = _member_card_pdf_bytes(member, request)
    safe_slug = ((member.organization.slug if member.organization else "assonam") or "assonam").replace("/", "_")
    filename = f"tessera_{safe_slug}_{member.card_year}_{member.card_no}.pdf"
    content_disposition = "inline" if disposition == "inline" else "attachment"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'{content_disposition}; filename="{filename}"',
        },
    )


@router.get("/members/{member_id}/documents/{doc_id}")
def download_member_document(
    request: Request,
    member_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    doc = db.query(MemberDocument).filter(MemberDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.member_id != member_id:
        raise HTTPException(
            status_code=404, detail="Document not found for this member"
        )

    # Check ownership via member
    if doc.member.org_id != admin.org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    full_path = os.path.join(settings.UPLOAD_DIR, doc.rel_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File missing on disk")

    return FileResponse(
        full_path,
        filename=doc.original_filename,
        media_type=doc.mime_type or "application/octet-stream",
        content_disposition_type="attachment",
    )


@router.get("/documents/{doc_id}")
def download_document(
    request: Request,
    doc_id: int,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    doc = db.query(MemberDocument).filter(MemberDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Check ownership via member
    if doc.member.org_id != admin.org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    full_path = os.path.join(settings.UPLOAD_DIR, doc.rel_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File missing on disk")

    return FileResponse(
        full_path, filename=doc.original_filename, content_disposition_type="attachment"
    )


class MemberDecisionBody(BaseModel):
    decision: str
    notes: Optional[str] = None


class ManualPaymentBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: float = Field(..., gt=0)
    method: str
    paid_at: date
    notes: Optional[str] = None


@router.post("/members/{member_id}/send-access")
def send_member_access(
    request: Request,
    member_id: int,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    member = (
        db.query(Member)
        .filter(
            Member.id == member_id,
            Member.org_id == admin.org_id,
            Member.deleted_at.is_(None),
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if not is_member_active(member, now=datetime.utcnow()):
        raise HTTPException(status_code=403, detail="account non attivo")

    if not member.email:
        raise HTTPException(
            status_code=400, detail="Inserisci email per inviare accesso."
        )

    if member.password_hash:
        raise HTTPException(
            status_code=400, detail="Accesso già attivo per questo socio."
        )

    last_token = _get_last_access_email_token(db, member.id)
    if last_token and last_token.created_at:
        elapsed = datetime.utcnow() - last_token.created_at
        if elapsed < timedelta(minutes=ACCESS_EMAIL_THROTTLE_MINUTES):
            remaining_seconds = int(
                timedelta(minutes=ACCESS_EMAIL_THROTTLE_MINUTES).total_seconds()
                - elapsed.total_seconds()
            )
            remaining_minutes = max(1, int((remaining_seconds + 59) // 60))
            raise HTTPException(
                status_code=429,
                detail=f"Accesso inviato di recente. Riprova tra {remaining_minutes} minuti.",
            )

    _outbox_id, sent_at = _send_member_magic_link(db, request, member)
    email_sent = False
    email_status = "queued"

    audit.log_operation(
        db,
        action="member.access_sent",
        entity_type="member",
        entity_id=member.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        metadata={
            "org_id": admin.org_id,
            "email_sent": email_sent,
            "email_status": email_status,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "ok": True,
        "email_sent": email_sent,
        "email_status": email_status,
        "last_access_email_at": sent_at.isoformat() if sent_at else None,
    }


@router.post("/members/{member_id}/decision")
def member_decision(
    request: Request,
    member_id: int,
    body: MemberDecisionBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if body.decision not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="Invalid decision")

    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if member.org_id != admin.org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    org = member.organization or db.query(Organization).filter(Organization.id == member.org_id).first()
    requires_payment = organization_requires_membership_payment(org)

    # Apply decision
    if body.decision == "approve":
        if requires_payment and not payment_status_is_paid(member.payment_status):
            member.status = MemberStatus.PENDING_CARDS
        else:
            fulfillment = maybe_fulfill_member_card(
                db=db,
                member=member,
                org=org,
                request=None,
            )
            if not fulfillment.issued_card and fulfillment.reason == "card_stock_exhausted":
                member.status = MemberStatus.PENDING_CARDS
    else:
        member.status = MemberStatus.REJECTED

    member.decision_at = datetime.utcnow()
    member.decision_by_admin_id = admin.id
    member.decision_notes = body.notes

    db.commit()

    audit.log_operation(
        db,
        action="member.decision",
        entity_type="member",
        entity_id=member.id,
        actor_admin_id=admin.id,
        actor_role="org_admin",
        metadata={
            "decision": body.decision,
            "notes": body.notes,
            "new_status": member.status.value,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    if body.decision == "approve" and member.status == MemberStatus.ACTIVE:
        try:
            maybe_send_member_card_ready_email(db, request, member.id)
        except Exception:
            logger.exception(
                "Failed card email hook after member approval for member_id=%s",
                member.id,
            )

    return {"ok": True, "status": member.status.value}


@router.post("/members/{member_id}/payments/manual")
def create_manual_payment(
    request: Request,
    member_id: int,
    body: ManualPaymentBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if member.org_id != admin.org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    method = body.method.strip().lower()
    if method not in {
        "contanti",
        "bonifico",
        "altro",
        "cash",
        "bank_transfer",
        "other",
    }:
        raise HTTPException(status_code=400, detail="Metodo di pagamento non valido.")

    amount_cents = int(round(body.amount * 100))
    if amount_cents <= 0:
        raise HTTPException(status_code=400, detail="Importo non valido.")

    paid_at = datetime.combine(body.paid_at, datetime.min.time())
    notes = body.notes.strip() if body.notes else None
    if notes == "":
        notes = None

    org = member.organization or db.query(Organization).filter(Organization.id == member.org_id).first()
    requires_membership_payment = organization_requires_membership_payment(org)
    amount_decimal = Decimal(str(body.amount))
    if (
        not requires_membership_payment
        and not member.decision_at
        and member.status != MemberStatus.REJECTED
    ):
        member.decision_at = datetime.utcnow()
        member.decision_by_admin_id = admin.id
        if not member.decision_notes:
            member.decision_notes = "Pagamento manuale"
    legacy_payment = create_legacy_manual_member_payment(
        db=db,
        member=member,
        org=org,
        admin_id=admin.id,
        amount=amount_decimal,
        method=method,
        notes=notes,
    )
    membership_payment, fulfillment, _created = apply_manual_membership_payment(
        db=db,
        member=member,
        org=org,
        admin_id=admin.id,
        amount=amount_decimal,
        currency=(org.membership_fee_currency or "EUR") if org else "EUR",
        reason=normalize_membership_payment_reason(org) if org else "Quota associativa",
        notes=notes,
        request=None,
    )
    if not member.decision_at and member.status != MemberStatus.REJECTED:
        member.decision_at = datetime.utcnow()
        member.decision_by_admin_id = admin.id
        if not member.decision_notes:
            member.decision_notes = "Pagamento manuale"

    db.commit()
    db.refresh(legacy_payment)
    db.refresh(member)

    audit.log_operation(
        db,
        action="member.payment.manual",
        entity_type="member_payment",
        entity_id=legacy_payment.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        metadata={
            "org_id": admin.org_id,
            "member_id": member.id,
            "amount_cents": amount_cents,
            "method": method,
            "paid_at": paid_at.isoformat(),
            "membership_payment_id": membership_payment.id,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    audit.log_operation(
        db,
        action="member.payment.membership_manual",
        entity_type="membership_payment",
        entity_id=membership_payment.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        metadata={
            "org_id": admin.org_id,
            "member_id": member.id,
            "status": membership_payment.status,
            "source": membership_payment.source,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    if fulfillment.issued_card:
        try:
            maybe_send_member_card_ready_email(db, request, member.id)
        except Exception:
            logger.exception(
                "Failed card email hook after manual payment for member_id=%s",
                member.id,
            )

    return {
        "ok": True,
        "payment": {
            "id": legacy_payment.id,
            "amount_cents": legacy_payment.amount_cents,
            "amount": round(legacy_payment.amount_cents / 100, 2),
            "method": legacy_payment.method,
            "paid_at": legacy_payment.paid_at.isoformat() if legacy_payment.paid_at else None,
            "notes": legacy_payment.notes,
        },
        "member_status": member.status.value if member.status else None,
        "card_assigned": fulfillment.issued_card,
        "membership_payment": {
            "id": membership_payment.id,
            "status": membership_payment.status,
            "source": membership_payment.source,
            "amount": float(membership_payment.amount),
            "currency": membership_payment.currency,
            "payment_reason": membership_payment.payment_reason,
            "confirmed_at": membership_payment.confirmed_at.isoformat()
            if membership_payment.confirmed_at
            else None,
            "notes": membership_payment.notes,
        },
    }


@router.delete("/members/{member_id}")
def delete_member(
    request: Request,
    member_id: int,
    db: Session = Depends(get_db),
):
    """
    Delete (soft-delete) a member.
    Revokes access immediately.
    """
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if member.org_id != admin.org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    now = datetime.utcnow()
    released_card_no = member.card_no
    released_card_year = member.card_year
    released_batch_id = member.batch_id
    release_card_number(
        db,
        org_id=member.org_id,
        year=released_card_year,
        card_no=released_card_no,
        batch_id=released_batch_id,
    )
    member.deleted_at = now
    member.deleted_by_admin_id = admin.id
    member.status = MemberStatus.REJECTED
    member.decision_at = now
    member.decision_by_admin_id = admin.id
    # Purge key identifiers so the member can be re-created later if needed.
    member.email = None
    member.phone = None
    member.fiscal_code = None
    member.birth_date = None
    member.birth_place = None
    member.birth_place_code = None
    member.gender = None
    member.password_hash = None
    member.card_no = None
    member.card_year = None
    member.batch_id = None
    member.numbering_scope_id = None
    member.external_customer_id = None
    if not member.decision_notes:
        member.decision_notes = "Disattivato da amministratore"

    db.commit()

    audit.log_operation(
        db,
        action="member.delete",
        entity_type="member",
        entity_id=member.id,
        actor_admin_id=admin.id,
        actor_role="org_admin",
        metadata={"email": member.email, "released_card_no": released_card_no},
        ip=get_client_ip(request),
    )
    db.commit()

    return {"ok": True}


class ReviewBody(BaseModel):
    status: str
    notes: Optional[str] = None


class RejectBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rejection_note: str


def _apply_doc_review(
    db: Session,
    request: Request,
    admin: AdminUser,
    doc: MemberDocument,
    status: str,
    rejection_note: Optional[str] = None,
):
    doc.status = status
    doc.reviewed_at = datetime.utcnow()
    doc.reviewed_by = admin.id
    doc.reviewed_by_admin_id = admin.id
    if status == DocStatus.REJECTED.value:
        doc.rejection_note = rejection_note
        doc.review_notes = rejection_note
    else:
        doc.rejection_note = None
    db.commit()

    audit.log_operation(
        db,
        action="member_doc.review",
        entity_type="member_document",
        entity_id=doc.id,
        actor_admin_id=admin.id,
        actor_role="org_admin",
        metadata={
            "status": status,
            "rejection_note": rejection_note,
            "member_id": doc.member_id,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    if status == DocStatus.APPROVED.value:
        try:
            maybe_send_member_card_ready_email(db, request, doc.member_id)
        except Exception:
            logger.exception(
                "Failed post-verification card email hook for member_id=%s doc_id=%s",
                doc.member_id,
                doc.id,
            )


@router.post("/documents/{doc_id}/approve")
def approve_document(
    request: Request,
    doc_id: int,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    doc = db.query(MemberDocument).filter(MemberDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.member.org_id != admin.org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    _apply_doc_review(db, request, admin, doc, DocStatus.APPROVED.value)

    return {
        "ok": True,
        "doc_status": doc.status,
        "member_status": doc.member.status.value,
    }


@router.post("/documents/{doc_id}/reject")
def reject_document(
    request: Request,
    doc_id: int,
    body: RejectBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    note = body.rejection_note.strip() if body.rejection_note else ""
    if not note:
        raise HTTPException(
            status_code=400, detail="La nota di rigetto è obbligatoria."
        )

    doc = db.query(MemberDocument).filter(MemberDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.member.org_id != admin.org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    _apply_doc_review(
        db, request, admin, doc, DocStatus.REJECTED.value, rejection_note=note
    )

    return {
        "ok": True,
        "doc_status": doc.status,
        "member_status": doc.member.status.value,
    }


@router.post("/documents/{doc_id}/review")
def review_document(
    request: Request,
    doc_id: int,
    body: ReviewBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if body.status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    doc = db.query(MemberDocument).filter(MemberDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.member.org_id != admin.org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if body.status == "rejected":
        note = body.notes.strip() if body.notes else ""
        if not note:
            raise HTTPException(
                status_code=400, detail="La nota di rigetto è obbligatoria."
            )
        _apply_doc_review(
            db, request, admin, doc, DocStatus.REJECTED.value, rejection_note=note
        )
    else:
        _apply_doc_review(db, request, admin, doc, DocStatus.APPROVED.value)

    return {
        "ok": True,
        "doc_status": doc.status,
        "member_status": doc.member.status.value,
    }


@router.get("/members.csv")
def export_members_csv(
    request: Request,
    db: Session = Depends(get_db),
):
    """Export all members as CSV, scoped to the org admin's organization."""
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    now = datetime.utcnow()
    pending_statuses = [
        MemberStatus.PENDING_VERIFICATION,
        MemberStatus.PENDING_DOCS,
        MemberStatus.PENDING_CARDS,
    ]
    active_filters = member_active_filters(now=now)

    members = (
        db.query(Member)
        .filter(
            Member.org_id == admin.org_id,
            Member.deleted_at.is_(None),
            or_(
                and_(*active_filters),
                Member.status.in_(pending_statuses),
            ),
        )
        .order_by(Member.last_name, Member.first_name)
        .all()
    )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "Nome",
            "Cognome",
            "Email",
            "Codice Fiscale",
            "Telefono",
            "Stato",
            "Tessera",
            "Data iscrizione",
        ]
    )
    for m in members:
        writer.writerow(
            [
                m.first_name or "",
                m.last_name or "",
                m.email or "",
                m.fiscal_code or "",
                m.phone or "",
                m.status.value if m.status else "",
                m.card_no if m.card_no is not None else "",
                m.joined_at.strftime("%Y-%m-%d") if m.joined_at else "",
            ]
        )

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=soci.csv"},
    )


@router.get("/cards")
def card_stock(request: Request, db: Session = Depends(get_db)):
    """Return card stock summary scoped to the org admin's organization."""
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return _compute_org_card_stock(db, admin.org_id, now=datetime.utcnow())


@router.get("/cards/movements")
def card_movements(
    request: Request,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Return current-year card lots assigned by ASSONAM for the org admin."""
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    current_year = int(datetime.utcnow().year)
    query = db.query(CardBatch).filter(
        CardBatch.org_id == admin.org_id,
        CardBatch.year == current_year,
        CardBatch.released_at.is_(None),
    )
    total = query.count()
    batches = (
        query.order_by(CardBatch.created_at.desc(), CardBatch.id.desc())
        .offset(offset)
        .limit(min(limit, 100))
        .all()
    )

    return {
        "items": [_serialize_org_admin_card_lot(batch) for batch in batches],
        "total": total,
        "current_year": current_year,
    }


@router.get("/forms")
def list_association_forms(
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)

    forms = (
        db.query(AssociationForm)
        .options(
            joinedload(AssociationForm.fields),
            joinedload(AssociationForm.submissions),
            joinedload(AssociationForm.admin_notification_template),
            joinedload(AssociationForm.user_confirmation_template),
            joinedload(AssociationForm.bookings),
        )
        .filter(AssociationForm.association_id == admin.org_id)
        .order_by(AssociationForm.updated_at.desc(), AssociationForm.id.desc())
        .all()
    )
    return {
        "items": [serialize_form(form) for form in forms],
        "total": len(forms),
        "field_types": sorted(ALLOWED_FORM_FIELD_TYPES),
        "visibility_options": sorted(ALLOWED_FORM_VISIBILITY),
    }


@router.post("/forms", status_code=201)
def create_association_form(
    body: CreateAssociationFormBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)

    form = AssociationForm(
        association_id=admin.org_id,
        created_by_user_id=admin.id,
    )
    requested_slug = body.public_slug or body.title
    form.public_slug = build_unique_form_slug(db, base_slug=requested_slug)
    apply_form_updates(
        db,
        form=form,
        title=body.title,
        description=body.description,
        accent_color=body.accent_color,
        submit_button_text=body.submit_button_text,
        show_logo=body.show_logo,
        cover_image_url=body.cover_image_url,
        page_style=body.page_style,
        public_slug=form.public_slug,
        is_active=body.is_active,
        visibility=body.visibility,
        success_message=body.success_message,
        notification_email=body.notification_email,
        allow_multiple_submissions=body.allow_multiple_submissions,
        form_type=body.form_type,
        booking_enabled=body.booking_enabled,
        booking_requires_manual_confirmation=body.booking_requires_manual_confirmation,
        booking_success_message_override=body.booking_success_message_override,
        booking_notification_enabled=body.booking_notification_enabled,
        booking_auto_assign_enabled=body.booking_auto_assign_enabled,
        booking_field_mapping=body.booking_field_mapping,
        notify_admin_on_submit=body.notify_admin_on_submit,
        send_user_confirmation=body.send_user_confirmation,
        whatsapp_auto_reply_enabled=body.whatsapp_auto_reply_enabled,
        whatsapp_auto_reply_template=body.whatsapp_auto_reply_template,
        whatsapp_confirmation_template=body.whatsapp_confirmation_template,
        whatsapp_rejection_template=body.whatsapp_rejection_template,
        admin_notification_template_id=body.admin_notification_template_id,
        user_confirmation_template_id=body.user_confirmation_template_id,
        create_internal_request=body.create_internal_request,
        create_booking=body.create_booking,
    )
    db.add(form)
    db.commit()
    db.refresh(form)
    return {"form": serialize_form(get_form_for_org_admin(db, association_id=admin.org_id, form_id=form.id))}


@router.get("/forms/{form_id}")
def get_association_form_detail(
    form_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    form = get_form_for_org_admin(db, association_id=admin.org_id, form_id=form_id)
    return {"form": serialize_form(form)}


@router.put("/forms/{form_id}")
def update_association_form(
    form_id: int,
    body: UpdateAssociationFormBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    form = get_form_for_org_admin(db, association_id=admin.org_id, form_id=form_id)
    apply_form_updates(
        db,
        form=form,
        title=body.title,
        description=body.description,
        accent_color=body.accent_color,
        submit_button_text=body.submit_button_text,
        show_logo=body.show_logo,
        cover_image_url=body.cover_image_url,
        page_style=body.page_style,
        public_slug=body.public_slug or body.title,
        is_active=body.is_active,
        visibility=body.visibility,
        success_message=body.success_message,
        notification_email=body.notification_email,
        allow_multiple_submissions=body.allow_multiple_submissions,
        form_type=body.form_type,
        booking_enabled=body.booking_enabled,
        booking_requires_manual_confirmation=body.booking_requires_manual_confirmation,
        booking_success_message_override=body.booking_success_message_override,
        booking_notification_enabled=body.booking_notification_enabled,
        booking_auto_assign_enabled=body.booking_auto_assign_enabled,
        booking_field_mapping=body.booking_field_mapping,
        notify_admin_on_submit=body.notify_admin_on_submit,
        send_user_confirmation=body.send_user_confirmation,
        whatsapp_auto_reply_enabled=body.whatsapp_auto_reply_enabled,
        whatsapp_auto_reply_template=body.whatsapp_auto_reply_template,
        whatsapp_confirmation_template=body.whatsapp_confirmation_template,
        whatsapp_rejection_template=body.whatsapp_rejection_template,
        admin_notification_template_id=body.admin_notification_template_id,
        user_confirmation_template_id=body.user_confirmation_template_id,
        create_internal_request=body.create_internal_request,
        create_booking=body.create_booking,
    )
    db.commit()
    db.refresh(form)
    return {"form": serialize_form(get_form_for_org_admin(db, association_id=admin.org_id, form_id=form.id))}


@router.delete("/forms/{form_id}")
def delete_association_form(
    form_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    form = get_form_for_org_admin(db, association_id=admin.org_id, form_id=form_id)
    db.delete(form)
    db.commit()
    return {"ok": True}


@router.post("/forms/{form_id}/duplicate", status_code=201)
def duplicate_association_form(
    form_id: int,
    body: DuplicateAssociationFormBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    source_form = get_form_for_org_admin(db, association_id=admin.org_id, form_id=form_id)
    duplicate_title = (body.title or f"{source_form.title} copia").strip()
    duplicate_slug = build_unique_form_slug(
        db,
        base_slug=body.public_slug or f"{source_form.public_slug}-copy",
    )
    cloned_form = AssociationForm(
        association_id=admin.org_id,
        title=duplicate_title,
        description=source_form.description,
        accent_color=source_form.accent_color,
        submit_button_text=source_form.submit_button_text,
        show_logo=bool(source_form.show_logo),
        cover_image_url=source_form.cover_image_url,
        page_style=source_form.page_style,
        public_slug=duplicate_slug,
        is_active=False,
        visibility=source_form.visibility,
        success_message=source_form.success_message,
        notification_email=source_form.notification_email,
        allow_multiple_submissions=bool(source_form.allow_multiple_submissions),
        form_type=getattr(source_form, "form_type", "generic"),
        booking_enabled=bool(getattr(source_form, "booking_enabled", False) or source_form.create_booking),
        booking_requires_manual_confirmation=bool(
            getattr(source_form, "booking_requires_manual_confirmation", True)
        ),
        booking_success_message_override=getattr(source_form, "booking_success_message_override", None),
        booking_notification_enabled=bool(getattr(source_form, "booking_notification_enabled", True)),
        booking_field_mapping=getattr(source_form, "booking_field_mapping", None) or {},
        notify_admin_on_submit=bool(source_form.notify_admin_on_submit),
        send_user_confirmation=bool(source_form.send_user_confirmation),
        whatsapp_auto_reply_enabled=bool(getattr(source_form, "whatsapp_auto_reply_enabled", False)),
        whatsapp_auto_reply_template=getattr(source_form, "whatsapp_auto_reply_template", None),
        whatsapp_confirmation_template=getattr(source_form, "whatsapp_confirmation_template", None),
        whatsapp_rejection_template=getattr(source_form, "whatsapp_rejection_template", None),
        admin_notification_template_id=source_form.admin_notification_template_id,
        user_confirmation_template_id=source_form.user_confirmation_template_id,
        create_internal_request=bool(source_form.create_internal_request),
        create_booking=bool(source_form.create_booking),
        created_by_user_id=admin.id,
    )
    db.add(cloned_form)
    db.flush()
    for source_field in sorted(
        list(source_form.fields or []),
        key=lambda item: (int(item.sort_order or 0), int(item.id or 0)),
    ):
        cloned_field = FormField(form_id=cloned_form.id)
        apply_form_field_updates(
            cloned_field,
            field_key=source_field.field_key,
            field_type=source_field.field_type,
            label=source_field.label,
            placeholder=source_field.placeholder,
            help_text=source_field.help_text,
            is_required=bool(source_field.is_required),
            sort_order=int(source_field.sort_order or 0),
            options=list(source_field.options_json or []),
        )
        db.add(cloned_field)
    db.commit()
    return {
        "form": serialize_form(
            get_form_for_org_admin(db, association_id=admin.org_id, form_id=cloned_form.id)
        )
    }


@router.post("/forms/{form_id}/activate")
def activate_association_form(
    form_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    form = get_form_for_org_admin(db, association_id=admin.org_id, form_id=form_id)
    form.is_active = True
    db.commit()
    db.refresh(form)
    return {"form": serialize_form(get_form_for_org_admin(db, association_id=admin.org_id, form_id=form.id))}


@router.post("/forms/{form_id}/deactivate")
def deactivate_association_form(
    form_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    form = get_form_for_org_admin(db, association_id=admin.org_id, form_id=form_id)
    form.is_active = False
    db.commit()
    db.refresh(form)
    return {"form": serialize_form(get_form_for_org_admin(db, association_id=admin.org_id, form_id=form.id))}


@router.post("/forms/{form_id}/fields", status_code=201)
def create_association_form_field(
    form_id: int,
    body: UpsertAssociationFormFieldBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    form = get_form_for_org_admin(db, association_id=admin.org_id, form_id=form_id)
    field = FormField(form_id=form.id)
    apply_form_field_updates(
        field,
        field_key=body.field_key,
        field_type=body.field_type,
        label=body.label,
        placeholder=body.placeholder,
        help_text=body.help_text,
        is_required=body.is_required,
        sort_order=body.sort_order,
        options=body.options,
    )
    db.add(field)
    db.commit()
    db.refresh(field)
    return {"field": serialize_form_field(field)}


@router.put("/forms/{form_id}/fields/{field_id}")
def update_association_form_field(
    form_id: int,
    field_id: int,
    body: UpsertAssociationFormFieldBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    get_form_for_org_admin(db, association_id=admin.org_id, form_id=form_id)
    field = (
        db.query(FormField)
        .filter(FormField.id == field_id, FormField.form_id == form_id)
        .first()
    )
    if field is None:
        raise HTTPException(status_code=404, detail="Campo non trovato.")
    apply_form_field_updates(
        field,
        field_key=body.field_key,
        field_type=body.field_type,
        label=body.label,
        placeholder=body.placeholder,
        help_text=body.help_text,
        is_required=body.is_required,
        sort_order=body.sort_order,
        options=body.options,
    )
    db.commit()
    db.refresh(field)
    return {"field": serialize_form_field(field)}


@router.delete("/forms/{form_id}/fields/{field_id}")
def delete_association_form_field(
    form_id: int,
    field_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    get_form_for_org_admin(db, association_id=admin.org_id, form_id=form_id)
    field = (
        db.query(FormField)
        .filter(FormField.id == field_id, FormField.form_id == form_id)
        .first()
    )
    if field is None:
        raise HTTPException(status_code=404, detail="Campo non trovato.")
    db.delete(field)
    db.commit()
    return {"ok": True}


@router.get("/forms/{form_id}/submissions")
def list_association_form_submissions(
    form_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    form = (
        db.query(AssociationForm)
        .options(
            joinedload(AssociationForm.fields),
            joinedload(AssociationForm.submissions).joinedload(FormSubmission.member),
            joinedload(AssociationForm.submissions).joinedload(FormSubmission.bookings),
            joinedload(AssociationForm.submissions).joinedload(FormSubmission.reviewed_by_admin),
            joinedload(AssociationForm.admin_notification_template),
            joinedload(AssociationForm.user_confirmation_template),
            joinedload(AssociationForm.bookings),
        )
        .filter(AssociationForm.id == form_id, AssociationForm.association_id == admin.org_id)
        .first()
    )
    if form is None:
        raise HTTPException(status_code=404, detail="Form non trovato.")
    submissions = sorted(
        list(form.submissions or []),
        key=lambda item: (item.submitted_at or datetime.min, int(item.id or 0)),
        reverse=True,
    )
    return {
        "form": serialize_form(form),
        "items": [serialize_submission(item) for item in submissions],
        "total": len(submissions),
    }


@router.get("/forms/{form_id}/submissions/export.csv")
def export_association_form_submissions_csv(
    form_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    form = (
        db.query(AssociationForm)
        .options(
            joinedload(AssociationForm.fields),
            joinedload(AssociationForm.submissions),
            joinedload(AssociationForm.admin_notification_template),
            joinedload(AssociationForm.user_confirmation_template),
            joinedload(AssociationForm.bookings),
        )
        .filter(AssociationForm.id == form_id, AssociationForm.association_id == admin.org_id)
        .first()
    )
    if form is None:
        raise HTTPException(status_code=404, detail="Form non trovato.")
    csv_buffer = export_submissions_csv(form)
    filename = f"{normalize_form_slug(form.public_slug)}-submissions.csv"
    return StreamingResponse(
        csv_buffer,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/forms/{form_id}/submissions/{submission_id}")
def get_association_form_submission_detail(
    form_id: int,
    submission_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    get_form_for_org_admin(db, association_id=admin.org_id, form_id=form_id)
    submission = (
        db.query(FormSubmission)
        .options(
            joinedload(FormSubmission.member),
            joinedload(FormSubmission.bookings),
            joinedload(FormSubmission.reviewed_by_admin),
        )
        .filter(
            FormSubmission.id == submission_id,
            FormSubmission.form_id == form_id,
            FormSubmission.association_id == admin.org_id,
        )
        .first()
    )
    if submission is None:
        raise HTTPException(status_code=404, detail="Risposta non trovata.")
    return {"submission": serialize_submission(submission)}


@router.patch("/forms/{form_id}/submissions/{submission_id}/status")
def update_association_form_submission_status(
    form_id: int,
    submission_id: int,
    body: UpdateFormSubmissionStatusBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)

    form = (
        db.query(AssociationForm)
        .options(joinedload(AssociationForm.organization))
        .filter(AssociationForm.id == form_id, AssociationForm.association_id == admin.org_id)
        .first()
    )
    if form is None:
        raise HTTPException(status_code=404, detail="Form non trovato.")

    submission = (
        db.query(FormSubmission)
        .options(
            joinedload(FormSubmission.member),
            joinedload(FormSubmission.reviewed_by_admin),
            joinedload(FormSubmission.bookings).joinedload(Booking.form),
            joinedload(FormSubmission.bookings).joinedload(Booking.submission).joinedload(FormSubmission.reviewed_by_admin),
            joinedload(FormSubmission.bookings).joinedload(Booking.room),
            joinedload(FormSubmission.bookings).joinedload(Booking.table),
            joinedload(FormSubmission.bookings).joinedload(Booking.events),
        )
        .filter(
            FormSubmission.id == submission_id,
            FormSubmission.form_id == form_id,
            FormSubmission.association_id == admin.org_id,
        )
        .first()
    )
    if submission is None:
        raise HTTPException(status_code=404, detail="Risposta non trovata.")

    next_status = normalize_submission_status(body.status)
    previous_status = normalize_submission_status(submission.status)
    status_changed = next_status != previous_status
    normalized_reason = _normalize_optional_text(body.reason)
    normalized_whatsapp_message = normalize_form_whatsapp_template(body.whatsapp_message)

    now = datetime.utcnow()
    submission.status = next_status
    if next_status == FORM_SUBMISSION_STATUS_PENDING:
        submission.reviewed_at = None
        submission.reviewed_by_admin_id = None
        submission.review_reason = None
    else:
        submission.reviewed_at = now
        submission.reviewed_by_admin_id = admin.id
        submission.review_reason = (
            normalized_reason if next_status == FORM_SUBMISSION_STATUS_REJECTED else None
        )

    booking = next(iter(submission.bookings or []), None)
    if booking is not None:
        target_booking_status = None
        if next_status == "confirmed":
            target_booking_status = "confirmed"
        elif next_status == FORM_SUBMISSION_STATUS_REJECTED:
            target_booking_status = "cancelled"
        elif next_status == FORM_SUBMISSION_STATUS_PENDING:
            target_booking_status = "pending"
        if target_booking_status:
            update_booking_status(
                db,
                booking=booking,
                next_status=target_booking_status,
                created_by_user_id=admin.id,
                room_id=booking.room_id,
                table_id=booking.table_id,
                notes=booking.notes,
            )

    whatsapp_result: dict[str, object] = {"sent": False, "reason": "unchanged"}
    if status_changed and next_status in {"confirmed", FORM_SUBMISSION_STATUS_REJECTED}:
        try:
            whatsapp_result = maybe_send_form_submission_decision_whatsapp_message(
                db,
                form=form,
                submission=submission,
                member=submission.member,
                booking=booking,
                decision_status=next_status,
                review_reason=submission.review_reason,
                custom_message=normalized_whatsapp_message,
            )
        except Exception as exc:
            logger.exception(
                "submission_review_whatsapp_failed form_id=%s submission_id=%s status=%s",
                form_id,
                submission_id,
                next_status,
            )
            whatsapp_result = {"sent": False, "reason": "exception", "error": str(exc)}

    audit.log_operation(
        db,
        action="form_submission.reviewed",
        entity_type="form_submission",
        entity_id=submission.id,
        actor_admin_id=admin.id,
        actor_role=admin.role.value if isinstance(admin.role, AdminRole) else str(admin.role),
        metadata={
            "form_id": form.id,
            "from_status": previous_status,
            "to_status": next_status,
            "reason": submission.review_reason,
            "whatsapp_message_override": bool(normalized_whatsapp_message),
            "booking_id": booking.id if booking is not None else None,
            "whatsapp_result": whatsapp_result,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    db.commit()
    db.refresh(submission)
    if booking is not None:
        db.refresh(booking)

    return {
        "submission": serialize_submission(submission),
        "booking": serialize_booking(booking, include_events=True) if booking is not None else None,
        "whatsapp_result": whatsapp_result,
    }


@router.get("/rooms")
def list_org_admin_rooms(
    request: Request,
    include_inactive: bool = Query(default=True),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    rooms = list_rooms_for_org_admin(
        db,
        association_id=admin.org_id,
        include_inactive=include_inactive,
    )
    return {"items": [serialize_room(room) for room in rooms], "total": len(rooms)}


@router.post("/rooms", status_code=201)
def create_org_admin_room(
    body: CreateRoomBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    room = Room(association_id=admin.org_id)
    apply_room_updates(room, name=body.name, is_active=body.is_active)
    db.add(room)
    db.commit()
    db.refresh(room)
    return {"room": serialize_room(room)}


@router.get("/rooms/{room_id}")
def get_org_admin_room(
    room_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    room = get_room_for_org_admin(db, association_id=admin.org_id, room_id=room_id)
    return {
        "room": serialize_room(room),
        "tables": [serialize_room_table(table) for table in list(room.tables or [])],
    }


@router.put("/rooms/{room_id}")
def update_org_admin_room(
    room_id: int,
    body: UpdateRoomBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    room = get_room_for_org_admin(db, association_id=admin.org_id, room_id=room_id)
    apply_room_updates(room, name=body.name, is_active=body.is_active)
    db.add(room)
    db.commit()
    db.refresh(room)
    return {"room": serialize_room(room)}


@router.delete("/rooms/{room_id}")
def delete_org_admin_room(
    room_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    room = get_room_for_org_admin(db, association_id=admin.org_id, room_id=room_id)
    table_ids = [table.id for table in list(room.tables or [])]
    (
        db.query(Booking)
        .filter(Booking.association_id == admin.org_id, Booking.room_id == room.id)
        .update({Booking.room_id: None}, synchronize_session=False)
    )
    if table_ids:
        (
            db.query(Booking)
            .filter(Booking.association_id == admin.org_id, Booking.table_id.in_(table_ids))
            .update({Booking.table_id: None}, synchronize_session=False)
        )
    db.delete(room)
    db.commit()
    return {"ok": True, "deleted_room_id": room_id}


@router.get("/rooms/{room_id}/tables")
def list_org_admin_room_tables(
    room_id: int,
    request: Request,
    include_inactive: bool = Query(default=True),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    get_room_for_org_admin(db, association_id=admin.org_id, room_id=room_id)
    tables = list_room_tables_for_org_admin(
        db,
        association_id=admin.org_id,
        room_id=room_id,
        include_inactive=include_inactive,
    )
    return {"items": [serialize_room_table(table) for table in tables], "total": len(tables)}


@router.post("/rooms/{room_id}/tables", status_code=201)
def create_org_admin_room_table(
    room_id: int,
    body: CreateRoomTableBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    get_room_for_org_admin(db, association_id=admin.org_id, room_id=room_id)
    table = RoomTable(association_id=admin.org_id, room_id=room_id)
    apply_room_table_updates(
        table,
        room_id=room_id,
        name=body.name,
        capacity=body.capacity,
        shape=body.shape,
        pos_x=body.pos_x,
        pos_y=body.pos_y,
        width=body.width,
        height=body.height,
        is_active=body.is_active,
        is_out_of_service=body.is_out_of_service,
    )
    db.add(table)
    db.commit()
    db.refresh(table)
    return {"table": serialize_room_table(table)}


@router.get("/tables/{table_id}")
def get_org_admin_room_table(
    table_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    table = get_room_table_for_org_admin(db, association_id=admin.org_id, table_id=table_id)
    return {"table": serialize_room_table(table)}


@router.put("/tables/{table_id}")
def update_org_admin_room_table(
    table_id: int,
    body: UpdateRoomTableBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    get_room_for_org_admin(db, association_id=admin.org_id, room_id=body.room_id)
    table = get_room_table_for_org_admin(db, association_id=admin.org_id, table_id=table_id)
    apply_room_table_updates(
        table,
        room_id=body.room_id,
        name=body.name,
        capacity=body.capacity,
        shape=body.shape,
        pos_x=body.pos_x,
        pos_y=body.pos_y,
        width=body.width,
        height=body.height,
        is_active=body.is_active,
        is_out_of_service=body.is_out_of_service,
    )
    db.add(table)
    db.commit()
    db.refresh(table)
    return {"table": serialize_room_table(table)}


@router.delete("/tables/{table_id}")
def delete_org_admin_room_table(
    table_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    table = get_room_table_for_org_admin(db, association_id=admin.org_id, table_id=table_id)
    (
        db.query(Booking)
        .filter(Booking.association_id == admin.org_id, Booking.table_id == table.id)
        .update({Booking.table_id: None}, synchronize_session=False)
    )
    db.delete(table)
    db.commit()
    return {"ok": True, "deleted_table_id": table_id}


@router.get("/rooms/{room_id}/map")
def get_org_admin_room_map(
    room_id: int,
    request: Request,
    date_value: Optional[date] = Query(default=None, alias="date"),
    time_value: Optional[str] = Query(default=None, alias="time"),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    return room_map_payload(
        db,
        association_id=admin.org_id,
        room_id=room_id,
        focus_date=date_value,
        focus_time=(time_value or "").strip() or None,
    )


@router.put("/rooms/{room_id}/map")
def save_org_admin_room_map(
    room_id: int,
    body: SaveRoomMapBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    tables = update_table_positions(
        db,
        association_id=admin.org_id,
        room_id=room_id,
        positions=body.positions,
    )
    db.commit()
    return {"ok": True, "items": [serialize_room_table(table) for table in tables]}


@router.get("/bookings")
def list_org_admin_bookings(
    request: Request,
    status: Optional[str] = Query(default=None),
    form_id: Optional[int] = Query(default=None),
    booking_date: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    items = list_bookings(
        db,
        association_id=admin.org_id,
        anchor_date=booking_date,
        status=status,
        form_id=form_id,
    )
    return {
        "items": [serialize_booking(item) for item in items],
        "total": len(items),
    }


@router.get("/bookings/agenda/day")
def org_admin_bookings_agenda_day(
    request: Request,
    date_value: Optional[date] = Query(default=None, alias="date"),
    status: Optional[str] = Query(default=None),
    form_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    agenda_date = date_value or datetime.utcnow().date()
    return agenda_day_payload(
        db,
        association_id=admin.org_id,
        agenda_date=agenda_date,
        status=status,
        form_id=form_id,
    )


@router.get("/bookings/agenda/week")
def org_admin_bookings_agenda_week(
    request: Request,
    date_value: Optional[date] = Query(default=None, alias="date"),
    status: Optional[str] = Query(default=None),
    form_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    agenda_date = date_value or datetime.utcnow().date()
    return agenda_week_payload(
        db,
        association_id=admin.org_id,
        agenda_date=agenda_date,
        status=status,
        form_id=form_id,
    )


@router.get("/bookings/{booking_id}")
def get_org_admin_booking_detail(
    booking_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    booking = (
        db.query(Booking)
        .options(
            joinedload(Booking.form),
            joinedload(Booking.submission),
            joinedload(Booking.events),
            joinedload(Booking.room),
            joinedload(Booking.table),
        )
        .filter(
            Booking.id == booking_id,
            Booking.association_id == admin.org_id,
        )
        .first()
    )
    if booking is None:
        raise HTTPException(status_code=404, detail="Prenotazione non trovata.")
    return {"booking": serialize_booking(booking, include_events=True)}


@router.patch("/bookings/{booking_id}")
def patch_org_admin_booking(
    booking_id: int,
    body: UpdateBookingStatusBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    booking = (
        db.query(Booking)
        .options(
            joinedload(Booking.form),
            joinedload(Booking.events),
            joinedload(Booking.submission),
            joinedload(Booking.room),
            joinedload(Booking.table),
        )
        .filter(
            Booking.id == booking_id,
            Booking.association_id == admin.org_id,
        )
        .first()
    )
    if booking is None:
        raise HTTPException(status_code=404, detail="Prenotazione non trovata.")
    update_booking_status(
        db,
        booking=booking,
        next_status=body.status,
        created_by_user_id=admin.id,
        room_id=body.room_id,
        table_id=body.table_id,
        notes=body.notes,
    )
    db.commit()
    db.refresh(booking)
    return {"booking": serialize_booking(booking, include_events=True)}


@router.post("/bookings/{booking_id}/assignment")
def assign_org_admin_booking(
    booking_id: int,
    body: AssignBookingTableBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    booking = (
        db.query(Booking)
        .options(
            joinedload(Booking.form),
            joinedload(Booking.events),
            joinedload(Booking.submission),
            joinedload(Booking.room),
            joinedload(Booking.table),
        )
        .filter(Booking.id == booking_id, Booking.association_id == admin.org_id)
        .first()
    )
    if booking is None:
        raise HTTPException(status_code=404, detail="Prenotazione non trovata.")
    resolved_room, resolved_table = resolve_assignment_targets(
        db,
        association_id=admin.org_id,
        room_id=body.room_id,
        table_id=body.table_id,
    )
    validate_booking_assignment(
        db,
        booking=booking,
        room=resolved_room,
        table=resolved_table,
    )
    update_booking_status(
        db,
        booking=booking,
        next_status=booking.status,
        created_by_user_id=admin.id,
        room_id=resolved_room.id if resolved_room is not None else None,
        table_id=resolved_table.id if resolved_table is not None else None,
        notes=booking.notes,
    )
    db.commit()
    db.refresh(booking)
    return {"booking": serialize_booking(booking, include_events=True)}


@router.delete("/bookings/{booking_id}/assignment")
def unassign_org_admin_booking(
    booking_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    booking = (
        db.query(Booking)
        .options(
            joinedload(Booking.form),
            joinedload(Booking.events),
            joinedload(Booking.submission),
            joinedload(Booking.room),
            joinedload(Booking.table),
        )
        .filter(Booking.id == booking_id, Booking.association_id == admin.org_id)
        .first()
    )
    if booking is None:
        raise HTTPException(status_code=404, detail="Prenotazione non trovata.")
    update_booking_status(
        db,
        booking=booking,
        next_status=booking.status,
        created_by_user_id=admin.id,
        room_id=None,
        table_id=None,
        notes=booking.notes,
    )
    db.commit()
    db.refresh(booking)
    return {"booking": serialize_booking(booking, include_events=True)}

class CreateManualBookingBody(BaseModel):
    customer_name: str = Field(..., min_length=1, max_length=255)
    customer_email: Optional[str] = Field(None, max_length=255)
    customer_phone: Optional[str] = Field(None, max_length=64)
    booking_date: Optional[date] = None
    booking_time: Optional[str] = Field(None, max_length=16)
    party_size: Optional[int] = Field(None, ge=1)
    room_id: Optional[int] = None
    table_id: Optional[int] = None
    status: str = Field(default="confirmed")
    notes: Optional[str] = None

@router.post("/bookings", status_code=201)
def create_org_admin_manual_booking(
    body: CreateManualBookingBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ensure_forms_module_enabled(admin.organization)
    
    # Valida che la sala/tavolo appartengano a questa organizzazione se passati
    if body.room_id:
        room = (
            db.query(Room)
            .filter(Room.id == body.room_id, Room.association_id == admin.org_id)
            .first()
        )
        if not room:
            raise HTTPException(status_code=400, detail="Sala non trovata o non autorizzata")
            
        if body.table_id:
            table = (
                db.query(RoomTable)
                .filter(
                    RoomTable.id == body.table_id,
                    RoomTable.room_id == body.room_id,
                    RoomTable.association_id == admin.org_id,
                )
                .first()
            )
            if not table:
                raise HTTPException(status_code=400, detail="Tavolo non trovato o non autorizzato")
    elif body.table_id:
        raise HTTPException(
            status_code=400,
            detail="Seleziona una sala prima di assegnare un tavolo.",
        )
                
    now = datetime.utcnow()
    booking = Booking(
        association_id=admin.org_id,
        status=body.status,
        customer_name=body.customer_name,
        customer_email=body.customer_email,
        customer_phone=body.customer_phone,
        booking_date=body.booking_date,
        booking_time=body.booking_time,
        party_size=body.party_size,
        room_id=body.room_id,
        table_id=body.table_id,
        notes=body.notes,
        confirmed_at=now if body.status == "confirmed" else None,
        created_at=now,
        updated_at=now
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return {"booking": serialize_booking(booking)}
