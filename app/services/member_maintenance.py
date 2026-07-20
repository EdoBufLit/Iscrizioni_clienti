from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.services.annual_memberships import (
    AnnualDeactivationNotAllowedError,
    as_rome_datetime,
    build_annual_deactivation_preview,
    execute_annual_deactivation,
)


def deactivate_expired_annual_memberships(
    *,
    db: Session,
    membership_year: int | None = None,
    now: datetime | None = None,
    actor_admin_id: int | None = None,
) -> dict[str, Any]:
    """Safely expire annual-term rows without deleting member or card data."""

    current_time = now or datetime.utcnow()
    target_year = int(membership_year or (as_rome_datetime(current_time).year - 1))
    preview = build_annual_deactivation_preview(
        db,
        membership_year=target_year,
        now=current_time,
    )
    try:
        return execute_annual_deactivation(
            db,
            membership_year=target_year,
            preview_hash=preview["preview_hash"],
            actor_admin_id=actor_admin_id,
            now=current_time,
        )
    except AnnualDeactivationNotAllowedError:
        return {
            "membership_year": target_year,
            "valid_through": preview["valid_through"],
            "deactivated_count": 0,
            "term_ids": [],
            "executed_at": None,
            "already_executed": False,
            "run_id": None,
            "not_yet_due": True,
        }


def expire_and_purge_members(
    *,
    db: Session,
    now: datetime | None = None,
    purge_pii: bool = True,
) -> dict[str, Any]:
    """Deprecated compatibility wrapper; destructive purging is intentionally disabled."""

    current_time = now or datetime.utcnow()
    result = deactivate_expired_annual_memberships(db=db, now=current_time)
    return {
        "expired_count": result["deactivated_count"],
        "purged_count": 0,
        "member_ids": [],
        "term_ids": result["term_ids"],
        "current_year": as_rome_datetime(current_time).year,
        "membership_year": result["membership_year"],
        "valid_through": result["valid_through"],
        "destructive_purge_disabled": True,
        "purge_pii_requested_but_ignored": bool(purge_pii),
        "already_executed": result["already_executed"],
    }
