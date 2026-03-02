from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.models import CardBatch, Member
from app.services.member_activity import member_active_filters

logger = logging.getLogger(__name__)


def compute_org_card_stock(
    db: Session,
    org_id: int,
    *,
    now: datetime | None = None,
) -> dict[str, int]:
    target_year = int((now or datetime.utcnow()).year)
    batches = (
        db.query(CardBatch.start_no, CardBatch.end_no)
        .filter(
            CardBatch.org_id == org_id,
            CardBatch.year == target_year,
            CardBatch.is_enabled.is_(True),
            CardBatch.released_at.is_(None),
        )
        .all()
    )
    if not batches:
        return {"total": 0, "used": 0, "remaining": 0}

    total = int(sum((end_no - start_no + 1) for start_no, end_no in batches))
    range_filters = [
        and_(Member.card_no >= start_no, Member.card_no <= end_no)
        for start_no, end_no in batches
    ]
    allocated_non_deleted = int(
        db.query(func.count(func.distinct(Member.card_no)))
        .filter(
            Member.org_id == org_id,
            Member.deleted_at.is_(None),
            Member.card_year == target_year,
            Member.card_no.isnot(None),
            or_(*range_filters),
        )
        .scalar()
        or 0
    )
    remaining = max(total - allocated_non_deleted, 0)
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

    total_rows = (
        db.query(
            CardBatch.org_id,
            func.sum(CardBatch.end_no - CardBatch.start_no + 1),
        )
        .filter(
            CardBatch.org_id.in_(org_ids),
            CardBatch.year == target_year,
            CardBatch.is_enabled.is_(True),
            CardBatch.released_at.is_(None),
        )
        .group_by(CardBatch.org_id)
        .all()
    )
    totals = {int(org_id): int(total or 0) for org_id, total in total_rows}

    allocated_rows = (
        db.query(
            Member.org_id,
            func.count(func.distinct(Member.card_no)),
        )
        .join(
            CardBatch,
            and_(
                CardBatch.org_id == Member.org_id,
                CardBatch.year == target_year,
                CardBatch.is_enabled.is_(True),
                CardBatch.released_at.is_(None),
                Member.card_no >= CardBatch.start_no,
                Member.card_no <= CardBatch.end_no,
            ),
        )
        .filter(
            Member.org_id.in_(org_ids),
            Member.deleted_at.is_(None),
            Member.card_year == target_year,
            Member.card_no.isnot(None),
        )
        .group_by(Member.org_id)
        .all()
    )
    allocated = {
        int(org_id): int(allocated_count or 0)
        for org_id, allocated_count in allocated_rows
    }

    return {
        org_id: max(totals.get(org_id, 0) - allocated.get(org_id, 0), 0)
        for org_id in org_ids
    }
