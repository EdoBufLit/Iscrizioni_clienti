from datetime import datetime
import uuid

import pytest

from app.db import SessionLocal
from app.models import CardBatch, Member, Organization
from app.services.card_inventory import get_remaining_cards_by_org


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def test_get_remaining_cards_by_org_returns_remaining_per_association(db):
    current_year = datetime.utcnow().year
    org_with_cards = Organization(
        name="Bulk Cards Org",
        slug=f"bulk-cards-{uuid.uuid4().hex[:6]}",
        privacy_version="v1",
        is_active=True,
    )
    org_without_cards = Organization(
        name="No Cards Org",
        slug=f"no-cards-{uuid.uuid4().hex[:6]}",
        privacy_version="v1",
        is_active=True,
    )
    db.add_all([org_with_cards, org_without_cards])
    db.commit()
    db.refresh(org_with_cards)
    db.refresh(org_without_cards)

    batch = CardBatch(
        org_id=org_with_cards.id,
        year=current_year,
        start_no=8000,
        end_no=8009,
        next_no=8002,
        is_enabled=True,
    )
    member = Member(
        org_id=org_with_cards.id,
        first_name="Mario",
        last_name="Rossi",
        email=f"bulk-{uuid.uuid4().hex[:6]}@example.com",
        phone="+393331112233",
        fiscal_code=f"RSSMRA{uuid.uuid4().hex[:10].upper()}",
        status="active",
        card_no=8000,
        card_year=current_year,
    )
    db.add_all([batch, member])
    db.commit()

    remaining = get_remaining_cards_by_org(
        db,
        [org_with_cards.id, org_without_cards.id],
        now=datetime.utcnow(),
    )

    assert remaining[org_with_cards.id] == 9
    assert remaining[org_without_cards.id] == 0
