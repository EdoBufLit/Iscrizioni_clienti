from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app import audit
from app.db import SessionLocal
from app.models import AnnualMembershipTerm, AnnualMembershipTermStatus
from app.services.annual_memberships import (
    AnnualDeactivationNotAllowedError,
    annual_membership_valid_through,
    as_rome_datetime,
    build_annual_deactivation_preview,
    execute_annual_deactivation,
    lock_annual_card_deactivation,
)


logger = logging.getLogger(__name__)


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
    # Generate the automatic preview after serializing other closings of this
    # year. Interactive requests still validate their user-reviewed snapshot.
    lock_annual_card_deactivation(db, membership_year=target_year)
    preview = build_annual_deactivation_preview(
        db,
        membership_year=target_year,
        now=current_time,
    )
    if preview["total_count"] == 0:
        return {
            "membership_year": target_year,
            "valid_through": preview["valid_through"],
            "deactivated_count": 0,
            "term_ids": [],
            "executed_at": None,
            "already_executed": False,
            "run_id": None,
            "not_yet_due": not preview["can_execute"],
        }
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


def deactivate_due_annual_memberships(
    *,
    db: Session,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Catch up every overdue issued annual card, including after downtime.

    Do not touch Member rows: account access, personal data, documents, the old
    card pointer and stock remain available for a later renewal. The Rome
    calendar also makes QR/check-in expiry effective if this worker is stopped.
    """

    current_time = now or datetime.utcnow()
    local_today = as_rome_datetime(current_time).date()
    years = (
        db.query(AnnualMembershipTerm.membership_year)
        .filter(
            AnnualMembershipTerm.membership_year < local_today.year,
            AnnualMembershipTerm.card_year == AnnualMembershipTerm.membership_year,
            AnnualMembershipTerm.status.notin_(
                [AnnualMembershipTermStatus.EXPIRED.value, AnnualMembershipTermStatus.CANCELLED.value]
            ),
        )
        .distinct()
        .order_by(AnnualMembershipTerm.membership_year.asc())
        .all()
    )
    results = [
        deactivate_expired_annual_memberships(db=db, membership_year=year, now=current_time)
        for (year,) in years
        if local_today > annual_membership_valid_through(year)
    ]
    return {
        "membership_years": [result["membership_year"] for result in results],
        "deactivated_count": sum(
            result["deactivated_count"] for result in results if not result["already_executed"]
        ),
        "term_ids": [
            term_id
            for result in results
            if not result["already_executed"]
            for term_id in result["term_ids"]
        ],
        "runs": results,
    }


def run_annual_membership_maintenance_job_once(
    *, now: datetime | None = None,
) -> dict[str, Any]:
    """Run a non-destructive closing in its own transaction; retry next cycle."""

    current_time = now or datetime.utcnow()
    db = None
    try:
        db = SessionLocal()
        result = deactivate_due_annual_memberships(db=db, now=current_time)
        if result["deactivated_count"]:
            audit.log_operation(
                db,
                action="annual_cards_deactivated",
                entity_type="annual_membership_term",
                actor_role="system",
                metadata={
                    "membership_years": result["membership_years"],
                    "deactivated_count": result["deactivated_count"],
                    "run_ids": [run["run_id"] for run in result["runs"] if run["run_id"] is not None],
                    "destructive_purge_disabled": True,
                },
            )
        db.commit()
        return {
            "ok": True,
            "ran_at": current_time.isoformat(),
            "purged_count": 0,
            "destructive_purge_disabled": True,
            **result,
        }
    except Exception:
        if db is not None:
            db.rollback()
        logger.exception("annual_membership_maintenance_job_failed")
        return {
            "ok": False,
            "deactivated_count": 0,
            "purged_count": 0,
            "destructive_purge_disabled": True,
        }
    finally:
        if db is not None:
            db.close()


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
