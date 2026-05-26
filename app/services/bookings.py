from __future__ import annotations

from datetime import date, datetime, timedelta
import html
import re
from typing import Any

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.models import Booking, BookingEvent, BookingEventSeries, BookingStatus, Form, FormSubmission
from app.services.booking_rooms import (
    auto_assign_booking_table,
    maybe_record_assignment_event,
    resolve_assignment_targets,
    validate_booking_assignment,
)
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload


BOOKING_FORM_TYPES = {"generic", "booking", "request", "survey"}
BOOKING_FIELD_TARGETS = {
    "customer_name",
    "customer_email",
    "customer_phone",
    "booking_date",
    "booking_time",
    "party_size",
    "notes",
}
BOOKING_STATUSES = {
    BookingStatus.NEW.value,
    BookingStatus.PENDING.value,
    BookingStatus.CONFIRMED.value,
    BookingStatus.SEATED.value,
    BookingStatus.COMPLETED.value,
    BookingStatus.CANCELLED.value,
    BookingStatus.NO_SHOW.value,
}
REQUEST_STATUS_LEGACY_NEW = "new"
REQUEST_STATUS_PENDING = "pending"
REQUEST_STATUS_CONFIRMED = "confirmed"
REQUEST_STATUS_REJECTED = "rejected"

_TIME_PATTERN = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def _normalize_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def normalize_form_type(value: Any, *, booking_enabled: bool = False) -> str:
    normalized = (_normalize_text(value) or ("booking" if booking_enabled else "generic")).lower()
    if normalized not in BOOKING_FORM_TYPES:
        raise HTTPException(status_code=422, detail="Tipo form non valido.")
    return "booking" if booking_enabled and normalized == "generic" else normalized


def normalize_booking_field_mapping(value: Any) -> dict[str, str]:
    if value in (None, "", {}):
        return {}
    if not isinstance(value, dict):
        raise HTTPException(status_code=422, detail="Mappatura campi prenotazione non valida.")
    normalized: dict[str, str] = {}
    for key, raw in value.items():
        if key not in BOOKING_FIELD_TARGETS:
            continue
        field_key = _normalize_text(raw)
        if field_key:
            normalized[key] = field_key[:64]
    return normalized


def serialize_booking_event(event: BookingEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "booking_id": event.booking_id,
        "event_type": event.event_type,
        "payload_json": event.payload_json or {},
        "created_at": event.created_at.isoformat() if event.created_at else None,
        "created_by_user_id": event.created_by_user_id,
    }


def _booking_customer_reminder_response(booking: Booking) -> dict[str, Any] | None:
    events = list(getattr(booking, "events", None) or [])
    if (
        getattr(booking, "customer_note", None)
        and getattr(booking, "customer_note_submitted_at", None)
        and not getattr(booking, "customer_note_reviewed_at", None)
    ):
        return {
            "status": "note",
            "label": "Note cliente",
            "event_type": "customer_note_from_reminder",
            "created_at": booking.customer_note_submitted_at.isoformat(),
        }
    tracked = {
        "customer_cancelled_from_reminder": ("cancelled", "Annullata dal cliente"),
        "customer_cancelled_from_reply": ("cancelled", "Annullata dal cliente"),
        "customer_reconfirmed_from_reminder": ("confirmed", "Confermata dal cliente"),
        "customer_reconfirmed_from_reply": ("confirmed", "Confermata dal cliente"),
    }
    for event in sorted(events, key=lambda item: item.created_at or datetime.min, reverse=True):
        if event.event_type in tracked:
            status, label = tracked[event.event_type]
            return {
                "status": status,
                "label": label,
                "event_type": event.event_type,
                "created_at": event.created_at.isoformat() if event.created_at else None,
            }
    return None


def serialize_booking(booking: Booking, *, include_events: bool = False) -> dict[str, Any]:
    request_status = _normalize_request_status(getattr(getattr(booking, "submission", None), "status", None))
    request_review_summary = _serialize_request_review_summary(getattr(booking, "submission", None))
    request_payload_summary = _serialize_request_payload_summary(booking)
    return {
        "id": booking.id,
        "association_id": booking.association_id,
        "form_id": booking.form_id,
        "submission_id": booking.submission_id,
        "status": booking.status,
        "customer_name": booking.customer_name,
        "customer_email": booking.customer_email,
        "customer_phone": booking.customer_phone,
        "booking_date": booking.booking_date.isoformat() if booking.booking_date else None,
        "booking_time": booking.booking_time,
        "party_size": booking.party_size,
        "notes": booking.notes,
        "notes_preview": (booking.notes or "")[:120] or None,
        "event_summary": _booking_event_summary(booking),
        "customer_note": booking.customer_note,
        "customer_note_submitted_at": (
            booking.customer_note_submitted_at.isoformat()
            if getattr(booking, "customer_note_submitted_at", None)
            else None
        ),
        "customer_note_reviewed_at": (
            booking.customer_note_reviewed_at.isoformat()
            if getattr(booking, "customer_note_reviewed_at", None)
            else None
        ),
        "has_unreviewed_customer_note": bool(
            getattr(booking, "customer_note", None)
            and getattr(booking, "customer_note_submitted_at", None)
            and not getattr(booking, "customer_note_reviewed_at", None)
        ),
        "customer_reminder_response": _booking_customer_reminder_response(booking),
        "room_id": booking.room_id,
        "table_id": booking.table_id,
        "room": {
            "id": booking.room.id,
            "name": booking.room.name,
            "is_active": bool(booking.room.is_active),
        }
        if booking.room is not None
        else None,
        "table": {
            "id": booking.table.id,
            "name": booking.table.name,
            "capacity": booking.table.capacity,
            "shape": booking.table.shape,
            "room_id": booking.table.room_id,
            "is_active": bool(booking.table.is_active),
            "is_out_of_service": bool(booking.table.is_out_of_service),
        }
        if booking.table is not None
        else None,
        "created_at": booking.created_at.isoformat() if booking.created_at else None,
        "updated_at": booking.updated_at.isoformat() if booking.updated_at else None,
        "confirmed_at": booking.confirmed_at.isoformat() if booking.confirmed_at else None,
        "cancelled_at": booking.cancelled_at.isoformat() if booking.cancelled_at else None,
        "source_form": {
            "id": booking.form.id,
            "title": booking.form.title,
            "public_slug": booking.form.public_slug,
        }
        if booking.form is not None
        else None,
        "submission": {
            "id": booking.submission.id,
            "submitted_at": booking.submission.submitted_at.isoformat() if booking.submission.submitted_at else None,
            "status": request_status,
        }
        if booking.submission is not None
        else None,
        "request_status": request_status,
        "request_review_summary": request_review_summary,
        "request_payload_summary": request_payload_summary,
        "events": [serialize_booking_event(item) for item in list(booking.events or [])] if include_events else [],
    }


def _normalize_request_status(value: Any) -> str | None:
    normalized = _normalize_text(value)
    if normalized is None:
        return None
    lowered = normalized.lower()
    if lowered == REQUEST_STATUS_LEGACY_NEW:
        return REQUEST_STATUS_PENDING
    if lowered in {REQUEST_STATUS_PENDING, REQUEST_STATUS_CONFIRMED, REQUEST_STATUS_REJECTED}:
        return lowered
    return lowered


def _serialize_request_review_summary(submission: FormSubmission | None) -> dict[str, Any] | None:
    if submission is None:
        return None
    return {
        "status": _normalize_request_status(getattr(submission, "status", None)),
        "reviewed_at": submission.reviewed_at.isoformat() if getattr(submission, "reviewed_at", None) else None,
        "review_reason": getattr(submission, "review_reason", None),
        "reviewed_by": {
            "id": submission.reviewed_by_admin.id,
            "email": submission.reviewed_by_admin.email,
        }
        if getattr(submission, "reviewed_by_admin", None) is not None
        else None,
    }


def _serialize_request_payload_summary(booking: Booking) -> list[dict[str, str]]:
    submission = getattr(booking, "submission", None)
    payload = getattr(submission, "payload_json", None)
    if not isinstance(payload, dict) or not payload:
        return []

    rows: list[dict[str, str]] = []
    seen_keys: set[str] = set()
    event_summary = _booking_event_summary(booking)
    if event_summary:
        rows.append({"key": "booking_event_summary", "label": "Serata", "value": event_summary})
        seen_keys.add("booking_event_summary")
    fields = list(getattr(getattr(booking, "form", None), "fields", []) or [])
    for field in sorted(
        fields,
        key=lambda item: (
            int(getattr(item, "sort_order", 0) or 0),
            int(getattr(item, "id", 0) or 0),
        ),
    ):
        field_key = str(getattr(field, "field_key", "") or "").strip()
        if not field_key:
            continue
        value = _summarize_payload_value(payload.get(field_key))
        if value is None:
            continue
        rows.append(
            {
                "key": field_key[:80],
                "label": (str(getattr(field, "label", "") or "").strip() or _humanize_payload_key(field_key))[:120],
                "value": value,
            }
        )
        seen_keys.add(field_key)

    for raw_key, raw_value in payload.items():
        key = str(raw_key or "").strip()
        if not key or key in seen_keys or key.startswith("__booking_"):
            continue
        value = _summarize_payload_value(raw_value)
        if value is None:
            continue
        rows.append({"key": key[:80], "label": _humanize_payload_key(key)[:120], "value": value})
        seen_keys.add(key)

    return rows[:24]


def _booking_event_summary(booking: Booking) -> str | None:
    notes = _normalize_text(getattr(booking, "notes", None))
    if not notes:
        return None
    return notes.split("\n\nNote richiesta:", 1)[0].strip()[:500] or None


def _summarize_payload_value(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return "Si" if value else "No"
    if isinstance(value, list):
        text = ", ".join(str(item).strip() for item in value if str(item).strip())
    elif isinstance(value, dict):
        text = ", ".join(
            f"{_humanize_payload_key(str(key))}: {str(item).strip()}"
            for key, item in value.items()
            if str(item).strip()
        )
    else:
        text = str(value).strip()
    return text[:500] if text else None


def _humanize_payload_key(value: str) -> str:
    cleaned = re.sub(r"[_\-]+", " ", str(value or "").strip())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:1].upper() + cleaned[1:] if cleaned else "Campo"


def _guess_customer_name(payload: dict[str, Any]) -> str:
    for key in ("customer_name", "nome_socio", "nome", "full_name", "name"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    first_name = str(payload.get("first_name") or "").strip()
    last_name = str(payload.get("last_name") or "").strip()
    combined = f"{first_name} {last_name}".strip()
    if combined:
        return combined
    email = str(payload.get("email") or "").strip()
    return email or "Prenotazione"


def _mapped_payload_value(mapping: dict[str, str], target: str, payload: dict[str, Any]) -> Any:
    key = mapping.get(target)
    if not key:
        return None
    return payload.get(key)


def _normalize_booking_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    normalized = _normalize_text(value)
    if not normalized:
        return None
    try:
        return date.fromisoformat(normalized)
    except Exception:
        return None


def _normalize_booking_time(value: Any) -> str | None:
    normalized = _normalize_text(value)
    if not normalized:
        return None
    if _TIME_PATTERN.fullmatch(normalized):
        return normalized
    return normalized[:16]


def _resolve_dynamic_booking_event(
    db: Session,
    *,
    form: Form,
    validated_payload: dict[str, Any],
    mapped_booking_date: date | None,
) -> dict[str, Any]:
    booking_date = (
        mapped_booking_date
        or _normalize_booking_date(validated_payload.get("__booking_date"))
        or _normalize_booking_date(validated_payload.get("booking_date"))
    )
    if booking_date is None:
        raise HTTPException(status_code=422, detail="Seleziona una data valida per la prenotazione.")

    booking_time = _normalize_booking_time(
        validated_payload.get("__booking_event_time") or validated_payload.get("booking_time")
    )
    if not booking_time or not _TIME_PATTERN.fullmatch(booking_time[:5]):
        raise HTTPException(status_code=422, detail="Seleziona un orario valido.")
    booking_time = booking_time[:5]

    raw_series_id = (
        validated_payload.get("__booking_event_series_id")
        or validated_payload.get("booking_event_series_id")
    )
    if raw_series_id in (None, ""):
        resolved_series = _find_dynamic_booking_series(
            db,
            form=form,
            booking_date=booking_date,
            booking_time=booking_time,
        )
        if resolved_series is not None:
            return {
                "booking_date": booking_date,
                "booking_time": booking_time,
                "event_details": _booking_event_series_details(resolved_series),
            }
        return {
            "booking_date": booking_date,
            "booking_time": booking_time,
            "event_details": None,
        }

    try:
        series_id = int(raw_series_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Seleziona una serata valida.") from None

    series = (
        db.query(BookingEventSeries)
        .options(joinedload(BookingEventSeries.time_slots))
        .filter(
            BookingEventSeries.id == series_id,
            BookingEventSeries.association_id == form.association_id,
            BookingEventSeries.is_active.is_(True),
        )
        .first()
    )
    if series is None:
        raise HTTPException(status_code=422, detail="La serata selezionata non e disponibile.")
    if bool(getattr(series, "is_default", False)):
        valid_slots = _booking_event_series_slot_times(series)
        if valid_slots and booking_time not in valid_slots:
            raise HTTPException(status_code=422, detail="L'orario selezionato non e disponibile per questa serata.")
        return {
            "booking_date": booking_date,
            "booking_time": booking_time,
            "event_details": _booking_event_series_details(series),
        }
    if not _series_matches_date(series, booking_date):
        raise HTTPException(status_code=422, detail="La serata selezionata non e disponibile per questa data.")

    valid_slots = _booking_event_series_slot_times(series)
    if booking_time not in valid_slots:
        raise HTTPException(status_code=422, detail="L'orario selezionato non e disponibile per questa serata.")

    return {
        "booking_date": booking_date,
        "booking_time": booking_time,
        "event_details": _booking_event_series_details(series),
    }


def _find_dynamic_booking_series(
    db: Session,
    *,
    form: Form,
    booking_date: date,
    booking_time: str,
) -> BookingEventSeries | None:
    candidates = (
        db.query(BookingEventSeries)
        .options(joinedload(BookingEventSeries.time_slots))
        .filter(
            BookingEventSeries.association_id == form.association_id,
            BookingEventSeries.is_active.is_(True),
            or_(
                BookingEventSeries.event_date == booking_date,
                BookingEventSeries.weekday == booking_date.weekday(),
                BookingEventSeries.is_default.is_(True),
            ),
        )
        .order_by(BookingEventSeries.is_default.asc(), BookingEventSeries.title.asc(), BookingEventSeries.id.asc())
        .all()
    )
    default_series: BookingEventSeries | None = None
    for series in candidates:
        if bool(getattr(series, "is_default", False)):
            if booking_time in _booking_event_series_slot_times(series):
                default_series = series
            continue
        if _series_matches_date(series, booking_date) and booking_time in _booking_event_series_slot_times(series):
            return series
    return default_series


def _booking_event_series_slot_times(series: BookingEventSeries) -> set[str]:
    return {
        str(slot.start_time or "")[:5]
        for slot in list(series.time_slots or [])
        if bool(getattr(slot, "is_active", True)) and str(slot.start_time or "")[:5]
    }


def _booking_event_series_details(series: BookingEventSeries) -> str:
    detail_parts = [series.title]
    if series.description:
        detail_parts.append(series.description)
    return "\n".join(part for part in detail_parts if part)


def _series_matches_date(series: BookingEventSeries, booking_date: date) -> bool:
    recurrence_type = (_normalize_text(getattr(series, "recurrence_type", None)) or "weekly").lower()
    if recurrence_type == "date":
        return getattr(series, "event_date", None) == booking_date
    return getattr(series, "weekday", None) == booking_date.weekday()


def _normalize_party_size(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        number = int(float(value))
    except Exception:
        return None
    return number if number > 0 else None


def _add_booking_event(
    db: Session,
    *,
    booking: Booking,
    event_type: str,
    payload_json: dict[str, Any] | None = None,
    created_by_user_id: int | None = None,
) -> BookingEvent:
    event = BookingEvent(
        booking_id=booking.id,
        event_type=event_type,
        payload_json=payload_json or {},
        created_by_user_id=created_by_user_id,
    )
    db.add(event)
    db.flush()
    return event


def _enqueue_booking_email(
    db: Session,
    *,
    booking: Booking,
    subject: str,
    intro: str,
    action_message: str,
    email_type: str,
) -> None:
    if not booking.customer_email:
        return
    date_line = booking.booking_date.isoformat() if booking.booking_date else "da definire"
    time_line = booking.booking_time or "da definire"
    text_body = (
        f"{intro}\n\n"
        f"Nome: {booking.customer_name}\n"
        f"Data: {date_line}\n"
        f"Orario: {time_line}\n"
        f"Persone: {booking.party_size or '-'}\n"
        f"{action_message}"
    )
    html_body = (
        f"<p>{html.escape(intro)}</p>"
        f"<ul>"
        f"<li><strong>Nome:</strong> {html.escape(booking.customer_name)}</li>"
        f"<li><strong>Data:</strong> {html.escape(date_line)}</li>"
        f"<li><strong>Orario:</strong> {html.escape(time_line)}</li>"
        f"<li><strong>Persone:</strong> {booking.party_size or '-'}</li>"
        f"</ul>"
        f"<p>{html.escape(action_message)}</p>"
    )
    enqueue_email(
        db,
        email_type=email_type,
        to_email=booking.customer_email,
        subject=subject,
        payload=build_email_payload(
            text_body=text_body,
            html_body=html_body,
            sender=build_sender_payload(
                mode="association",
                association=getattr(booking, "organization", None) or getattr(getattr(booking, "form", None), "organization", None),
            ),
            meta={
                "booking_id": booking.id,
                "form_id": booking.form_id,
                "association_id": booking.association_id,
            },
        ),
        priority=4,
    )


def create_booking_from_submission(
    db: Session,
    *,
    form: Form,
    submission: FormSubmission,
    validated_payload: dict[str, Any],
) -> Booking | None:
    booking_enabled = bool(getattr(form, "booking_enabled", False) or getattr(form, "create_booking", False))
    if not booking_enabled:
        return None

    mapping = normalize_booking_field_mapping(getattr(form, "booking_field_mapping", None) or {})
    customer_name = _normalize_text(_mapped_payload_value(mapping, "customer_name", validated_payload)) or _guess_customer_name(validated_payload)
    customer_email = _normalize_text(_mapped_payload_value(mapping, "customer_email", validated_payload))
    customer_phone = _normalize_text(_mapped_payload_value(mapping, "customer_phone", validated_payload))
    booking_date = _normalize_booking_date(getattr(form, "booking_event_date", None)) or _normalize_booking_date(
        _mapped_payload_value(mapping, "booking_date", validated_payload)
    )
    booking_time = _normalize_booking_time(getattr(form, "booking_event_time", None)) or _normalize_booking_time(
        _mapped_payload_value(mapping, "booking_time", validated_payload)
    )
    if bool(getattr(form, "booking_dynamic_events_enabled", False)):
        dynamic_event = _resolve_dynamic_booking_event(
            db,
            form=form,
            validated_payload=validated_payload,
            mapped_booking_date=booking_date,
        )
        booking_date = dynamic_event["booking_date"]
        booking_time = dynamic_event["booking_time"]
        event_details = dynamic_event["event_details"]
    else:
        event_details = _normalize_text(getattr(form, "booking_event_details", None))
    party_size = _normalize_party_size(_mapped_payload_value(mapping, "party_size", validated_payload))
    notes = _normalize_text(_mapped_payload_value(mapping, "notes", validated_payload))
    if event_details and notes:
        notes = f"{event_details}\n\nNote richiesta: {notes}"
    elif event_details:
        notes = event_details

    status = (
        BookingStatus.PENDING.value
        if bool(getattr(form, "booking_requires_manual_confirmation", True))
        else BookingStatus.CONFIRMED.value
    )
    now = datetime.utcnow()
    booking = Booking(
        association_id=form.association_id,
        form_id=form.id,
        submission_id=submission.id,
        status=status,
        customer_name=customer_name or "Prenotazione",
        customer_email=customer_email,
        customer_phone=customer_phone,
        booking_date=booking_date,
        booking_time=booking_time,
        party_size=party_size,
        notes=notes,
        confirmed_at=now if status == BookingStatus.CONFIRMED.value else None,
    )
    db.add(booking)
    db.flush()
    if bool(getattr(form, "booking_auto_assign_enabled", False)):
        resolved_room, resolved_table = auto_assign_booking_table(
            db,
            booking=booking,
        )
        if resolved_room is not None and resolved_table is not None:
            booking.room_id = resolved_room.id
            booking.table_id = resolved_table.id
            maybe_record_assignment_event(
                db,
                booking=booking,
                created_by_user_id=None,
                previous_room_id=None,
                previous_table_id=None,
            )
            db.flush()
    _add_booking_event(
        db,
        booking=booking,
        event_type="created_from_form_submission",
        payload_json={
            "form_id": form.id,
            "submission_id": submission.id,
            "status": status,
            "room_id": booking.room_id,
            "table_id": booking.table_id,
        },
    )

    if bool(getattr(form, "booking_notification_enabled", True)) and booking.customer_email:
        if status == BookingStatus.PENDING.value:
            _enqueue_booking_email(
                db,
                booking=booking,
                subject=f"Prenotazione ricevuta: {form.title}",
                intro=f"Abbiamo ricevuto la tua prenotazione per '{form.title}'.",
                action_message="La richiesta è in attesa di conferma da parte della segreteria.",
                email_type="booking_pending_confirmation",
            )
        else:
            _enqueue_booking_email(
                db,
                booking=booking,
                subject=f"Prenotazione confermata: {form.title}",
                intro=f"La tua prenotazione per '{form.title}' è stata confermata.",
                action_message="Ti aspettiamo all'orario indicato.",
                email_type="booking_confirmed",
            )
    return booking


def update_booking_status(
    db: Session,
    *,
    booking: Booking,
    next_status: str,
    created_by_user_id: int | None = None,
    room_id: int | None = None,
    table_id: int | None = None,
    notes: str | None = None,
    notify_customer: bool = True,
) -> Booking:
    normalized_status = (_normalize_text(next_status) or "").lower()
    if normalized_status not in BOOKING_STATUSES:
        raise HTTPException(status_code=422, detail="Stato prenotazione non valido.")

    previous_status = booking.status
    previous_room_id = booking.room_id
    previous_table_id = booking.table_id
    resolved_room, resolved_table = resolve_assignment_targets(
        db,
        association_id=booking.association_id,
        room_id=room_id,
        table_id=table_id,
    )
    validate_booking_assignment(
        db,
        booking=booking,
        room=resolved_room,
        table=resolved_table,
    )
    booking.status = normalized_status
    booking.room_id = resolved_room.id if resolved_room is not None else None
    booking.table_id = resolved_table.id if resolved_table is not None else None
    if notes is not None:
        booking.notes = _normalize_text(notes)
    now = datetime.utcnow()
    if normalized_status == BookingStatus.CONFIRMED.value and booking.confirmed_at is None:
        booking.confirmed_at = now
    if normalized_status == BookingStatus.CANCELLED.value and booking.cancelled_at is None:
        booking.cancelled_at = now
    _add_booking_event(
        db,
        booking=booking,
        event_type="status_updated",
        payload_json={
            "from_status": previous_status,
            "to_status": normalized_status,
            "room_id": booking.room_id,
            "table_id": booking.table_id,
        },
        created_by_user_id=created_by_user_id,
    )
    maybe_record_assignment_event(
        db,
        booking=booking,
        created_by_user_id=created_by_user_id,
        previous_room_id=previous_room_id,
        previous_table_id=previous_table_id,
    )
    if notify_customer and normalized_status != previous_status and bool(getattr(booking.form, "booking_notification_enabled", True)):
        if normalized_status == BookingStatus.CONFIRMED.value:
            _enqueue_booking_email(
                db,
                booking=booking,
                subject=f"Prenotazione confermata: {booking.form.title if booking.form else 'ASSONAM'}",
                intro="La tua prenotazione è stata confermata.",
                action_message="Ti aspettiamo all'orario indicato.",
                email_type="booking_confirmed_status_update",
            )
        elif normalized_status == BookingStatus.CANCELLED.value:
            _enqueue_booking_email(
                db,
                booking=booking,
                subject=f"Prenotazione annullata: {booking.form.title if booking.form else 'ASSONAM'}",
                intro="La tua prenotazione è stata annullata.",
                action_message="Per ulteriori informazioni contatta la segreteria.",
                email_type="booking_cancelled_status_update",
            )
    db.flush()
    return booking


def build_bookings_query(db: Session, *, association_id: int):
    return (
        db.query(Booking)
        .options(
            joinedload(Booking.form),
            joinedload(Booking.submission),
            joinedload(Booking.events),
            joinedload(Booking.room),
            joinedload(Booking.table),
        )
        .filter(Booking.association_id == association_id)
    )


def list_bookings(
    db: Session,
    *,
    association_id: int,
    anchor_date: date | None = None,
    status: str | None = None,
    form_id: int | None = None,
) -> list[Booking]:
    query = build_bookings_query(db, association_id=association_id)
    if anchor_date is not None:
        query = query.filter(Booking.booking_date == anchor_date)
    normalized_status = (_normalize_text(status) or "").lower()
    if normalized_status:
        query = query.filter(Booking.status == normalized_status)
    if form_id:
        query = query.filter(Booking.form_id == form_id)
    return (
        query.order_by(
            Booking.booking_date.asc().nulls_last(),
            Booking.booking_time.asc().nulls_last(),
            Booking.created_at.asc(),
            Booking.id.asc(),
        )
        .all()
    )


def agenda_day_payload(
    db: Session,
    *,
    association_id: int,
    agenda_date: date,
    status: str | None = None,
    form_id: int | None = None,
) -> dict[str, Any]:
    items = list_bookings(
        db,
        association_id=association_id,
        anchor_date=agenda_date,
        status=status,
        form_id=form_id,
    )
    return {
        "date": agenda_date.isoformat(),
        "items": [serialize_booking(item) for item in items],
        "total": len(items),
    }


def agenda_week_payload(
    db: Session,
    *,
    association_id: int,
    agenda_date: date,
    status: str | None = None,
    form_id: int | None = None,
) -> dict[str, Any]:
    week_start = agenda_date - timedelta(days=agenda_date.weekday())
    week_end = week_start + timedelta(days=6)
    query = build_bookings_query(db, association_id=association_id).filter(
        Booking.booking_date.isnot(None),
        Booking.booking_date >= week_start,
        Booking.booking_date <= week_end,
    )
    normalized_status = (_normalize_text(status) or "").lower()
    if normalized_status:
        query = query.filter(Booking.status == normalized_status)
    if form_id:
        query = query.filter(Booking.form_id == form_id)
    bookings = query.order_by(
        Booking.booking_date.asc(),
        Booking.booking_time.asc().nulls_last(),
        Booking.created_at.asc(),
    ).all()
    days: list[dict[str, Any]] = []
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        day_items = [serialize_booking(item) for item in bookings if item.booking_date == day]
        days.append(
            {
                "date": day.isoformat(),
                "weekday": day.strftime("%A"),
                "items": day_items,
                "total": len(day_items),
            }
        )
    return {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "days": days,
        "total": len(bookings),
    }
