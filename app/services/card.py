from sqlalchemy.orm import Session
from sqlalchemy import select, text
from fastapi import HTTPException
from app.models import CardBatch, Member
import logging
from typing import Tuple

logger = logging.getLogger(__name__)


def assign_next_card_with_batch(db: Session, org_id: int) -> Tuple[int, int]:
    """
    Atomically assigns the next available membership card number for an organization.
    Returns (card_number, batch_id).

    Logic:
    1. Find all batches for this org, ordered by start_no (deterministic order)
    2. For each batch, compute occupied numbers from non-deleted members
    3. Pick the first free number in range (fills holes before progressing)
    4. Persist next_no and return the assigned number

    Concurrency safety:
    - Uses BEGIN IMMEDIATE for SQLite write lock
    - Validates uniqueness before assignment
    """
    # 1. Acquire write lock (SQLite-specific, prevents concurrent writes)
    db.execute(text("BEGIN IMMEDIATE"))

    # 2. Load all active batches for this org, ordered for deterministic progression
    stmt = select(CardBatch).filter(
        CardBatch.org_id == org_id,
        CardBatch.released_at.is_(None),
    ).order_by(CardBatch.start_no)

    batches = db.execute(stmt).scalars().all()

    if not batches:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Nessun lotto tessere assegnato a questa associazione"
        )

    # 3. Find the first free number across all active batches.
    for batch in batches:
        occupied_rows = db.execute(
            select(Member.card_no).filter(
                Member.org_id == org_id,
                Member.deleted_at.is_(None),
                Member.card_no.isnot(None),
                Member.card_no >= batch.start_no,
                Member.card_no <= batch.end_no,
            )
        ).all()
        occupied_numbers = {row[0] for row in occupied_rows if row[0] is not None}

        assigned_candidate = None
        for candidate in range(batch.start_no, batch.end_no + 1):
            if candidate not in occupied_numbers:
                assigned_candidate = candidate
                break

        if assigned_candidate is None:
            batch.next_no = batch.end_no + 1
            db.add(batch)
            continue

        baseline_next = batch.next_no if batch.next_no is not None else batch.start_no
        batch.next_no = max(baseline_next, assigned_candidate + 1)
        db.add(batch)
        db.commit()
        logger.info(
            "Assigned card %d from batch %d (range %d-%d) for org %d",
            assigned_candidate,
            batch.id,
            batch.start_no,
            batch.end_no,
            org_id,
        )
        return assigned_candidate, batch.id

    # 4. If all batches are exhausted (or fully colliding), surface business error.
    db.commit()
    raise HTTPException(
        status_code=409,
        detail="Tutti i lotti tessere sono esauriti per questa associazione"
    )


def assign_next_card(db: Session, org_id: int) -> int:
    """
    Backward-compatible wrapper for callers expecting only card number.
    """
    card_no, _batch_id = assign_next_card_with_batch(db, org_id)
    return card_no
