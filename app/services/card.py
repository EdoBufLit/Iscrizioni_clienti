from datetime import datetime
from typing import Tuple

from sqlalchemy.orm import Session

from app.services.card_allocation import allocate_next_card


def assign_next_card_with_batch(db: Session, org_id: int) -> Tuple[int, int]:
    """Backward-compatible wrapper around allocate_next_card()."""
    allocation = allocate_next_card(db, org_id=org_id, year=datetime.utcnow().year)
    return allocation.card_no, allocation.batch_id


def assign_next_card(db: Session, org_id: int) -> int:
    """Backward-compatible wrapper for callers expecting only card number."""
    card_no, _batch_id = assign_next_card_with_batch(db, org_id)
    return card_no
