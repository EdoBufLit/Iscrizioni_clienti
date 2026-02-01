from sqlalchemy.orm import Session
from sqlalchemy import select, text
from fastapi import HTTPException
from app.models import CardBatch, Member

def assign_next_card(db: Session, org_id: int) -> int:
    """
    Atomically assigns the next available membership card number
    for the given organization.
    """
    # 1. Lock for write (SQLite)
    db.execute(text("BEGIN IMMEDIATE"))

    # 2. Load the CardBatch row
    stmt = select(CardBatch).filter(
        CardBatch.org_id == org_id,
        # We want the active batch.
        # Logic: We pick the first one where next_no <= end_no, or next_no IS NULL (handled below)
        # But step 3 says "If batch.next_no is NULL -> set it to batch.start_no"
        # And we want to find a batch that is NOT exhausted.
        # "If batch.next_no > batch.end_no -> raise ... exhausted" implies we check specific batch.
        # Usually we want to find *any* batch that has capacity.
        # Ordering by start_no ensures we fill them sequentially.
    ).order_by(CardBatch.start_no)

    # We fetch all or first?
    # If we fetch first, and it's exhausted, do we fail?
    # The instructions say: "Load the CardBatch row for org_id... If batch.next_no > batch.end_no -> raise"
    # This implies we load *a* batch. If multiple exist, we should probably pick the current one.
    # I'll pick the first one that is either fresh (next_no is None) or has capacity (next_no <= end_no).
    # OR, if the user implies there's only one "active" batch?
    # "Card ranges... always continuing from the last assigned card."
    # I will search for the first batch that is not exhausted.

    batches = db.execute(stmt).scalars().all()

    if not batches:
        raise HTTPException(status_code=409, detail="No card range assigned to this organization")

    # Find first non-exhausted batch
    batch = None
    for b in batches:
        if b.next_no is None:
             # It's fresh
             batch = b
             break
        if b.next_no <= b.end_no:
             batch = b
             break

    # If all exhausted, use the last one to raise the error from?
    # Or just raise now?
    # "If batch.next_no > batch.end_no -> raise HTTPException 409 'Card range exhausted...'"
    # I'll default to the last batch if all are exhausted, so the check fails there.
    if not batch:
        batch = batches[-1]

    # 3. If batch.next_no is NULL -> set it to batch.start_no
    if batch.next_no is None:
        batch.next_no = batch.start_no

    # 4. If batch.next_no > batch.end_no -> raise ...
    if batch.next_no > batch.end_no:
        raise HTTPException(status_code=409, detail="Card range exhausted for this organization")

    # 5. candidate = batch.next_no
    candidate = batch.next_no

    # 6. Global uniqueness check
    stmt_check = select(Member).filter(Member.card_no == candidate)
    existing = db.execute(stmt_check).scalars().first()
    if existing:
        db.rollback()
        raise HTTPException(status_code=500, detail="Card number collision (unexpected)")

    # 7. Increment batch.next_no by 1
    batch.next_no += 1
    db.add(batch)

    # 8. db.commit()
    db.commit()

    # 9. return candidate
    return candidate
