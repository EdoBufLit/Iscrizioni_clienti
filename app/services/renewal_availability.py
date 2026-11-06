"""Launch gate for starting annual renewals; settlement is deliberately separate."""
from datetime import date, datetime
from fastapi import HTTPException
from app.services.annual_memberships import as_rome_datetime

RENEWALS_OPEN_ON = date(2027, 1, 1)


def renewals_available(*, now: datetime | None = None) -> bool:
    return as_rome_datetime(now).date() >= RENEWALS_OPEN_ON


def require_renewals_open(*, now: datetime | None = None) -> None:
    if not renewals_available(now=now):
        raise HTTPException(status_code=409, detail="Il rinnovo annuale sarà disponibile dal 1 gennaio 2027, ora italiana.")
