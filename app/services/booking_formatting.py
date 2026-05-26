from __future__ import annotations

from datetime import date, datetime
from typing import Any


def format_booking_date_it(value: Any, *, fallback: str = "") -> str:
    if isinstance(value, datetime):
        return value.date().strftime("%d/%m/%Y")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")

    raw = str(value or "").strip()
    if not raw:
        return fallback

    for candidate in (raw[:10], raw):
        try:
            return date.fromisoformat(candidate).strftime("%d/%m/%Y")
        except ValueError:
            continue
    return raw
