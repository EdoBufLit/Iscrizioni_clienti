"""Calendar policy shared by manual, bulk and automatic quota reminders."""

from datetime import datetime

from fastapi import HTTPException

from app.services.annual_memberships import as_rome_datetime


FIRST_QUOTE_REMINDER_YEAR = 2027


def quote_reminder_unavailable_reason(
    membership_year: int | None, *, now: datetime | None = None
) -> str | None:
    current_year = as_rome_datetime(now).year
    if current_year < FIRST_QUOTE_REMINDER_YEAR:
        return "I solleciti quota saranno disponibili dal 2027."
    if membership_year is None or membership_year < FIRST_QUOTE_REMINDER_YEAR:
        return "I solleciti sono disponibili dall'annualità 2027."
    if membership_year > current_year:
        return "L'annualità da sollecitare non è ancora iniziata."
    return None


def require_quote_reminder_available(
    membership_year: int | None, *, now: datetime | None = None
) -> None:
    reason = quote_reminder_unavailable_reason(membership_year, now=now)
    if reason:
        raise HTTPException(status_code=409, detail=reason)
