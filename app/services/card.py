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
    2. Find the first batch that still has capacity (next_no <= end_no)
    3. If a batch is exhausted (next_no > end_no), move to the next batch
    4. Atomically increment next_no and return the assigned number

    Concurrency safety:
    - Uses BEGIN IMMEDIATE for SQLite write lock
    - Validates uniqueness before assignment
    """
    # 1. Acquire write lock (SQLite-specific, prevents concurrent writes)
    db.execute(text("BEGIN IMMEDIATE"))

    # 2. Load all batches for this org, ordered by start_no for deterministic progression
    stmt = select(CardBatch).filter(
        CardBatch.org_id == org_id
    ).order_by(CardBatch.start_no)

    batches = db.execute(stmt).scalars().all()

    if not batches:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Nessun lotto tessere assegnato a questa associazione"
        )

    # 3. Find the first batch with remaining capacity
    batch = None
    for b in batches:
        # Determine the next available number for this batch
        effective_next = b.next_no if b.next_no is not None else b.start_no

        # Check if this batch has capacity
        if effective_next <= b.end_no:
            batch = b
            break

    # 4. If all batches are exhausted, raise error
    if batch is None:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Tutti i lotti tessere sono esauriti per questa associazione"
        )

    # 5. Initialize next_no if this is a fresh batch
    if batch.next_no is None:
        batch.next_no = batch.start_no

    # 6. Get the card number to assign
    candidate = batch.next_no

    # 7. Safety check: verify we're within range (should always pass given above logic)
    if candidate > batch.end_no:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Errore interno: numero tessera {candidate} fuori dal range {batch.start_no}-{batch.end_no}"
        )

    # 8. Global uniqueness check (defensive - should never happen with proper batch management)
    stmt_check = select(Member).filter(Member.card_no == candidate)
    existing = db.execute(stmt_check).scalars().first()
    if existing:
        db.rollback()
        logger.error(
            "Card number collision: %d already assigned to member %d",
            candidate, existing.id
        )
        raise HTTPException(
            status_code=500,
            detail=f"Conflitto numero tessera: {candidate} già assegnato"
        )

    # 9. Increment next_no for this batch
    batch.next_no = candidate + 1
    db.add(batch)

    # 10. Commit the transaction
    db.commit()

    logger.info(
        "Assigned card %d from batch %d (range %d-%d) for org %d",
        candidate, batch.id, batch.start_no, batch.end_no, org_id
    )

    return candidate, batch.id


def assign_next_card(db: Session, org_id: int) -> int:
    """
    Backward-compatible wrapper for callers expecting only card number.
    """
    card_no, _batch_id = assign_next_card_with_batch(db, org_id)
    return card_no
