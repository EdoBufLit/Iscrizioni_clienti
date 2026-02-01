from sqlalchemy.orm import Session
from sqlalchemy import select, text
from fastapi import HTTPException
from app.models import CardBatch, Member

def assign_next_card(db: Session, member_id: int, org_id: int) -> int:
    """
    Atomically assigns the next available membership card number
    for the given organization.

    Rules:
    - Card numbers are globally unique
    - Must respect CardBatch ranges
    - Must be safe under concurrency
    - Must fail if range is exhausted
    """
    # Lock the row (SQLite: BEGIN IMMEDIATE)
    db.execute(text("BEGIN IMMEDIATE"))

    # Query the active CardBatch for org_id
    stmt = select(CardBatch).filter(
        CardBatch.org_id == org_id,
        CardBatch.next_no <= CardBatch.end_no
    ).order_by(CardBatch.start_no)

    batch = db.execute(stmt).scalars().first()

    if not batch:
        # Check if we have ANY batch (to distinguish exhausted vs no range)
        stmt_any = select(CardBatch).filter(CardBatch.org_id == org_id)
        any_batch = db.execute(stmt_any).scalars().first()

        if any_batch:
            raise HTTPException(status_code=409, detail="Card range exhausted for this organization")
        else:
            raise HTTPException(status_code=409, detail="No card range assigned to this organization")

    # Assign
    assigned_number = batch.next_no
    batch.next_no += 1
    db.add(batch)

    # Assign to member
    member = db.execute(select(Member).filter(Member.id == member_id)).scalars().first()
    if member:
        member.card_no = assigned_number
        member.batch_id = batch.id
        db.add(member)

    # Global uniqueness guarantee
    # Check if any OTHER member has this card number (excluding the one we just assigned if flush happened,
    # but we haven't flushed yet, so we just check generally.
    # Wait, we just assigned it to 'member' in the session.
    # If we query now, we might see ourselves if we flushed.
    # But we haven't flushed.
    # However, to be safe against DB state, we check if it exists in DB committed state?
    # No, we are in transaction.
    # We want to check if `assigned_number` is already taken by *someone else*.
    # Since we verified `batch.next_no` was `assigned_number`, and `next_no` increments,
    # it shouldn't be taken *within this batch logic*.
    # But "Card numbers are globally unique".
    # So we check global table.

    stmt_check = select(Member).filter(Member.card_no == assigned_number)
    # If we assigned it to member above, we should filter out member_id
    if member:
        stmt_check = stmt_check.filter(Member.id != member_id)

    existing = db.execute(stmt_check).scalars().first()

    if existing:
        db.rollback()
        raise HTTPException(status_code=500, detail="Global uniqueness violation")

    # Commit transaction
    db.commit()

    return assigned_number
