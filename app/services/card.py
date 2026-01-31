from sqlalchemy.orm import Session
from sqlalchemy import select, update
from app.models import Member, CardBatch, CardMovement, MemberStatus
from app import audit
from sqlalchemy.exc import IntegrityError
import logging
import time

logger = logging.getLogger(__name__)

def assign_next_card(db: Session, member_id: int, org_id: int) -> bool:
    """
    Assigns the next available card number to the member from available batches.
    Returns True if successful, False if no cards available.
    Uses retry logic for SQLite concurrency safety.
    """
    max_retries = 3
    for attempt in range(max_retries):
        try:
            # Start a sub-transaction (savepoint) to handle rollback cleanly on error
            with db.begin_nested():
                # Find available batches ordered by start_no
                batches = db.query(CardBatch).filter(
                    CardBatch.org_id == org_id,
                    CardBatch.next_no <= CardBatch.end_no
                ).order_by(CardBatch.start_no).all() # Ordered by sequence

                if not batches:
                    logger.warning(f"No available card batches for Org {org_id}")
                    return False

                batch = batches[0]
                card_no = batch.next_no

                # Check if card_no is already assigned (double check for safety)
                existing = db.query(Member).filter(
                    Member.org_id == org_id,
                    Member.card_no == card_no
                ).first()

                if existing:
                    # This batch is out of sync or race condition, increment and retry logic handled by loop?
                    # Or just skip this number.
                    batch.next_no += 1
                    db.flush() # Flush to update batch
                    continue # Retry loop to get next number

                # Increment batch
                batch.next_no += 1

                # Assign to member
                member = db.query(Member).filter(Member.id == member_id).first()
                if member:
                    member.card_no = card_no
                    member.batch_id = batch.id
                    # Status update is handled by caller or here?
                    # Previous logic had it here. Let's keep it consistent but flexible.
                    # The caller (join.py) sets logic based on return value.
                    # But wait, if we return True, caller sets ACTIVE.
                    # We should set card_no here.

                    db.add(batch)
                    db.add(member)
                    db.add(CardMovement(
                        org_id=org_id,
                        member_id=member_id,
                        card_no=card_no,
                        delta=-1,
                        reason="card_assigned",
                    ))
                    db.flush() # Force write to check constraints
                    audit.card_assigned(member_id=member_id, org_id=org_id, card_no=card_no)
                    return True
                else:
                    return False

        except IntegrityError:
            # Race condition on card_no unique constraint or concurrent batch update
            logger.warning(f"IntegrityError assigning card, retrying {attempt+1}/{max_retries}")
            time.sleep(0.1) # Brief backoff
            continue
        except Exception as e:
            logger.error(f"Error assigning card: {e}")
            return False

    return False
