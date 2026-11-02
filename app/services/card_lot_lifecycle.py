"""Calendar closure of stock, independent of the grace day for issued cards."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import CardBatch
from app.services.annual_memberships import as_rome_datetime


def is_closed_by_year(batch: CardBatch, now: datetime | None = None) -> bool:
    """A past-year lot cannot issue new cards, even before the worker runs."""

    try:
        year = int(batch.year)
    except (AttributeError, TypeError, ValueError):
        return True
    return year < as_rome_datetime(now).year


def require_card_lot_year_open(batch: CardBatch, now: datetime | None = None) -> None:
    if is_closed_by_year(batch, now):
        raise HTTPException(
            status_code=409,
            detail=(
                "Il lotto è chiuso per cambio anno. Le tessere residue conservano "
                "l'annualità originaria: richiedi un nuovo lotto per l'anno corrente."
            ),
        )


def close_due_card_lots(
    db: Session,
    *,
    now: datetime | None = None,
    org_id: int | None = None,
) -> dict[str, Any]:
    """Disable overdue stock without releasing numbers or changing its history.

    The background job invokes this for one organization per transaction, so
    allocation-domain locks are released before moving to another tenant. No
    annual-term closing lock is held while acquiring an allocation-domain lock.
    """

    # Allocation imports the calendar guard, so importing it here avoids a
    # module cycle and keeps read-only guards independent of allocation code.
    from app.services.card_allocation import lock_card_allocation

    current_year = as_rome_datetime(now).year
    query = db.query(CardBatch.org_id).filter(
        CardBatch.year < current_year,
        CardBatch.is_enabled.is_(True),
    )
    if org_id is not None:
        query = query.filter(CardBatch.org_id == org_id)
    org_ids = [value for (value,) in query.distinct().order_by(CardBatch.org_id.asc()).all()]
    closed_ids: list[int] = []
    for tenant_id in org_ids:
        if tenant_id is not None:
            lock_card_allocation(db, org_id=tenant_id, year=current_year)
        batches = (
            db.query(CardBatch)
            .filter(
                CardBatch.org_id == tenant_id,
                CardBatch.year < current_year,
                CardBatch.is_enabled.is_(True),
            )
            .order_by(CardBatch.id.asc())
            .with_for_update()
            .populate_existing()
            .all()
        )
        for batch in batches:
            if is_closed_by_year(batch, now) and batch.is_enabled:
                batch.is_enabled = False
                closed_ids.append(batch.id)
        # The next locked query must see the just-closed rows with autoflush off.
        db.flush()
    return {"closed_count": len(closed_ids), "batch_ids": closed_ids, "current_year": current_year}
