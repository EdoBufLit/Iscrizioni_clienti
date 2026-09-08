from datetime import date, datetime, timedelta
from decimal import Decimal
import uuid

import pytest
from fastapi import HTTPException

from app.db import SessionLocal
from app.models import AnnualMembershipTerm, CardBatch, Member, MembershipPayment, NumberingScope, Organization
from app.services.card_allocation import allocate_next_card
from app.services.card_availability import card_batch_availability, occupied_card_numbers
from app.services.card_inventory import compute_org_card_stock, get_remaining_cards_by_org
from app.services.card_lot_registry import list_card_lot_registry_rows, serialize_card_lot_registry_row
from app.routes.org_admin import _serialize_org_admin_card_lot
from app.routes.super_admin import _serialize_batch_usage


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.rollback()
    session.close()


def _org(db, scope_id=None):
    org = Organization(name="Availability", slug=f"availability-{uuid.uuid4().hex}", numbering_scope_id=scope_id)
    db.add(org)
    db.flush()
    return org


def _batch(db, org, start=1000, end=1099, **kwargs):
    batch = CardBatch(org_id=org.id, numbering_scope_id=org.numbering_scope_id, year=datetime.utcnow().year, start_no=start, end_no=end, next_no=end + 1, **kwargs)
    db.add(batch)
    db.flush()
    return batch


def _member(db, org, number=None, year=None, batch=None):
    member = Member(org_id=org.id, card_no=number, card_year=year or datetime.utcnow().year, batch_id=batch.id if batch else None, email=f"available-{uuid.uuid4().hex}@example.com", status="active")
    db.add(member)
    db.flush()
    return member


def _term(db, member, batch, number, status):
    term = AnnualMembershipTerm(member_id=member.id, org_id=member.org_id, membership_year=batch.year, starts_on=date(batch.year, 1, 1), valid_through=date(batch.year + 1, 1, 1), card_year=batch.year, card_no=number, batch_id=batch.id, status=status)
    db.add(term)
    db.flush()
    return term


def _hold(db, org, batch, number):
    payment = MembershipPayment(org_id=org.id, amount=Decimal("10"), currency="EUR", status="pending", source="sumup", reserved_card_no=number, reserved_card_year=batch.year, reserved_batch_id=batch.id, reserved_numbering_scope_id=batch.numbering_scope_id, reservation_state="held", reservation_expires_at=datetime.utcnow() - timedelta(days=1))
    db.add(payment)
    db.flush()
    return payment


def test_exhausted_cursor_with_40_holes_agrees_across_inventory_and_lot_views(db):
    org = _org(db)
    batch = _batch(db, org)
    for number in range(1000, 1100):
        if number % 5 < 3:
            _member(db, org, number, batch=batch)
    db.commit()

    usage = card_batch_availability(db, [batch])[batch.id]
    assert (usage.assigned, usage.remaining, usage.next_no) == (60, 40, 1003)
    assert compute_org_card_stock(db, org.id)["remaining"] == 40
    assert get_remaining_cards_by_org(db, [org.id]) == {org.id: 40}
    assert _serialize_org_admin_card_lot(batch, usage)["status_label"] == "Attivo"
    serialized = _serialize_batch_usage(db, batch)
    assert serialized["remaining"] == 40
    assert serialized["status_label"] == "Attivo"
    assert serialized["next_no"] == 1003
    registry = next(row for row in list_card_lot_registry_rows(db) if row.batch.id == batch.id)
    assert serialize_card_lot_registry_row(registry)["status_label"] == "Attivo"

    allocation = allocate_next_card(db, org.id, batch.year)
    assert allocation.card_no == 1003
    _member(db, org, allocation.card_no, batch=batch)
    # No commit between allocations: autoflush=False must not hide ownership.
    next_allocation = allocate_next_card(db, org.id, batch.year)
    assert next_allocation.card_no == 1004


def test_legacy_old_member_scheduled_term_and_expired_local_hold_still_occupy(db):
    org = _org(db)
    batch = _batch(db, org, 100, 104)
    old_member = _member(db, org, 100, year=batch.year - 1)
    old_member.deleted_at = datetime.utcnow()
    scheduled = _member(db, org, 500, year=batch.year - 1)
    _term(db, scheduled, batch, 101, "scheduled")
    cancelled = _member(db, org)
    _term(db, cancelled, batch, 102, "cancelled")
    payment = _hold(db, org, batch, 103)
    _member(db, org, 104, batch=batch)
    db.commit()

    args = dict(org_id=org.id, scope_id=None, start_no=100, end_no=104, year=batch.year)
    assert occupied_card_numbers(db, **args) == {100, 101, 103, 104}
    assert occupied_card_numbers(db, **args, exclude_payment_id=payment.id) == {100, 101, 104}
    usage = card_batch_availability(db, [batch])[batch.id]
    assert (usage.assigned, usage.reserved, usage.remaining) == (3, 1, 1)
    assert allocate_next_card(db, org.id, batch.year).card_no == 102
    _member(db, org, 102, batch=batch)
    db.commit()
    with pytest.raises(HTTPException, match="card_range_exhausted"):
        allocate_next_card(db, org.id, batch.year)


def test_shared_scope_respects_other_org_terms_and_holds_but_only_own_lots(db):
    scope = NumberingScope(name=f"availability-{uuid.uuid4().hex}", scope_type="shared")
    db.add(scope)
    db.flush()
    org = _org(db, scope.id)
    other = _org(db, scope.id)
    batch = _batch(db, org, 100, 104)
    linked_batch = _batch(db, other, 200, 209)
    # Legacy references can have no explicit scope; the linked lot supplies it.
    term = _term(db, _member(db, other), linked_batch, 100, "scheduled")
    assert term.numbering_scope_id is None
    _hold(db, other, linked_batch, 101)
    db.commit()

    assert allocate_next_card(db, org.id, batch.year).card_no == 102
    assert compute_org_card_stock(db, org.id)["remaining"] == 3
    for number in (102, 103, 104):
        _member(db, org, number, batch=batch)
    db.commit()
    with pytest.raises(HTTPException, match="card_range_exhausted"):
        allocate_next_card(db, org.id, batch.year)


def test_stock_excludes_ineligible_batches_and_keeps_scope_fallback_rule(db):
    scope = NumberingScope(name=f"availability-{uuid.uuid4().hex}", scope_type="dedicated")
    db.add(scope)
    db.flush()
    org = _org(db, scope.id)
    scoped = _batch(db, org, 100, 100)
    legacy = _batch(db, org, 200, 209)
    legacy.numbering_scope_id = None
    _batch(db, org, 300, 309, is_enabled=False)
    _batch(db, org, 400, 409, released_at=datetime.utcnow())
    _member(db, org, 100, batch=scoped)
    db.commit()

    assert compute_org_card_stock(db, org.id)["remaining"] == 0
    with pytest.raises(HTTPException, match="card_range_exhausted"):
        allocate_next_card(db, org.id, scoped.year)
    scoped.is_enabled = False
    db.commit()
    assert compute_org_card_stock(db, org.id)["remaining"] == 10
    assert allocate_next_card(db, org.id, scoped.year).card_no == 200
