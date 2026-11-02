from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app import audit
from app.db import SessionLocal
from app.models import AnnualMembershipTerm, AnnualMembershipTermStatus, CardBatch
from app.services.annual_memberships import (
    AnnualDeactivationNotAllowedError,
    annual_membership_valid_through,
    as_rome_datetime,
    build_annual_deactivation_preview,
    execute_annual_deactivation,
    lock_annual_card_deactivation,
)
from app.services.card_lot_lifecycle import close_due_card_lots


logger = logging.getLogger(__name__)


def run_card_lot_closure_job_once(*, now: datetime | None = None) -> dict[str, Any]:
    """Close old-year stock in a separate transaction for each organization.

    This deliberately runs separately from annual-term maintenance: issued
    cards keep their grace day, while old stock closes at January 1 midnight.
    """

    current_time = now or datetime.utcnow()
    current_year = as_rome_datetime(current_time).year
    closed_ids: list[int] = []
    errors = 0
    try:
        with SessionLocal() as discovery:
            org_ids = [
                value for (value,) in discovery.query(CardBatch.org_id).filter(
                    CardBatch.year < current_year,
                    CardBatch.is_enabled.is_(True),
                ).distinct().order_by(CardBatch.org_id.asc()).all()
            ]
    except Exception:
        logger.exception("card_lot_closure_discovery_failed")
        return {"ok": False, "closed_count": 0, "batch_ids": [], "errors": 1}

    for org_id in org_ids:
        try:
            with SessionLocal() as db:
                # Null-organization rows cannot be allocated by normal tenant
                # issuance. Limit their query separately rather than closing
                # every organization in one transaction.
                if org_id is None:
                    batches = db.query(CardBatch).filter(
                        CardBatch.org_id.is_(None), CardBatch.year < current_year,
                        CardBatch.is_enabled.is_(True),
                    ).order_by(CardBatch.id).with_for_update().populate_existing().all()
                    result = {"batch_ids": [batch.id for batch in batches]}
                    for batch in batches:
                        batch.is_enabled = False
                else:
                    result = close_due_card_lots(db, now=current_time, org_id=org_id)
                if result["batch_ids"]:
                    audit.log_operation(
                        db,
                        action="card_lots_closed_for_new_year",
                        entity_type="card_batch",
                        actor_role="system",
                        metadata={
                            "org_id": org_id,
                            "current_year": current_year,
                            "batch_ids": result["batch_ids"],
                            "closed_count": len(result["batch_ids"]),
                            "stock_released": False,
                        },
                    )
                db.commit()
                closed_ids.extend(result["batch_ids"])
        except Exception:
            # Context-manager rollback preserves the tenant's complete state;
            # other tenants still close and the failed one retries next cycle.
            errors += 1
            logger.exception("card_lot_closure_failed org_id=%s", org_id)
    return {
        "ok": errors == 0,
        "closed_count": len(closed_ids),
        "batch_ids": closed_ids,
        "current_year": current_year,
        "errors": errors,
    }


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
