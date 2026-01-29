from sqlalchemy.orm import Session
from sqlalchemy import select, update
from app.models import Member, CardBatch, MemberStatus
import logging

logger = logging.getLogger(__name__)

def assign_next_card(db: Session, member_id: int, org_id: int) -> bool:
    """
    Assigns the next available card number to the member from available batches.
    Returns True if successful, False if no cards available.
    """
    try:
        # Find the oldest batch with available cards
        # We need to lock this row ideally, but with SQLite/SQLAlchemy basic,
        # we can just select, check, update and commit.
        # Since we are single worker usually in this dev env, it's fine.
        # For concurrency, 'with_for_update' works on Postgres/MySQL but not simply on SQLite.
        # We rely on logic: fetch batch, check next_no <= end_no.

        batches = db.query(CardBatch).filter(
            CardBatch.org_id == org_id,
            CardBatch.next_no <= CardBatch.end_no
        ).order_by(CardBatch.created_at).all()

        if not batches:
            logger.warning(f"No available card batches for Org {org_id}")
            return False

        batch = batches[0]
        card_no = batch.next_no

        # Increment batch
        batch.next_no += 1

        # Assign to member
        member = db.query(Member).filter(Member.id == member_id).first()
        if member:
            member.card_no = card_no
            member.batch_id = batch.id
            member.status = MemberStatus.ACTIVE # Auto-activate if getting a card
            # Note: caller handles commit
            db.add(batch)
            db.add(member)
            return True

        return False

    except Exception as e:
        logger.error(f"Error assigning card: {e}")
        return False
