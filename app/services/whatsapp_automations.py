from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from app.models import Form, WhatsAppAutomation
from app.services.twilio_notifications import normalize_e164_phone


WHATSAPP_SOURCE_PUBLIC_FORM = "public_form"
WHATSAPP_TRIGGER_FORM_SUBMITTED = "form_submitted"
WHATSAPP_TRIGGER_BOOKING_CREATED = "booking_created"
WHATSAPP_TRIGGER_REQUEST_RECEIVED = "request_received"
WHATSAPP_RECIPIENT_SUBMITTER = "submitter"
WHATSAPP_RECIPIENT_MEMBER = "member"
WHATSAPP_RECIPIENT_ADMIN = "admin"
WHATSAPP_RECIPIENT_CUSTOM = "custom"
WHATSAPP_PHONE_SOURCE_FORM_FIELD = "form_field"
WHATSAPP_PHONE_SOURCE_MEMBER_PHONE = "member_phone"
WHATSAPP_PHONE_SOURCE_CUSTOM = "custom"

ALLOWED_WHATSAPP_SOURCES = {WHATSAPP_SOURCE_PUBLIC_FORM}
ALLOWED_WHATSAPP_TRIGGERS = {
    WHATSAPP_TRIGGER_FORM_SUBMITTED,
    WHATSAPP_TRIGGER_BOOKING_CREATED,
    WHATSAPP_TRIGGER_REQUEST_RECEIVED,
}
ALLOWED_WHATSAPP_RECIPIENTS = {
    WHATSAPP_RECIPIENT_SUBMITTER,
    WHATSAPP_RECIPIENT_MEMBER,
    WHATSAPP_RECIPIENT_ADMIN,
    WHATSAPP_RECIPIENT_CUSTOM,
}
ALLOWED_WHATSAPP_PHONE_SOURCES = {
    WHATSAPP_PHONE_SOURCE_FORM_FIELD,
    WHATSAPP_PHONE_SOURCE_MEMBER_PHONE,
    WHATSAPP_PHONE_SOURCE_CUSTOM,
}


def _normalize_text(value: Any) -> str | None:
    cleaned = str(value or "").strip()
    return cleaned or None


def normalize_whatsapp_source_type(value: Any) -> str:
    normalized = (_normalize_text(value) or WHATSAPP_SOURCE_PUBLIC_FORM).lower()
    if normalized not in ALLOWED_WHATSAPP_SOURCES:
        raise HTTPException(status_code=422, detail="Origine automazione WhatsApp non valida.")
    return normalized


def normalize_whatsapp_trigger_event(value: Any) -> str:
    normalized = (_normalize_text(value) or WHATSAPP_TRIGGER_FORM_SUBMITTED).lower()
    if normalized not in ALLOWED_WHATSAPP_TRIGGERS:
        raise HTTPException(status_code=422, detail="Evento automazione WhatsApp non valido.")
    return normalized


def normalize_whatsapp_recipient_type(value: Any) -> str:
    normalized = (_normalize_text(value) or WHATSAPP_RECIPIENT_SUBMITTER).lower()
    if normalized not in ALLOWED_WHATSAPP_RECIPIENTS:
        raise HTTPException(status_code=422, detail="Destinatario automazione WhatsApp non valido.")
    return normalized


def normalize_whatsapp_phone_source(value: Any) -> str:
    normalized = (_normalize_text(value) or WHATSAPP_PHONE_SOURCE_FORM_FIELD).lower()
    if normalized not in ALLOWED_WHATSAPP_PHONE_SOURCES:
        raise HTTPException(status_code=422, detail="Sorgente numero WhatsApp non valida.")
    return normalized


def serialize_whatsapp_automation(automation: WhatsAppAutomation) -> dict[str, Any]:
    form = automation.form
    return {
        "id": automation.id,
        "association_id": automation.association_id,
        "form_id": automation.form_id,
        "form": (
            {
                "id": form.id,
                "title": form.title,
                "public_slug": form.public_slug,
                "public_path": (
                    f"/forms/{form.organization.slug}/{form.public_slug}"
                    if form.organization is not None and getattr(form.organization, "slug", None)
                    else f"/forms/{form.public_slug}"
                ),
            }
            if form is not None
            else None
        ),
        "name": automation.name,
        "source_type": automation.source_type,
        "trigger_event": automation.trigger_event,
        "recipient_type": automation.recipient_type,
        "phone_source": automation.phone_source,
        "phone_field_key": automation.phone_field_key,
        "custom_phone": automation.custom_phone,
        "template_name": automation.template_name,
        "template_body": automation.template_body,
        "is_active": bool(automation.is_active),
        "created_by_user_id": automation.created_by_user_id,
        "created_at": automation.created_at.isoformat() if automation.created_at else None,
        "updated_at": automation.updated_at.isoformat() if automation.updated_at else None,
    }


def apply_whatsapp_automation_updates(
    automation: WhatsAppAutomation,
    *,
    form: Form | None,
    name: Any,
    source_type: Any,
    trigger_event: Any,
    recipient_type: Any,
    phone_source: Any,
    phone_field_key: Any,
    custom_phone: Any,
    template_name: Any,
    template_body: Any,
    is_active: bool,
) -> WhatsAppAutomation:
    normalized_name = _normalize_text(name)
    if normalized_name is None:
        raise HTTPException(status_code=422, detail="Nome automazione WhatsApp obbligatorio.")
    normalized_template_name = _normalize_text(template_name)
    if normalized_template_name is None:
        raise HTTPException(status_code=422, detail="Nome template WhatsApp obbligatorio.")
    normalized_template_body = _normalize_text(template_body)
    if normalized_template_body is None:
        raise HTTPException(status_code=422, detail="Messaggio template WhatsApp obbligatorio.")

    normalized_source_type = normalize_whatsapp_source_type(source_type)
    normalized_trigger_event = normalize_whatsapp_trigger_event(trigger_event)
    normalized_recipient_type = normalize_whatsapp_recipient_type(recipient_type)
    normalized_phone_source = normalize_whatsapp_phone_source(phone_source)

    normalized_phone_field_key = _normalize_text(phone_field_key)
    normalized_custom_phone = _normalize_text(custom_phone)
    if normalized_phone_source == WHATSAPP_PHONE_SOURCE_FORM_FIELD:
        if form is None:
            raise HTTPException(status_code=422, detail="Seleziona un form origine per usare un numero dal modulo.")
        allowed_phone_keys = {
            field.field_key
            for field in list(form.fields or [])
            if str(getattr(field, "field_type", "")).lower() == "phone"
        }
        if not normalized_phone_field_key:
            raise HTTPException(status_code=422, detail="Seleziona il campo telefono del form da usare.")
        if normalized_phone_field_key not in allowed_phone_keys:
            raise HTTPException(status_code=422, detail="Il campo telefono selezionato non appartiene al form scelto.")
        normalized_custom_phone = None
    elif normalized_phone_source == WHATSAPP_PHONE_SOURCE_CUSTOM:
        normalized_phone_field_key = None
        normalized_custom_phone = normalize_e164_phone(normalized_custom_phone)
        if not normalized_custom_phone:
            raise HTTPException(status_code=422, detail="Inserisci un numero WhatsApp valido in formato internazionale.")
    else:
        normalized_phone_field_key = None
        normalized_custom_phone = None

    automation.form_id = form.id if form is not None else None
    automation.name = normalized_name
    automation.source_type = normalized_source_type
    automation.trigger_event = normalized_trigger_event
    automation.recipient_type = normalized_recipient_type
    automation.phone_source = normalized_phone_source
    automation.phone_field_key = normalized_phone_field_key
    automation.custom_phone = normalized_custom_phone
    automation.template_name = normalized_template_name
    automation.template_body = normalized_template_body
    automation.is_active = bool(is_active)
    return automation
