from __future__ import annotations

import html
import io
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException
from pydantic import EmailStr, TypeAdapter
from sqlalchemy.orm import Session, joinedload

from app.models import (
    AdminRole,
    AdminUser,
    Booking,
    EmailTemplate,
    Form,
    FormField,
    FormSubmission,
    Member,
    OrgAdminNotification,
    Organization,
)
from app.services.bookings import (
    create_booking_from_submission,
    normalize_booking_field_mapping,
    normalize_form_type,
)
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload
from app.services.email_templates import render_template_content
from app.services.whatsapp_automations import serialize_whatsapp_automation


FORM_VISIBILITY_PUBLIC = "public"
FORM_VISIBILITY_MEMBERS_ONLY = "members_only"
ALLOWED_FORM_VISIBILITY = {
    FORM_VISIBILITY_PUBLIC,
    FORM_VISIBILITY_MEMBERS_ONLY,
}
DEFAULT_FORM_PAGE_STYLE = "editorial"
ALLOWED_FORM_PAGE_STYLES = {"editorial", "minimal", "spotlight"}
FIELD_TYPE_CONSENT = "consent"
ALLOWED_FORM_FIELD_TYPES = {
    "short_text",
    "long_text",
    "email",
    "phone",
    "number",
    "date",
    "time",
    "select",
    "radio",
    "checkbox",
    FIELD_TYPE_CONSENT,
}
FIELD_TYPE_ALIASES = {
    "consent/privacy": FIELD_TYPE_CONSENT,
    "privacy": FIELD_TYPE_CONSENT,
}
_EMAIL_ADAPTER = TypeAdapter(EmailStr)
FORMS_MODULE_LOCKED_MESSAGE = "I Form richiedono il modulo Comunicazioni attivo."
FORM_SUBMISSION_STATUS_PENDING = "pending"
FORM_SUBMISSION_STATUS_CONFIRMED = "confirmed"
FORM_SUBMISSION_STATUS_REJECTED = "rejected"
FORM_SUBMISSION_STATUS_LEGACY_NEW = "new"
ALLOWED_FORM_SUBMISSION_STATUSES = {
    FORM_SUBMISSION_STATUS_PENDING,
    FORM_SUBMISSION_STATUS_CONFIRMED,
    FORM_SUBMISSION_STATUS_REJECTED,
}


@dataclass(frozen=True)
class ValidatedSubmission:
    payload: dict[str, Any]
    submitter_email: str | None


def _normalize_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _normalize_multiline_text(value: Any) -> str | None:
    text = _normalize_text(value)
    if text is None:
        return None
    return text.replace("\r\n", "\n")


def normalize_form_slug(value: Any) -> str:
    raw = _normalize_text(value)
    if raw is None:
        raise HTTPException(status_code=422, detail="Slug form obbligatorio.")
    normalized = unicodedata.normalize("NFD", raw)
    normalized = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    normalized = normalized.lower()
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized)
    normalized = re.sub(r"-{2,}", "-", normalized).strip("-")
    normalized = normalized[:80].strip("-")
    if not normalized:
        raise HTTPException(status_code=422, detail="Slug form non valido.")
    return normalized


def build_unique_form_slug(
    db: Session,
    *,
    base_slug: str,
    exclude_form_id: int | None = None,
) -> str:
    candidate = normalize_form_slug(base_slug)
    suffix = 1
    while True:
        query = db.query(Form).filter(Form.public_slug == candidate)
        if exclude_form_id is not None:
            query = query.filter(Form.id != exclude_form_id)
        if query.first() is None:
            return candidate
        suffix += 1
        candidate = f"{normalize_form_slug(base_slug)[:72].rstrip('-')}-{suffix}"


def normalize_form_visibility(value: Any) -> str:
    normalized = _normalize_text(value)
    if normalized is None:
        return FORM_VISIBILITY_PUBLIC
    lowered = normalized.lower()
    if lowered not in ALLOWED_FORM_VISIBILITY:
        raise HTTPException(status_code=422, detail="Visibilita form non valida.")
    return lowered


def normalize_form_notification_email(value: Any) -> str | None:
    normalized = _normalize_text(value)
    if normalized is None:
        return None
    try:
        return str(_EMAIL_ADAPTER.validate_python(normalized)).lower()
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Email notifica non valida.") from exc


def normalize_form_accent_color(value: Any) -> str | None:
    normalized = _normalize_text(value)
    if normalized is None:
        return None
    cleaned = normalized.lower()
    if re.fullmatch(r"#[0-9a-f]{6}", cleaned) or re.fullmatch(r"#[0-9a-f]{3}", cleaned):
        return cleaned
    raise HTTPException(status_code=422, detail="Colore accento non valido.")


def normalize_form_submit_button_text(value: Any) -> str | None:
    normalized = _normalize_text(value)
    if normalized is None:
        return None
    return normalized[:120]


def normalize_form_whatsapp_template(value: Any) -> str | None:
    normalized = _normalize_multiline_text(value)
    if normalized is None:
        return None
    return normalized[:4096]


def normalize_booking_event_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    normalized = _normalize_text(value)
    if normalized is None:
        return None
    try:
        return date.fromisoformat(normalized)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Data evento prenotazione non valida.") from exc


def normalize_booking_event_time(value: Any) -> str | None:
    normalized = _normalize_text(value)
    if normalized is None:
        return None
    if re.fullmatch(r"^(?:[01]\d|2[0-3]):[0-5]\d$", normalized):
        return normalized
    if re.fullmatch(r"^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$", normalized):
        return normalized[:5]
    raise HTTPException(status_code=422, detail="Orario evento prenotazione non valido.")


def default_form_whatsapp_confirmation_template(form_type: Any, *, booking_enabled: bool = False) -> str:
    normalized_form_type = normalize_form_type(form_type, booking_enabled=booking_enabled)
    if booking_enabled or normalized_form_type == "booking":
        return (
            "Ciao {{nome_contatto}}, la tua prenotazione per {{nome_associazione}} è stata confermata. "
            "Dettagli: {{riepilogo_prenotazione}}."
        )
    return (
        "Ciao {{nome_contatto}}, la tua richiesta per {{titolo_form}} è stata confermata. "
        "Ti ricontatteremo se serviranno altri dettagli."
    )


def default_form_whatsapp_rejection_template(form_type: Any, *, booking_enabled: bool = False) -> str:
    normalized_form_type = normalize_form_type(form_type, booking_enabled=booking_enabled)
    if booking_enabled or normalized_form_type == "booking":
        return (
            "Ciao {{nome_contatto}}, la tua prenotazione per {{nome_associazione}} non può essere confermata. "
            "{{motivo_rigetto}}"
        )
    return (
        "Ciao {{nome_contatto}}, la tua richiesta per {{titolo_form}} è stata rigettata. "
        "{{motivo_rigetto}}"
    )


def normalize_submission_status(value: Any) -> str:
    normalized = (_normalize_text(value) or FORM_SUBMISSION_STATUS_PENDING).lower()
    if normalized == FORM_SUBMISSION_STATUS_LEGACY_NEW:
        return FORM_SUBMISSION_STATUS_PENDING
    if normalized not in ALLOWED_FORM_SUBMISSION_STATUSES:
        raise HTTPException(status_code=422, detail="Stato richiesta non valido.")
    return normalized


def _submission_available_actions(status: str) -> dict[str, bool]:
    normalized = normalize_submission_status(status)
    return {
        "set_pending": normalized != FORM_SUBMISSION_STATUS_PENDING,
        "confirm": normalized != FORM_SUBMISSION_STATUS_CONFIRMED,
        "reject": normalized != FORM_SUBMISSION_STATUS_REJECTED,
    }


def _serialize_submission_reviewer(admin: AdminUser | None) -> dict[str, Any] | None:
    if admin is None:
        return None
    return {
        "id": admin.id,
        "email": admin.email,
    }


def normalize_form_cover_image_url(value: Any) -> str | None:
    normalized = _normalize_text(value)
    if normalized is None:
        return None
    if normalized.startswith(("https://", "http://", "/")):
        return normalized[:2000]
    raise HTTPException(status_code=422, detail="URL cover image non valido.")


def normalize_form_page_style(value: Any) -> str:
    normalized = _normalize_text(value)
    if normalized is None:
        return DEFAULT_FORM_PAGE_STYLE
    lowered = normalized.lower()
    if lowered not in ALLOWED_FORM_PAGE_STYLES:
        raise HTTPException(status_code=422, detail="Stile pagina non valido.")
    return lowered


def ensure_forms_module_enabled(organization: Organization | None) -> None:
    if organization is None or not bool(getattr(organization, "communications_enabled", False)):
        raise HTTPException(status_code=403, detail=FORMS_MODULE_LOCKED_MESSAGE)


def _resolve_template_reference(
    db: Session,
    *,
    association_id: int,
    template_id: Any,
    field_label: str,
) -> int | None:
    if template_id in (None, "", 0, "0"):
        return None
    try:
        normalized_id = int(template_id)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"{field_label} non valido.") from exc
    template = (
        db.query(EmailTemplate)
        .filter(
            EmailTemplate.id == normalized_id,
            EmailTemplate.channel == "email",
            EmailTemplate.is_active.is_(True),
        )
        .first()
    )
    if template is None:
        raise HTTPException(status_code=422, detail=f"{field_label} non trovato.")
    if not template.is_system and int(template.association_id or 0) != int(association_id):
        raise HTTPException(status_code=422, detail=f"{field_label} fuori scope.")
    return template.id


def normalize_field_type(value: Any) -> str:
    normalized = _normalize_text(value)
    if normalized is None:
        raise HTTPException(status_code=422, detail="Tipo campo obbligatorio.")
    lowered = FIELD_TYPE_ALIASES.get(normalized.lower(), normalized.lower())
    if lowered not in ALLOWED_FORM_FIELD_TYPES:
        raise HTTPException(status_code=422, detail="Tipo campo non supportato.")
    return lowered


VIRTUAL_FIELD_KEY_PREFIXES = (
    "__ui_title__",
    "__ui_text__",
    "__ui_divider__",
    "__ui_spacer__",
    "__ui_file__",
    "__survey_rating__",
    "__survey_nps__",
)


def normalize_field_key(value: Any, *, fallback_label: Any | None = None) -> str:
    source = _normalize_text(value) or _normalize_text(fallback_label)
    if source is None:
        raise HTTPException(status_code=422, detail="Chiave campo obbligatoria.")
    raw_source = source.strip().lower()
    for prefix in VIRTUAL_FIELD_KEY_PREFIXES:
        if raw_source.startswith(prefix):
            suffix = raw_source[len(prefix):]
            normalized_suffix = normalize_form_slug(suffix).replace("-", "_")
            normalized_virtual_key = f"{prefix}{normalized_suffix}".rstrip("_")
            if len(normalized_virtual_key) > len(prefix):
                return normalized_virtual_key[:64]
    normalized = normalize_form_slug(source).replace("-", "_")
    if not normalized:
        raise HTTPException(status_code=422, detail="Chiave campo non valida.")
    return normalized[:64]


def normalize_field_options(field_type: str, value: Any) -> list[str] | None:
    normalized_type = normalize_field_type(field_type)
    options: list[str] = []
    if isinstance(value, str):
        options = [item.strip() for item in value.split(",") if item.strip()]
    elif isinstance(value, list):
        options = [str(item).strip() for item in value if str(item).strip()]
    elif value is None:
        options = []
    else:
        raise HTTPException(status_code=422, detail="Opzioni campo non valide.")

    if normalized_type in {"select", "radio", "checkbox"}:
        if not options:
            raise HTTPException(
                status_code=422,
                detail="I campi select, radio e checkbox richiedono almeno una opzione.",
            )
        deduped: list[str] = []
        seen: set[str] = set()
        for option in options:
            lowered = option.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            deduped.append(option[:120])
        return deduped
    return None


def get_form_for_org_admin(db: Session, *, association_id: int, form_id: int) -> Form:
    form = (
        db.query(Form)
        .options(
            joinedload(Form.fields),
            joinedload(Form.submissions),
            joinedload(Form.admin_notification_template),
            joinedload(Form.user_confirmation_template),
            joinedload(Form.bookings),
        )
        .filter(Form.id == form_id, Form.association_id == association_id)
        .first()
    )
    if form is None:
        raise HTTPException(status_code=404, detail="Form non trovato.")
    return form


def get_form_by_slug_for_public(db: Session, *, slug: str) -> Form:
    form = (
        db.query(Form)
        .options(
            joinedload(Form.fields),
            joinedload(Form.organization),
            joinedload(Form.admin_notification_template),
            joinedload(Form.user_confirmation_template),
            joinedload(Form.bookings),
        )
        .filter(Form.public_slug == normalize_form_slug(slug))
        .first()
    )
    if form is None:
        raise HTTPException(status_code=404, detail="Form non trovato.")
    return form


def get_form_by_org_slug_and_form_slug_for_public(
    db: Session,
    *,
    org_slug: str,
    slug: str,
) -> Form:
    normalized_slug = normalize_form_slug(slug)
    normalized_org_slug = _normalize_text(org_slug)
    if normalized_org_slug is None:
        raise HTTPException(status_code=404, detail="Form non trovato.")
    form = (
        db.query(Form)
        .options(
            joinedload(Form.fields),
            joinedload(Form.organization),
            joinedload(Form.admin_notification_template),
            joinedload(Form.user_confirmation_template),
            joinedload(Form.bookings),
        )
        .join(Organization, Organization.id == Form.association_id)
        .filter(
            Form.public_slug == normalized_slug,
            Organization.slug == normalized_org_slug.strip().lower(),
        )
        .first()
    )
    if form is None:
        raise HTTPException(status_code=404, detail="Form non trovato.")
    return form


def serialize_form_field(field: FormField) -> dict[str, Any]:
    return {
        "id": field.id,
        "form_id": field.form_id,
        "field_key": field.field_key,
        "field_type": field.field_type,
        "label": field.label,
        "placeholder": field.placeholder,
        "help_text": field.help_text,
        "is_required": bool(field.is_required),
        "sort_order": int(field.sort_order or 0),
        "options": list(field.options_json or []),
    }


def _serialize_template_summary(template: EmailTemplate | None) -> dict[str, Any] | None:
    if template is None:
        return None
    return {
        "id": template.id,
        "name": template.name,
        "subject": template.subject,
        "is_system": bool(template.is_system),
        "is_active": bool(template.is_active),
    }


def _build_submission_status_counts(submissions: list[FormSubmission]) -> dict[str, int]:
    counts = {
        FORM_SUBMISSION_STATUS_PENDING: 0,
        FORM_SUBMISSION_STATUS_CONFIRMED: 0,
        FORM_SUBMISSION_STATUS_REJECTED: 0,
    }
    for submission in submissions:
        normalized_status = normalize_submission_status(getattr(submission, "status", None))
        counts[normalized_status] = counts.get(normalized_status, 0) + 1
    counts["total"] = len(submissions)
    return counts


def serialize_form(form: Form, *, include_fields: bool = True) -> dict[str, Any]:
    items = sorted(
        list(form.fields or []),
        key=lambda field: (int(field.sort_order or 0), int(field.id or 0)),
    )
    submissions = list(form.submissions or [])
    submission_status_counts = _build_submission_status_counts(submissions)
    whatsapp_automations = sorted(
        list(getattr(form, "whatsapp_automations", []) or []),
        key=lambda automation: (
            0 if bool(getattr(automation, "is_active", False)) else 1,
            str(getattr(automation, "name", "") or "").lower(),
            int(getattr(automation, "id", 0) or 0),
        ),
    )
    return {
        "id": form.id,
        "association_id": form.association_id,
        "title": form.title,
        "description": form.description,
        "accent_color": getattr(form, "accent_color", None),
        "submit_button_text": getattr(form, "submit_button_text", None),
        "show_logo": bool(getattr(form, "show_logo", True)),
        "cover_image_url": getattr(form, "cover_image_url", None),
        "page_style": getattr(form, "page_style", DEFAULT_FORM_PAGE_STYLE),
        "public_slug": form.public_slug,
        "is_active": bool(form.is_active),
        "visibility": form.visibility,
        "success_message": form.success_message,
        "notification_email": form.notification_email,
        "allow_multiple_submissions": bool(form.allow_multiple_submissions),
        "form_type": normalize_form_type(
            getattr(form, "form_type", None),
            booking_enabled=bool(getattr(form, "booking_enabled", False)),
        ),
        "booking_enabled": bool(getattr(form, "booking_enabled", False) or getattr(form, "create_booking", False)),
        "booking_requires_manual_confirmation": bool(
            getattr(form, "booking_requires_manual_confirmation", True)
        ),
        "booking_success_message_override": getattr(form, "booking_success_message_override", None),
        "booking_notification_enabled": bool(getattr(form, "booking_notification_enabled", True)),
        "booking_auto_assign_enabled": bool(getattr(form, "booking_auto_assign_enabled", False)),
        "booking_field_mapping": normalize_booking_field_mapping(
            getattr(form, "booking_field_mapping", None) or {}
        ),
        "booking_event_date": (
            form.booking_event_date.isoformat()
            if getattr(form, "booking_event_date", None)
            else None
        ),
        "booking_event_time": getattr(form, "booking_event_time", None),
        "booking_event_details": getattr(form, "booking_event_details", None),
        "survey_post_event_enabled": bool(getattr(form, "survey_post_event_enabled", False)),
        "survey_post_event_delay_hours": int(getattr(form, "survey_post_event_delay_hours", 2) or 2),
        "survey_post_event_message_template": getattr(form, "survey_post_event_message_template", None),
        "notify_admin_on_submit": bool(getattr(form, "notify_admin_on_submit", True)),
        "send_user_confirmation": bool(getattr(form, "send_user_confirmation", True)),
        "whatsapp_auto_reply_enabled": bool(getattr(form, "whatsapp_auto_reply_enabled", False)),
        "whatsapp_auto_reply_template": getattr(form, "whatsapp_auto_reply_template", None),
        "whatsapp_confirmation_template": getattr(form, "whatsapp_confirmation_template", None),
        "whatsapp_rejection_template": getattr(form, "whatsapp_rejection_template", None),
        "admin_notification_template_id": getattr(form, "admin_notification_template_id", None),
        "user_confirmation_template_id": getattr(form, "user_confirmation_template_id", None),
        "create_internal_request": bool(getattr(form, "create_internal_request", False)),
        "create_booking": bool(getattr(form, "create_booking", False)),
        "created_by_user_id": form.created_by_user_id,
        "created_at": form.created_at.isoformat() if form.created_at else None,
        "updated_at": form.updated_at.isoformat() if form.updated_at else None,
        "field_count": len(items),
        "submission_count": len(submissions),
        "submission_status_counts": submission_status_counts,
        "booking_count": len(form.bookings or []),
        "fields": [serialize_form_field(field) for field in items] if include_fields else [],
        "whatsapp_automations": [
            serialize_whatsapp_automation(automation) for automation in whatsapp_automations
        ],
        "public_path": (
            f"/forms/{form.organization.slug}/{form.public_slug}"
            if form.organization is not None and getattr(form.organization, "slug", None)
            else f"/forms/{form.public_slug}"
        ),
        "design": {
            "title": form.title,
            "description": form.description,
            "accent_color": getattr(form, "accent_color", None),
            "submit_button_text": getattr(form, "submit_button_text", None),
            "show_logo": bool(getattr(form, "show_logo", True)),
            "cover_image_url": getattr(form, "cover_image_url", None),
            "page_style": getattr(form, "page_style", DEFAULT_FORM_PAGE_STYLE),
        },
        "actions": {
            "save_submission": True,
            "notify_admin_on_submit": bool(getattr(form, "notify_admin_on_submit", True)),
            "send_user_confirmation": bool(getattr(form, "send_user_confirmation", True)),
            "whatsapp_auto_reply_enabled": bool(getattr(form, "whatsapp_auto_reply_enabled", False)),
            "whatsapp_auto_reply_template": getattr(form, "whatsapp_auto_reply_template", None),
            "whatsapp_confirmation_template": getattr(form, "whatsapp_confirmation_template", None),
            "whatsapp_rejection_template": getattr(form, "whatsapp_rejection_template", None),
            "admin_notification_template": _serialize_template_summary(
                getattr(form, "admin_notification_template", None)
            ),
            "user_confirmation_template": _serialize_template_summary(
                getattr(form, "user_confirmation_template", None)
            ),
            "create_internal_request": bool(getattr(form, "create_internal_request", False)),
            "create_booking": bool(getattr(form, "create_booking", False)),
            "booking_enabled": bool(getattr(form, "booking_enabled", False) or getattr(form, "create_booking", False)),
            "booking_requires_manual_confirmation": bool(
                getattr(form, "booking_requires_manual_confirmation", True)
            ),
            "booking_notification_enabled": bool(getattr(form, "booking_notification_enabled", True)),
            "booking_auto_assign_enabled": bool(getattr(form, "booking_auto_assign_enabled", False)),
            "booking_field_mapping": normalize_booking_field_mapping(
                getattr(form, "booking_field_mapping", None) or {}
            ),
            "booking_event_date": (
                form.booking_event_date.isoformat()
                if getattr(form, "booking_event_date", None)
                else None
            ),
            "booking_event_time": getattr(form, "booking_event_time", None),
            "booking_event_details": getattr(form, "booking_event_details", None),
            "survey_post_event_enabled": bool(getattr(form, "survey_post_event_enabled", False)),
            "survey_post_event_delay_hours": int(getattr(form, "survey_post_event_delay_hours", 2) or 2),
            "survey_post_event_message_template": getattr(form, "survey_post_event_message_template", None),
            "connected_whatsapp_automations": [
                serialize_whatsapp_automation(automation) for automation in whatsapp_automations
            ],
        },
    }


def serialize_public_form(form: Form) -> dict[str, Any]:
    payload = serialize_form(form, include_fields=True)
    payload["association"] = {
        "id": form.organization.id if form.organization else form.association_id,
        "name": form.organization.name if form.organization else None,
        "slug": form.organization.slug if form.organization else None,
    }
    return payload


def resolve_form_notification_email(db: Session, *, form: Form) -> str | None:
    explicit_email = normalize_form_notification_email(form.notification_email)
    if explicit_email:
        return explicit_email

    creator_email = _normalize_text(getattr(getattr(form, "created_by_user", None), "email", None))
    if creator_email:
        return creator_email.lower()

    fallback_admin = (
        db.query(AdminUser.email)
        .filter(
            AdminUser.org_id == form.association_id,
            AdminUser.role == AdminRole.ORG_ADMIN,
            AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None),
        )
        .order_by(AdminUser.id.asc())
        .first()
    )
    if fallback_admin and fallback_admin[0]:
        return str(fallback_admin[0]).strip().lower()
    return None


def serialize_submission(submission: FormSubmission) -> dict[str, Any]:
    member = submission.member
    booking = next(iter(submission.bookings or []), None)
    normalized_status = normalize_submission_status(submission.status)
    return {
        "id": submission.id,
        "form_id": submission.form_id,
        "association_id": submission.association_id,
        "submitted_by_user_id": submission.submitted_by_user_id,
        "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
        "status": normalized_status,
        "payload_json": submission.payload_json or {},
        "reviewed_at": submission.reviewed_at.isoformat() if submission.reviewed_at else None,
        "review_reason": submission.review_reason,
        "reviewed_by": _serialize_submission_reviewer(getattr(submission, "reviewed_by_admin", None)),
        "available_actions": _submission_available_actions(normalized_status),
        "submitted_by": {
            "id": member.id,
            "name": f"{(member.first_name or '').strip()} {(member.last_name or '').strip()}".strip()
            or None,
            "email": member.email,
        }
        if member is not None
        else None,
        "booking": {
            "id": booking.id,
            "status": booking.status,
            "customer_name": booking.customer_name,
            "booking_date": booking.booking_date.isoformat() if booking.booking_date else None,
            "booking_time": booking.booking_time,
            "party_size": booking.party_size,
        }
        if booking is not None
        else None,
    }


def apply_form_updates(
    db: Session,
    *,
    form: Form,
    title: Any,
    description: Any,
    accent_color: Any,
    submit_button_text: Any,
    show_logo: bool,
    cover_image_url: Any,
    page_style: Any,
    public_slug: Any,
    is_active: bool,
    visibility: Any,
    success_message: Any,
    notification_email: Any,
    allow_multiple_submissions: bool,
    form_type: Any,
    booking_enabled: bool,
    booking_requires_manual_confirmation: bool,
    booking_success_message_override: Any,
    booking_notification_enabled: bool,
    booking_auto_assign_enabled: bool,
    booking_field_mapping: Any,
    booking_event_date: Any,
    booking_event_time: Any,
    booking_event_details: Any,
    survey_post_event_enabled: bool,
    survey_post_event_delay_hours: int | None,
    survey_post_event_message_template: Any,
    notify_admin_on_submit: bool,
    send_user_confirmation: bool,
    whatsapp_auto_reply_enabled: bool,
    whatsapp_auto_reply_template: Any,
    whatsapp_confirmation_template: Any,
    whatsapp_rejection_template: Any,
    admin_notification_template_id: Any,
    user_confirmation_template_id: Any,
    create_internal_request: bool,
    create_booking: bool,
) -> Form:
    normalized_title = _normalize_text(title)
    if normalized_title is None:
        raise HTTPException(status_code=422, detail="Titolo form obbligatorio.")
    requested_slug = normalize_form_slug(public_slug or normalized_title)
    form.title = normalized_title
    form.description = _normalize_multiline_text(description)
    form.accent_color = normalize_form_accent_color(accent_color)
    form.submit_button_text = normalize_form_submit_button_text(submit_button_text)
    form.show_logo = bool(show_logo)
    form.cover_image_url = normalize_form_cover_image_url(cover_image_url)
    form.page_style = normalize_form_page_style(page_style)
    form.public_slug = build_unique_form_slug(
        db,
        base_slug=requested_slug,
        exclude_form_id=form.id,
    )
    form.is_active = bool(is_active)
    form.visibility = normalize_form_visibility(visibility)
    form.success_message = _normalize_multiline_text(success_message)
    form.notification_email = normalize_form_notification_email(notification_email)
    form.allow_multiple_submissions = bool(allow_multiple_submissions)
    normalized_booking_enabled = bool(booking_enabled or create_booking)
    form.form_type = normalize_form_type(form_type, booking_enabled=normalized_booking_enabled)
    form.booking_enabled = normalized_booking_enabled
    form.booking_requires_manual_confirmation = bool(booking_requires_manual_confirmation)
    form.booking_success_message_override = _normalize_multiline_text(booking_success_message_override)
    form.booking_notification_enabled = bool(booking_notification_enabled)
    form.booking_auto_assign_enabled = bool(booking_auto_assign_enabled)
    form.booking_field_mapping = normalize_booking_field_mapping(booking_field_mapping)
    form.booking_event_date = normalize_booking_event_date(booking_event_date)
    form.booking_event_time = normalize_booking_event_time(booking_event_time)
    form.booking_event_details = _normalize_multiline_text(booking_event_details)
    form.survey_post_event_enabled = bool(survey_post_event_enabled)
    try:
        normalized_delay = int(survey_post_event_delay_hours or 2)
    except Exception:
        normalized_delay = 2
    form.survey_post_event_delay_hours = min(max(normalized_delay, 0), 336)
    form.survey_post_event_message_template = _normalize_multiline_text(
        survey_post_event_message_template
    )
    form.notify_admin_on_submit = bool(notify_admin_on_submit)
    form.send_user_confirmation = bool(send_user_confirmation)
    form.whatsapp_auto_reply_enabled = bool(whatsapp_auto_reply_enabled)
    form.whatsapp_auto_reply_template = normalize_form_whatsapp_template(
        whatsapp_auto_reply_template
    )
    form.whatsapp_confirmation_template = normalize_form_whatsapp_template(
        whatsapp_confirmation_template
    )
    form.whatsapp_rejection_template = normalize_form_whatsapp_template(
        whatsapp_rejection_template
    )
    form.admin_notification_template_id = _resolve_template_reference(
        db,
        association_id=form.association_id,
        template_id=admin_notification_template_id,
        field_label="Template notifica admin",
    )
    form.user_confirmation_template_id = _resolve_template_reference(
        db,
        association_id=form.association_id,
        template_id=user_confirmation_template_id,
        field_label="Template conferma utente",
    )
    form.create_internal_request = bool(create_internal_request)
    form.create_booking = normalized_booking_enabled
    return form


def apply_form_field_updates(
    field: FormField,
    *,
    field_key: Any,
    field_type: Any,
    label: Any,
    placeholder: Any,
    help_text: Any,
    is_required: bool,
    sort_order: int,
    options: Any,
) -> FormField:
    normalized_label = _normalize_text(label)
    if normalized_label is None:
        raise HTTPException(status_code=422, detail="Etichetta campo obbligatoria.")
    normalized_type = normalize_field_type(field_type)
    field.field_key = normalize_field_key(field_key, fallback_label=normalized_label)
    field.field_type = normalized_type
    field.label = normalized_label
    field.placeholder = _normalize_text(placeholder)
    field.help_text = _normalize_multiline_text(help_text)
    field.is_required = bool(is_required)
    field.sort_order = int(sort_order or 0)
    field.options_json = normalize_field_options(normalized_type, options)
    return field


def _validate_single_value(field: FormField, value: Any) -> tuple[Any, str | None]:
    field_type = normalize_field_type(field.field_type)
    if field_type in {"short_text", "long_text", "phone"}:
        normalized = _normalize_multiline_text(value if value is not None else "")
        return normalized or "", None
    if field_type == "email":
        normalized = _normalize_text(value)
        if normalized is None:
            return "", None
        try:
            email = str(_EMAIL_ADAPTER.validate_python(normalized)).lower()
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Il campo '{field.label}' richiede una email valida.",
            ) from exc
        return email, email
    if field_type == "number":
        if value in (None, ""):
            return None, None
        try:
            number = float(value)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Il campo '{field.label}' richiede un numero valido.",
            ) from exc
        if number.is_integer():
            return int(number), None
        return number, None
    if field_type == "date":
        normalized = _normalize_text(value)
        if normalized is None:
            return "", None
        try:
            parsed = date.fromisoformat(normalized)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Il campo '{field.label}' richiede una data valida.",
            ) from exc
        return parsed.isoformat(), None
    if field_type == "time":
        normalized = _normalize_text(value)
        if normalized is None:
            return "", None
        if re.fullmatch(r"^(?:[01]\d|2[0-3]):[0-5]\d$", normalized):
            return normalized, None
        if re.fullmatch(r"^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$", normalized):
            return normalized[:5], None
        raise HTTPException(
            status_code=422,
            detail=f"Il campo '{field.label}' richiede un orario valido.",
        )
    if field_type in {"select", "radio"}:
        normalized = _normalize_text(value)
        options = list(field.options_json or [])
        if normalized is None:
            return "", None
        if normalized not in options:
            raise HTTPException(
                status_code=422,
                detail=f"Il valore selezionato per '{field.label}' non ? valido.",
            )
        return normalized, None
    if field_type == "checkbox":
        options = list(field.options_json or [])
        if isinstance(value, list):
            normalized_values = [str(item).strip() for item in value if str(item).strip()]
        elif value in (None, ""):
            normalized_values = []
        else:
            normalized_values = [str(value).strip()]
        invalid = [item for item in normalized_values if item not in options]
        if invalid:
            raise HTTPException(
                status_code=422,
                detail=f"Il valore selezionato per '{field.label}' non ? valido.",
            )
        return normalized_values, None
    if field_type == FIELD_TYPE_CONSENT:
        normalized = bool(value)
        return normalized, None
    raise HTTPException(status_code=422, detail=f"Tipo campo non supportato: {field_type}")


def validate_form_submission_payload(
    *,
    form: Form,
    raw_payload: dict[str, Any] | None,
) -> ValidatedSubmission:
    raw = raw_payload or {}
    normalized_payload: dict[str, Any] = {}
    submitter_email: str | None = None
    fields = sorted(list(form.fields or []), key=lambda item: (int(item.sort_order or 0), int(item.id or 0)))
    for field in fields:
        raw_value = raw.get(field.field_key)
        normalized_value, detected_email = _validate_single_value(field, raw_value)
        if field.field_type == FIELD_TYPE_CONSENT:
            if field.is_required and normalized_value is not True:
                raise HTTPException(
                    status_code=422,
                    detail=f"Devi accettare '{field.label}' per inviare il form.",
                )
        elif field.field_type == "checkbox":
            if field.is_required and not normalized_value:
                raise HTTPException(
                    status_code=422,
                    detail=f"Il campo '{field.label}' ? obbligatorio.",
                )
        else:
            empty = normalized_value in (None, "", [])
            if field.is_required and empty:
                raise HTTPException(
                    status_code=422,
                    detail=f"Il campo '{field.label}' ? obbligatorio.",
                )
        normalized_payload[field.field_key] = normalized_value
        if detected_email and submitter_email is None:
            submitter_email = detected_email
    return ValidatedSubmission(payload=normalized_payload, submitter_email=submitter_email)


def ensure_submission_allowed(
    db: Session,
    *,
    form: Form,
    member: Member | None,
    validated_submission: ValidatedSubmission,
) -> None:
    if bool(form.allow_multiple_submissions):
        return

    existing_query = db.query(FormSubmission).filter(FormSubmission.form_id == form.id)
    if member is not None:
        already_sent = existing_query.filter(
            FormSubmission.submitted_by_user_id == member.id
        ).first()
        if already_sent is not None:
            raise HTTPException(
                status_code=409,
                detail="Hai già inviato questo form.",
            )
        return

    submitter_email = (validated_submission.submitter_email or "").strip().lower()
    if not submitter_email:
        return
    for submission in existing_query.all():
        payload = submission.payload_json or {}
        for value in payload.values():
            if isinstance(value, str) and value.strip().lower() == submitter_email:
                raise HTTPException(
                    status_code=409,
                    detail="Questo indirizzo email ha già inviato il form.",
                )


def create_submission(
    db: Session,
    *,
    form: Form,
    member: Member | None,
    validated_submission: ValidatedSubmission,
) -> FormSubmission:
    submission = FormSubmission(
        form_id=form.id,
        association_id=form.association_id,
        submitted_by_user_id=member.id if member is not None else None,
        payload_json=validated_submission.payload,
        status=FORM_SUBMISSION_STATUS_PENDING,
    )
    db.add(submission)
    db.flush()
    return submission


def _format_submission_for_email(form: Form, payload: dict[str, Any]) -> tuple[str, str]:
    lines = [f"Nuova risposta ricevuta per il form '{form.title}'."]
    html_rows: list[str] = [
        f"<p>Nuova risposta ricevuta per il form <strong>{html.escape(form.title)}</strong>.</p>",
        "<ul>",
    ]
    field_map = {field.field_key: field for field in form.fields or []}
    for key, value in payload.items():
        field = field_map.get(key)
        label = field.label if field is not None else key
        if isinstance(value, list):
            printable = ", ".join(str(item) for item in value) if value else "-"
        elif isinstance(value, bool):
            printable = "Si" if value else "No"
        elif value in (None, ""):
            printable = "-"
        else:
            printable = str(value)
        lines.append(f"- {label}: {printable}")
        html_rows.append(f"<li><strong>{html.escape(label)}:</strong> {html.escape(printable)}</li>")
    html_rows.append("</ul>")
    return "\n".join(lines), "".join(html_rows)


def _guess_submitter_name(payload: dict[str, Any]) -> str:
    for key in ("nome_socio", "nome_cliente", "customer_name", "nome", "full_name", "name"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    first_name = str(payload.get("first_name") or "").strip()
    last_name = str(payload.get("last_name") or "").strip()
    full_name = f"{first_name} {last_name}".strip()
    return full_name


def build_form_template_context(
    *,
    form: Form,
    validated_submission: ValidatedSubmission,
) -> dict[str, str]:
    submitter_name = _guess_submitter_name(validated_submission.payload)
    return {
        "titolo_form": form.title or "",
        "email_destinatario": validated_submission.submitter_email or "",
        "nome_socio": submitter_name,
    }


def _enqueue_rendered_template_email(
    db: Session,
    *,
    email_type: str,
    to_email: str,
    form: Form,
    submission: FormSubmission,
    template: EmailTemplate,
    validated_submission: ValidatedSubmission,
    priority: int,
) -> None:
    rendered = render_template_content(
        subject=template.subject,
        body_html=template.body_html,
        body_text=template.body_text,
        association=form.organization,
        extra_context=build_form_template_context(
            form=form,
            validated_submission=validated_submission,
        ),
    )
    enqueue_email(
        db,
        email_type=email_type,
        to_email=to_email,
        subject=rendered.subject or template.subject,
        payload=build_email_payload(
            text_body=rendered.body_text or "",
            html_body=rendered.body_html,
            sender=build_sender_payload(mode="system"),
            meta={
                "form_id": form.id,
                "submission_id": submission.id,
                "association_id": form.association_id,
                "template_id": template.id,
            },
        ),
        priority=priority,
    )


def _create_internal_request_notifications(
    db: Session,
    *,
    form: Form,
    submission: FormSubmission,
    validated_submission: ValidatedSubmission,
    booking: Booking | None = None,
) -> int:
    admins = (
        db.query(AdminUser)
        .filter(
            AdminUser.org_id == form.association_id,
            AdminUser.role == AdminRole.ORG_ADMIN,
            AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None),
        )
        .all()
    )
    created = 0
    submitter_name = _guess_submitter_name(validated_submission.payload) or validated_submission.submitter_email or "Nuovo contatto"
    is_booking_request = booking is not None or bool(
        getattr(form, "booking_enabled", False)
        or getattr(form, "create_booking", False)
        or normalize_form_type(getattr(form, "form_type", None), booking_enabled=False) == "booking"
    )
    if is_booking_request:
        date_key = booking.booking_date.isoformat() if booking is not None and booking.booking_date else None
        href = (
            f"/org-admin/prenotazioni?date={date_key}&bookingId={booking.id}"
            if booking is not None and date_key
            else f"/org-admin/prenotazioni?formId={form.id}&submissionId={submission.id}"
        )
        when_parts = []
        if booking is not None and booking.booking_date:
            when_parts.append(booking.booking_date.isoformat())
        if booking is not None and booking.booking_time:
            when_parts.append(str(booking.booking_time)[:5])
        people = f" per {booking.party_size} persone" if booking is not None and booking.party_size else ""
        title = f"Nuova prenotazione da {submitter_name}"
        body = (
            f"Richiesta da confermare per '{form.title}'"
            f"{' - ' + ' alle '.join(when_parts) if when_parts else ''}{people}."
        )
        notification_type = "booking_request"
    else:
        href = f"/org-admin/comunicazioni?tab=forms&formId={form.id}&submissionId={submission.id}"
        title = f"Nuova richiesta da {submitter_name}"
        body = f"Il form '{form.title}' ha ricevuto una nuova risposta."
        notification_type = "form_submission"
    for admin in admins:
        db.add(
            OrgAdminNotification(
                admin_user_id=admin.id,
                org_id=form.association_id,
                type=notification_type,
                title=title,
                body=body,
                href=href,
                is_read=False,
            )
        )
        created += 1
    return created


def enqueue_submission_notifications(
    db: Session,
    *,
    form: Form,
    submission: FormSubmission,
    validated_submission: ValidatedSubmission,
    booking: Booking | None = None,
) -> None:
    notification_email = resolve_form_notification_email(db, form=form)
    text_summary, html_summary = _format_submission_for_email(form, validated_submission.payload)
    is_booking_request = booking is not None or bool(
        getattr(form, "booking_enabled", False)
        or getattr(form, "create_booking", False)
        or normalize_form_type(getattr(form, "form_type", None), booking_enabled=False) == "booking"
    )
    if bool(getattr(form, "create_internal_request", False)) or is_booking_request:
        _create_internal_request_notifications(
            db,
            form=form,
            submission=submission,
            validated_submission=validated_submission,
            booking=booking,
        )

    if bool(getattr(form, "notify_admin_on_submit", True)) and notification_email:
        if getattr(form, "admin_notification_template", None) is not None:
            _enqueue_rendered_template_email(
                db,
                email_type="form_submission_notification",
                to_email=notification_email,
                form=form,
                submission=submission,
                template=form.admin_notification_template,
                validated_submission=validated_submission,
                priority=4,
            )
        else:
            enqueue_email(
                db,
                email_type="form_submission_notification",
                to_email=notification_email,
                subject=f"Nuova risposta form: {form.title}",
                payload=build_email_payload(
                    text_body=text_summary,
                    html_body=html_summary,
                    sender=build_sender_payload(mode="system"),
                    meta={
                        "form_id": form.id,
                        "submission_id": submission.id,
                        "association_id": form.association_id,
                    },
                ),
                priority=4,
            )

    if bool(getattr(form, "send_user_confirmation", True)) and validated_submission.submitter_email:
        if getattr(form, "user_confirmation_template", None) is not None:
            _enqueue_rendered_template_email(
                db,
                email_type="form_submission_confirmation",
                to_email=validated_submission.submitter_email,
                form=form,
                submission=submission,
                template=form.user_confirmation_template,
                validated_submission=validated_submission,
                priority=5,
            )
        else:
            confirmation_text = (
                f"Abbiamo ricevuto la tua richiesta per '{form.title}'.\n\n"
                f"{form.success_message or 'Ti ricontatteremo al più presto.'}"
            )
            confirmation_html = (
                f"<p>Abbiamo ricevuto la tua richiesta per <strong>{html.escape(form.title)}</strong>.</p>"
                f"<p>{html.escape(form.success_message or 'Ti ricontatteremo al più presto.')}</p>"
            )
            enqueue_email(
                db,
                email_type="form_submission_confirmation",
                to_email=validated_submission.submitter_email,
                subject=f"Conferma invio: {form.title}",
                payload=build_email_payload(
                    text_body=confirmation_text,
                    html_body=confirmation_html,
                    sender=build_sender_payload(mode="system"),
                    meta={
                        "form_id": form.id,
                        "submission_id": submission.id,
                        "association_id": form.association_id,
                    },
                ),
                priority=5,
            )


def create_booking_from_form_submission(
    db: Session,
    *,
    form: Form,
    submission: FormSubmission,
    validated_submission: ValidatedSubmission,
):
    return create_booking_from_submission(
        db,
        form=form,
        submission=submission,
        validated_payload=validated_submission.payload,
    )


def export_submissions_csv(form: Form) -> io.StringIO:
    fields = sorted(list(form.fields or []), key=lambda item: (int(item.sort_order or 0), int(item.id or 0)))
    submissions = sorted(
        list(form.submissions or []),
        key=lambda item: (item.submitted_at or datetime.min, int(item.id or 0)),
        reverse=True,
    )
    fieldnames = ["submission_id", "submitted_at", "status", "submitted_by_user_id"] + [
        field.field_key for field in fields
    ]
    output = io.StringIO()
    import csv

    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for submission in submissions:
        row = {
            "submission_id": submission.id,
            "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else "",
            "status": submission.status or "",
            "submitted_by_user_id": submission.submitted_by_user_id or "",
        }
        payload = submission.payload_json or {}
        for field in fields:
            value = payload.get(field.field_key)
            if isinstance(value, list):
                row[field.field_key] = ", ".join(str(item) for item in value)
            elif isinstance(value, bool):
                row[field.field_key] = "Si" if value else "No"
            elif value is None:
                row[field.field_key] = ""
            else:
                row[field.field_key] = str(value)
        writer.writerow(row)
    output.seek(0)
    return output
