from __future__ import annotations

from datetime import date, timedelta
import json
import re
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.models import BookingEventSeries, Form


BOOKING_AVAILABILITY_MODE_ALL = "all"
BOOKING_AVAILABILITY_MODE_SELECTED = "selected"
BOOKING_AVAILABILITY_MODES = {
    BOOKING_AVAILABILITY_MODE_ALL,
    BOOKING_AVAILABILITY_MODE_SELECTED,
}


def normalize_booking_availability_mode(value: Any) -> str:
    normalized = str(value or BOOKING_AVAILABILITY_MODE_ALL).strip().lower()
    return normalized if normalized in BOOKING_AVAILABILITY_MODES else BOOKING_AVAILABILITY_MODE_ALL


def normalize_booking_event_series_ids(value: Any) -> list[int]:
    if value in (None, ""):
        return []
    raw_items: Any = value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return []
        try:
            raw_items = json.loads(stripped)
        except Exception:
            raw_items = re.split(r"[,;\s]+", stripped)
    if isinstance(raw_items, dict):
        raw_items = raw_items.get("ids") or raw_items.get("items") or []
    if not isinstance(raw_items, (list, tuple, set)):
        raw_items = [raw_items]
    normalized: list[int] = []
    for item in raw_items:
        try:
            item_id = int(item)
        except (TypeError, ValueError):
            continue
        if item_id > 0 and item_id not in normalized:
            normalized.append(item_id)
    return normalized


def selected_booking_event_series_ids(form: Form) -> list[int]:
    return normalize_booking_event_series_ids(getattr(form, "booking_event_series_ids", None))


def booking_event_series_slot_times(series: BookingEventSeries) -> list[str]:
    slots: list[str] = []
    seen: set[str] = set()
    for slot in list(series.time_slots or []):
        slot_time = str(slot.start_time or "")[:5]
        if not bool(getattr(slot, "is_active", True)) or not slot_time or slot_time in seen:
            continue
        seen.add(slot_time)
        slots.append(slot_time)
    return slots


def series_matches_date(series: BookingEventSeries, date_value: date) -> bool:
    recurrence_type = str(getattr(series, "recurrence_type", None) or "weekly").strip().lower()
    if recurrence_type == "date":
        return getattr(series, "event_date", None) == date_value
    return getattr(series, "weekday", None) == date_value.weekday()


def is_form_date_closed(db: Session, *, form: Form, date_value: date) -> bool:
    return (
        db.query(BookingEventSeries.id)
        .filter(
            BookingEventSeries.association_id == form.association_id,
            BookingEventSeries.is_active.is_(True),
            BookingEventSeries.is_closed.is_(True),
            or_(
                BookingEventSeries.event_date == date_value,
                BookingEventSeries.weekday == date_value.weekday(),
            ),
        )
        .first()
        is not None
    )


def _form_uses_selected_mode(form: Form) -> bool:
    return normalize_booking_availability_mode(
        getattr(form, "booking_availability_mode", None)
    ) == BOOKING_AVAILABILITY_MODE_SELECTED


def form_allows_booking_event_series(form: Form, series: BookingEventSeries) -> bool:
    if bool(getattr(series, "is_closed", False)):
        return False
    if not _form_uses_selected_mode(form):
        return True
    return int(series.id or 0) in set(selected_booking_event_series_ids(form))


def form_has_active_booking_slot_rules(db: Session, *, form: Form) -> bool:
    if _form_uses_selected_mode(form):
        return True
    return (
        db.query(BookingEventSeries.id)
        .filter(
            BookingEventSeries.association_id == form.association_id,
            BookingEventSeries.is_active.is_(True),
            BookingEventSeries.is_closed.is_(False),
        )
        .first()
        is not None
    )


def form_requires_booking_series_match(form: Form) -> bool:
    return _form_uses_selected_mode(form)


def _matching_series_candidates(db: Session, *, form: Form, date_value: date) -> list[BookingEventSeries]:
    return (
        db.query(BookingEventSeries)
        .options(joinedload(BookingEventSeries.time_slots))
        .filter(
            BookingEventSeries.association_id == form.association_id,
            BookingEventSeries.is_active.is_(True),
            BookingEventSeries.is_closed.is_(False),
            or_(
                BookingEventSeries.event_date == date_value,
                BookingEventSeries.weekday == date_value.weekday(),
                BookingEventSeries.is_default.is_(True),
            ),
        )
        .order_by(
            BookingEventSeries.is_default.desc(),
            BookingEventSeries.title.asc(),
            BookingEventSeries.id.asc(),
        )
        .all()
    )


def form_date_has_bookable_slot_rules(db: Session, *, form: Form, date_value: date) -> bool:
    if is_form_date_closed(db, form=form, date_value=date_value):
        return False
    candidates = [
        item
        for item in _matching_series_candidates(db, form=form, date_value=date_value)
        if form_allows_booking_event_series(form, item)
    ]
    return any(booking_event_series_slot_times(item) for item in candidates)


def series_has_public_time(series: BookingEventSeries, time_value: str | None) -> bool:
    if not time_value:
        return True
    return time_value in set(booking_event_series_slot_times(series))


def public_booking_events_payload(
    db: Session,
    *,
    form: Form,
    date_value: date,
    time_value: str | None = None,
) -> dict[str, object]:
    inactive_payload = {
        "items": [],
        "using_default": False,
        "has_active_rules": False,
        "date_open": True,
        "date_closed": False,
        "available_slots": [],
    }
    if not bool(getattr(form, "booking_dynamic_events_enabled", False)):
        return inactive_payload

    normalized_time = normalize_public_booking_time(time_value)
    uses_selected_mode = _form_uses_selected_mode(form)
    if is_form_date_closed(db, form=form, date_value=date_value):
        return {
            **inactive_payload,
            "has_active_rules": uses_selected_mode,
            "date_open": False,
            "date_closed": True,
        }

    items = [
        item
        for item in _matching_series_candidates(db, form=form, date_value=date_value)
        if form_allows_booking_event_series(form, item)
    ]
    matching_items = [
        item
        for item in items
        if (
            not bool(getattr(item, "is_default", False))
            and series_matches_date(item, date_value)
            and series_has_public_time(item, normalized_time)
        )
    ]
    default_items = [
        item
        for item in items
        if bool(getattr(item, "is_default", False)) and series_has_public_time(item, normalized_time)
    ]
    response_items = matching_items + [item for item in default_items[:1] if item not in matching_items]
    available_slots: list[str] = []
    seen_slots: set[str] = set()
    for item in response_items:
        for slot_time in booking_event_series_slot_times(item):
            if slot_time in seen_slots:
                continue
            seen_slots.add(slot_time)
            available_slots.append(slot_time)
    has_current_day_slot_rules = bool(available_slots)
    return {
        "items": [_serialize_public_series(item) for item in response_items],
        "using_default": not bool(matching_items) and bool(response_items),
        "has_active_rules": has_current_day_slot_rules or uses_selected_mode,
        "date_open": has_current_day_slot_rules or not uses_selected_mode,
        "date_closed": False,
        "available_slots": available_slots,
    }


def public_booking_available_dates_payload(
    db: Session,
    *,
    form: Form,
    start_date: date,
    days: int,
) -> dict[str, object]:
    bounded_days = min(max(int(days or 30), 1), 180)
    items: list[dict[str, object]] = []
    for offset in range(bounded_days):
        date_value = start_date + timedelta(days=offset)
        day_payload = public_booking_events_payload(db, form=form, date_value=date_value)
        if bool(day_payload.get("date_open", True)):
            items.append(
                {
                    "date": date_value.isoformat(),
                    "available_slots": day_payload.get("available_slots", []),
                    "using_default": bool(day_payload.get("using_default", False)),
                    "has_active_rules": bool(day_payload.get("has_active_rules", False)),
                }
            )
    return {
        "items": items,
        "start_date": start_date.isoformat(),
        "days": bounded_days,
    }


def find_form_booking_series_for_time(
    db: Session,
    *,
    form: Form,
    booking_date: date,
    booking_time: str,
) -> BookingEventSeries | None:
    candidates = [
        item
        for item in _matching_series_candidates(db, form=form, date_value=booking_date)
        if form_allows_booking_event_series(form, item)
    ]
    default_series: BookingEventSeries | None = None
    for series in candidates:
        if bool(getattr(series, "is_default", False)):
            if booking_time in set(booking_event_series_slot_times(series)):
                default_series = series
            continue
        if series_matches_date(series, booking_date) and booking_time in set(booking_event_series_slot_times(series)):
            return series
    return default_series


def normalize_public_booking_time(value: str | None) -> str | None:
    normalized = str(value or "").strip()[:5]
    if not normalized:
        return None
    return normalized if re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", normalized) else None


def _serialize_public_series(item: BookingEventSeries) -> dict[str, object]:
    return {
        "id": item.id,
        "title": item.title,
        "name": item.title,
        "description": item.description,
        "recurrence_type": item.recurrence_type,
        "weekday": item.weekday,
        "event_date": item.event_date.isoformat() if item.event_date else None,
        "specific_date": item.event_date.isoformat() if item.event_date else None,
        "is_default": bool(getattr(item, "is_default", False)),
        "is_closed": bool(getattr(item, "is_closed", False)),
        "time_slots": [
            {
                "id": slot.id,
                "event_series_id": item.id,
                "start_time": slot.start_time,
                "time": str(slot.start_time)[:5],
                "is_active": bool(getattr(slot, "is_active", True)),
                "sort_order": slot.sort_order,
            }
            for slot in list(item.time_slots or [])
            if bool(getattr(slot, "is_active", True))
        ],
    }
