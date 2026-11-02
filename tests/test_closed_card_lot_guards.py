from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.db import SessionLocal
from app.models import CardBatch, Member, MembershipPayment
from app.services import annual_memberships
from app.services.card_allocation import allocate_next_card
from app.services.card_availability import card_batch_availability, card_lot_status, eligible_card_batches
from app.services.card_inventory import compute_org_card_stock
from app.services.card_lot_registry import create_automatic_card_lot, serialize_card_lot_registry_batch
from app.services.card_reservations import reserve_payment_card, reserved_payment_allocation
from app.services.membership_payments import maybe_fulfill_member_card
from tests.test_super_admin_card_lot_management import _create_org, _login_super_admin, _next_free_range


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


def _freeze_new_year(monkeypatch):
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            instant = datetime(2026, 12, 31, 23, tzinfo=timezone.utc)
            return instant.astimezone(tz) if tz else instant.replace(tzinfo=None)
    monkeypatch.setattr(annual_memberships, 'datetime', Clock)


def _lot(db, org, year=2026):
    start, end = _next_free_range(db)
    batch = CardBatch(org_id=org.id, year=year, start_no=start, end_no=end,
                      next_no=start, is_enabled=True)
    db.add(batch)
    db.commit()
    return batch


def test_closed_lot_cannot_allocate_even_before_worker_or_after_reenable(db, monkeypatch):
    org = _create_org(db, 'closed-guard')
    old = _lot(db, org)
    new = _lot(db, org, 2027)
    before = (old.year, old.start_no, old.end_no, old.next_no, old.released_at)
    _freeze_new_year(monkeypatch)
    assert old.is_enabled is True  # The worker has not run yet.
    usage = card_batch_availability(db, [old])[old.id]
    assert card_lot_status(old, usage) == 'Chiuso per annualità'
    assert usage.remaining == 40
    assert eligible_card_batches(db, org_ids=[org.id], year=2026) == []
    with pytest.raises(HTTPException) as closed:
        allocate_next_card(db, org.id, 2026)
    assert closed.value.status_code == 409
    assert compute_org_card_stock(db, org.id)['remaining'] == 40
    allocated = allocate_next_card(db, org.id, 2027)
    assert allocated.batch_id == new.id and allocated.year == 2027
    assert (old.year, old.start_no, old.end_no, old.next_no, old.released_at) == before
    serialized = serialize_card_lot_registry_batch(db, old)
    assert serialized['closed_by_year'] is True and serialized['remaining'] == 40


def test_old_held_checkout_keeps_money_and_hold_without_issuing_a_card(db, monkeypatch):
    org = _create_org(db, 'closed-payment')
    org.auto_approve_signup = True
    old = _lot(db, org)
    member = Member(org_id=org.id, first_name='Luca', last_name='Prova',
                    email=f'closed-{org.id}@example.test', status='pending_cards',
                    membership_type='annual', payment_status='completed')
    db.add(member)
    db.flush()
    payment = MembershipPayment(org_id=org.id, socio_id=member.id, membership_year=2026,
        payment_kind='initial', provider='sumup', source='sumup', status='pending',
        amount=Decimal('10.00'), currency='EUR')
    db.add(payment)
    db.flush()
    reserve_payment_card(db, payment)
    db.commit()
    _freeze_new_year(monkeypatch)
    with pytest.raises(HTTPException):
        reserve_payment_card(db, payment)
    payment.status = 'completed'
    db.flush()
    with pytest.raises(HTTPException):
        reserved_payment_allocation(db, payment)
    result = maybe_fulfill_member_card(db=db, member=member, org=org, payment=payment)
    assert not result.issued_card
    assert payment.status == 'completed' and payment.reservation_state == 'held'
    assert payment.reserved_batch_id == old.id and payment.reserved_card_year == 2026
    assert member.card_no is None and member.card_year is None
    assert old.is_enabled is True and old.year == 2026 and old.released_at is None


def test_closed_lot_is_readonly_in_api_even_if_unused(client, db, monkeypatch):
    _login_super_admin(client)
    org = _create_org(db, 'closed-api')
    old = _lot(db, org)
    _freeze_new_year(monkeypatch)
    for payload in ({'status': 'active'}, {'year': 2027}, {'range_end': old.end_no + 1}):
        response = client.patch(f'/api/admin/organizations/{org.id}/card-lots/{old.id}', json=payload)
        assert response.status_code == 409, response.text
    deleted = client.delete(f'/api/admin/organizations/{org.id}/card-lots/{old.id}')
    assert deleted.status_code == 409
    db.expire_all()
    assert old.year == 2026 and old.released_at is None and old.is_enabled is True
    from app.routes.super_admin import _serialize_batch_usage
    item = _serialize_batch_usage(db, old)
    assert item['closed_by_year'] and not item['is_enabled']
    assert not item['range_editable'] and not item['deletable']


def test_current_unused_lot_cannot_be_transferred_to_another_year(client, db):
    _login_super_admin(client)
    org = _create_org(db, 'lot-year-immutable')
    batch = _lot(db, org)
    response = client.patch(f'/api/admin/organizations/{org.id}/card-lots/{batch.id}', json={'year': 2027})
    assert response.status_code == 409
    db.refresh(batch)
    assert batch.year == 2026


def test_old_recharge_processed_late_creates_only_closed_historical_lot(db, monkeypatch):
    from tests.test_card_lot_registry import _create_recharge_request
    from app.services.numbering_scopes import ensure_assonam_central_scope
    from app.services.card_lot_registry import ensure_recharge_request_batch
    scope = ensure_assonam_central_scope(db)
    org = _create_org(db, 'late-old-recharge')
    org.numbering_scope_id = scope.id
    db.commit()
    request = _create_recharge_request(db, org=org, requested_cards=10)
    assert request.requested_year == 2026
    _freeze_new_year(monkeypatch)
    batch = ensure_recharge_request_batch(db, request.id)
    db.flush()
    assert batch.year == 2026 and batch.is_enabled is False and batch.released_at is None
    assert request.requested_year == 2026
    assert compute_org_card_stock(db, org.id)['remaining'] == 0


def test_org_admin_closed_filter_preserves_residual_and_tenant_scope(client, db, monkeypatch):
    from tests.test_annual_renewals import _login_org_admin
    org = _create_org(db, 'closed-list')
    old = _lot(db, org)
    _lot(db, org, 2027)
    outsider = _create_org(db, 'closed-list-other')
    _lot(db, outsider)
    _login_org_admin(client, db, org=org)
    _freeze_new_year(monkeypatch)
    response = client.get('/api/org-admin/cards/movements', params={'all_years': True, 'status': 'Chiuso per annualità'})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload['total'] == 1
    assert payload['items'][0]['id'] == old.id
    assert payload['items'][0]['closed_by_year'] is True
    assert payload['items'][0]['remaining'] == 40


def test_manual_lot_creation_rejects_past_year_at_italian_midnight(client, db, monkeypatch):
    _login_super_admin(client)
    org = _create_org(db, 'lot-midnight-create')
    start, end = _next_free_range(db)
    _freeze_new_year(monkeypatch)
    payload = {'from_no': start, 'to_no': end, 'year': 2026}
    for route in (f'/api/super-admin/organizations/{org.id}/card-range', f'/api/super-admin/orgs/{org.id}/cards/add-batch'):
        response = client.post(route, json=payload)
        assert response.status_code == 409, response.text
    assert db.query(CardBatch).filter_by(org_id=org.id).count() == 0
    created = client.post(f'/api/super-admin/organizations/{org.id}/card-range', json={'from_no': start, 'to_no': end})
    assert created.status_code == 200, created.text
    assert created.json()['year'] == 2027
    listing = client.get(f'/api/super-admin/organizations/{org.id}/batches')
    assert listing.status_code == 200, listing.text
    assert listing.json()['current_year'] == 2027
    assert listing.json()['next_reset_at'] == '2028-01-01T00:00:00+01:00'
