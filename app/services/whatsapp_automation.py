from __future__ import annotations

from typing import Any

from app.models import Booking, FormSubmission, Member
from app.services.whatsapp_evolution import normalize_phone

_WHATSAPP_FORM_PHONE_KEYS = (
    "phone",
    "telefono",
    "cellulare",
    "whatsapp",
    "whatsapp_number",
    "numero_telefono",
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
            "Struttura pronta per futuro invio automatico WhatsApp. "
            "Da richiamare nel submit pubblico dopo la creazione di submission/booking, senza attivazione globale."
        ),
    }


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
