from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Booking, FormSubmission, Member, Organization, WhatsAppConnection
from app.services.email_templates import build_template_context, render_template_string
from app.services.whatsapp_evolution import EvolutionApiError, EvolutionLiteClient, normalize_phone
from app.services.whatsapp_sync import (
    create_pending_outbound_message,
    finalize_outbound_send,
    get_or_create_chat_for_number,
    mark_outbound_message_failed,
)

logger = logging.getLogger(__name__)

DEFAULT_FORM_SUBMISSION_WHATSAPP_TEMPLATE = (
    "Ciao {{nome_contatto}}, la tua richiesta per {{titolo_form}} e stata registrata correttamente. "
    "Ti ricontatteremo presto."
)

AVAILABLE_WHATSAPP_AUTOMATION_VARIABLES = [
    {"key": "nome_contatto", "placeholder": "{{nome_contatto}}", "label": "Nome contatto"},
    {"key": "nome_associazione", "placeholder": "{{nome_associazione}}", "label": "Nome associazione"},
    {"key": "titolo_form", "placeholder": "{{titolo_form}}", "label": "Titolo form"},
    {"key": "id_richiesta", "placeholder": "{{id_richiesta}}", "label": "ID richiesta"},
    {"key": "email_destinatario", "placeholder": "{{email_destinatario}}", "label": "Email destinatario"},
    {"key": "numero_whatsapp", "placeholder": "{{numero_whatsapp}}", "label": "Numero WhatsApp"},
    {"key": "data_prenotazione", "placeholder": "{{data_prenotazione}}", "label": "Data prenotazione"},
    {"key": "orario_prenotazione", "placeholder": "{{orario_prenotazione}}", "label": "Orario prenotazione"},
    {"key": "numero_persone", "placeholder": "{{numero_persone}}", "label": "Numero persone"},
]

_WHATSAPP_FORM_PHONE_KEYS = (
    "phone",
    "telefono",
    "cellulare",
    "whatsapp",
    "whatsapp_number",
    "numero_telefono",
)
_WHATSAPP_FORM_NAME_KEYS = (
    "nome_socio",
    "nome_cliente",
    "customer_name",
    "name",
    "nome",
    "full_name",
    "nome_e_cognome",
)


def prepare_form_submission_whatsapp_candidate(
    *,
    form: Any,
    submission: FormSubmission,
    member: Member | None,
    booking: Booking | None,
) -> dict[str, Any]:
    payload = submission.payload_json if isinstance(submission.payload_json, dict) else {}
    phone_number = _resolve_phone_from_form_payload(payload)
    source = "form"
    if phone_number is None and booking is not None:
        phone_number = normalize_phone(getattr(booking, "customer_phone", None))
        source = "booking"
    if phone_number is None and member is not None:
        phone_number = normalize_phone(getattr(member, "phone", None))
        source = "member"
    return {
        "available": bool(phone_number),
        "phone_number": phone_number,
        "source": source if phone_number else None,
        "org_id": getattr(form, "association_id", None),
        "form_id": getattr(form, "id", None),
        "submission_id": submission.id,
        "member_id": member.id if member is not None else None,
        "booking_id": booking.id if booking is not None else None,
        "notes": (
            "Automazione WhatsApp per-form: prende il numero prima dal payload del form, "
            "poi dalla prenotazione, poi dal socio associato."
        ),
    }


def maybe_send_form_submission_whatsapp_message(
    db: Session,
    *,
    form: Any,
    submission: FormSubmission,
    member: Member | None,
    booking: Booking | None,
) -> dict[str, Any]:
    if not settings.ENABLE_WHATSAPP_EVOLUTION:
        return {"sent": False, "reason": "feature_disabled"}
    if not bool(getattr(form, "whatsapp_auto_reply_enabled", False)):
        return {"sent": False, "reason": "form_disabled"}

    organization = getattr(form, "organization", None)
    if organization is None or not bool(getattr(organization, "communications_enabled", False)):
        return {"sent": False, "reason": "communications_disabled"}

    candidate = prepare_form_submission_whatsapp_candidate(
        form=form,
        submission=submission,
        member=member,
        booking=booking,
    )
    if not candidate["available"]:
        return {"sent": False, "reason": "missing_phone"}

    connection = (
        db.query(WhatsAppConnection)
        .filter(WhatsAppConnection.org_id == int(form.association_id))
        .first()
    )
    if connection is None or connection.status != "connected":
        return {"sent": False, "reason": "connection_unavailable"}

    text = render_form_submission_whatsapp_template(
        form=form,
        submission=submission,
        member=member,
        booking=booking,
        organization=organization,
        phone_number=candidate["phone_number"],
    ).strip()
    if not text:
        return {"sent": False, "reason": "empty_template"}

    display_name = _resolve_contact_name(
        submission=submission,
        member=member,
        booking=booking,
    )

    try:
        chat = get_or_create_chat_for_number(
            db,
            connection=connection,
            number=candidate["phone_number"],
            display_name=display_name,
        )
    except ValueError:
        return {"sent": False, "reason": "invalid_phone"}

    pending_message = create_pending_outbound_message(
        db,
        connection=connection,
        chat=chat,
        text_body=text,
    )
    client = EvolutionLiteClient()
    try:
        send_result = client.send_text(
            connection.instance_name,
            number=candidate["phone_number"],
            text=text,
        )
        finalize_outbound_send(pending_message, send_result)
        logger.info(
            "form_submission_whatsapp_sent org_id=%s form_id=%s submission_id=%s message_id=%s",
            form.association_id,
            form.id,
            submission.id,
            pending_message.id,
        )
        return {
            "sent": True,
            "chat_id": chat.id,
            "message_id": pending_message.id,
            "source": candidate["source"],
        }
    except EvolutionApiError as exc:
        mark_outbound_message_failed(pending_message, error_message=str(exc))
        logger.warning(
            "form_submission_whatsapp_failed org_id=%s form_id=%s submission_id=%s error=%s",
            form.association_id,
            form.id,
            submission.id,
            exc,
        )
        return {"sent": False, "reason": "send_failed"}


def render_form_submission_whatsapp_template(
    *,
    form: Any,
    submission: FormSubmission,
    member: Member | None,
    booking: Booking | None,
    organization: Organization | None,
    phone_number: str | None,
) -> str:
    template = (
        getattr(form, "whatsapp_auto_reply_template", None)
        or DEFAULT_FORM_SUBMISSION_WHATSAPP_TEMPLATE
    )
    context = _build_form_submission_whatsapp_context(
        form=form,
        submission=submission,
        member=member,
        booking=booking,
        organization=organization,
        phone_number=phone_number,
    )
    return render_template_string(template, context=context) or ""


def _build_form_submission_whatsapp_context(
    *,
    form: Any,
    submission: FormSubmission,
    member: Member | None,
    booking: Booking | None,
    organization: Organization | None,
    phone_number: str | None,
) -> dict[str, str]:
    payload = submission.payload_json if isinstance(submission.payload_json, dict) else {}
    contact_name = _resolve_contact_name(
        submission=submission,
        member=member,
        booking=booking,
    )
    email_value = _resolve_submitter_email(submission=submission, member=member, booking=booking)
    context = build_template_context(
        association=organization,
        member=member,
        extra_context={
            "titolo_form": str(getattr(form, "title", "") or ""),
            "email_destinatario": email_value or "",
            "nome_contatto": contact_name or "",
            "numero_whatsapp": phone_number or "",
            "id_richiesta": str(submission.id),
            "data_prenotazione": booking.booking_date.isoformat() if booking and booking.booking_date else "",
            "orario_prenotazione": booking.booking_time if booking and booking.booking_time else "",
            "numero_persone": str(booking.party_size or "") if booking else "",
        },
    )
    if contact_name:
        context["nome_socio"] = contact_name
    for key, value in payload.items():
        normalized_key = str(key or "").strip()
        if not normalized_key:
            continue
        context[normalized_key] = _stringify_template_value(value)
    return context


def _resolve_phone_from_form_payload(payload: dict[str, Any]) -> str | None:
    for key, value in payload.items():
        normalized_key = str(key or "").strip().lower()
        if normalized_key not in _WHATSAPP_FORM_PHONE_KEYS:
            continue
        if isinstance(value, str):
            normalized_phone = normalize_phone(value)
            if normalized_phone:
                return normalized_phone
    return None


def _resolve_name_from_form_payload(payload: dict[str, Any]) -> str | None:
    for key, value in payload.items():
        normalized_key = str(key or "").strip().lower()
        if normalized_key not in _WHATSAPP_FORM_NAME_KEYS:
            continue
        cleaned = str(value or "").strip()
        if cleaned:
            return cleaned[:255]
    return None


def _resolve_contact_name(
    *,
    submission: FormSubmission,
    member: Member | None,
    booking: Booking | None,
) -> str | None:
    payload = submission.payload_json if isinstance(submission.payload_json, dict) else {}
    payload_name = _resolve_name_from_form_payload(payload)
    if payload_name:
        return payload_name
    if booking is not None and getattr(booking, "customer_name", None):
        return str(booking.customer_name).strip()[:255] or None
    if member is not None:
        full_name = " ".join(
            part.strip()
            for part in [getattr(member, "first_name", None) or "", getattr(member, "last_name", None) or ""]
            if part and str(part).strip()
        ).strip()
        if full_name:
            return full_name[:255]
    return None


def _resolve_submitter_email(
    *,
    submission: FormSubmission,
    member: Member | None,
    booking: Booking | None,
) -> str | None:
    payload = submission.payload_json if isinstance(submission.payload_json, dict) else {}
    for key, value in payload.items():
        if str(key or "").strip().lower() != "email":
            continue
        cleaned = str(value or "").strip().lower()
        if cleaned:
            return cleaned
    if booking is not None and getattr(booking, "customer_email", None):
        return str(booking.customer_email).strip().lower() or None
    if member is not None and getattr(member, "email", None):
        return str(member.email).strip().lower() or None
    return None


def _stringify_template_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Si" if value else "No"
    if isinstance(value, list):
        return ", ".join(str(item).strip() for item in value if str(item).strip())
    return str(value).strip()
