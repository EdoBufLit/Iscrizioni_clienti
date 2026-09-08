from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Member
from app.services.card_availability import card_batch_availability, eligible_card_batches
from app.services.member_activity import member_active_filters

logger = logging.getLogger(__name__)


def compute_org_card_stock(
    db: Session,
    org_id: int,
    *,
    now: datetime | None = None,
) -> dict[str, int]:
    target_year = int((now or datetime.utcnow()).year)
    batches = eligible_card_batches(db, org_ids=[org_id], year=target_year)
    if not batches:
        return {"total": 0, "used": 0, "remaining": 0}
    availability = card_batch_availability(db, batches)
    total = sum(item.total for item in availability.values())
    remaining = sum(item.remaining for item in availability.values())
    active_used = int(
        db.query(func.count(Member.id))
        .filter(
            Member.org_id == org_id,
            *member_active_filters(now=now),
        )
        .scalar()
        or 0
    )

    return {
        "total": total,
        "used": active_used,
        "remaining": remaining,
    }


def get_remaining_cards(
    db: Session,
    association_id: int,
    *,
    now: datetime | None = None,
) -> int | None:
    try:
        return compute_org_card_stock(db, association_id, now=now)["remaining"]
    except Exception:
        logger.exception(
            "unable_to_compute_remaining_cards association_id=%s",
            association_id,
        )
        return None


def get_remaining_cards_by_org(
    db: Session,
    association_ids: list[int],
    *,
    now: datetime | None = None,
) -> dict[int, int]:
    target_year = int((now or datetime.utcnow()).year)
    org_ids = sorted({int(org_id) for org_id in association_ids if org_id is not None})
    if not org_ids:
        return {}

    batches = eligible_card_batches(db, org_ids=org_ids, year=target_year)
    availability = card_batch_availability(db, batches)
    remaining = {org_id: 0 for org_id in org_ids}
    for batch in batches:
        remaining[batch.org_id] += availability[batch.id].remaining
    return remaining


def get_total_cards_by_org(
    db: Session,
    association_ids: list[int],
    *,
    now: datetime | None = None,
) -> dict[int, int]:
    target_year = int((now or datetime.utcnow()).year)
    org_ids = sorted({int(org_id) for org_id in association_ids if org_id is not None})
    if not org_ids:
        return {}

    batches = eligible_card_batches(db, org_ids=org_ids, year=target_year)
    totals = {org_id: 0 for org_id in org_ids}
    for batch in batches:
        totals[batch.org_id] += batch.end_no - batch.start_no + 1
    return totals
