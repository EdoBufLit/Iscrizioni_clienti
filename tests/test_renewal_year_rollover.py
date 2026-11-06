from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.db import SessionLocal
from app.models import AnnualMembershipTerm, AnnualMembershipTermStatus, CardBatch, Member, MemberStatus, MembershipPayment
from app.services.renewals import (
    activate_due_renewal_terms, build_quote_center, confirm_unpaid_renewal,
    iter_quote_rows, record_manual_renewal_payment, request_renewal,
    retry_waiting_renewal_cards, serialize_member_membership,
)
from tests.test_annual_renewals import _build_member_and_source, _build_org, _login_org_admin


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


def _stock(db, org, year, start=98001):
    batch = CardBatch(org_id=org.id, year=year, start_no=start, end_no=start + 9, next_no=start)
    db.add(batch)
    db.flush()
    return batch


def test_lapsed_member_renews_current_year_once_preserving_identity_and_credentials(db):
    org = _build_org(db)
    member, source = _build_member_and_source(db, org=org, year=2024, card_no=97001)
    original = (member.id, member.email, member.password_hash, member.auth_version, member.joined_at)
    stock = _stock(db, org, 2027)
    now = datetime(2027, 1, 2, tzinfo=timezone.utc)
    summary = serialize_member_membership(db, member=member, now=now)
    assert summary['renewal_year'] == 2027
    assert summary['can_renew'] is True
    assert summary['is_account_only'] is True

    result = request_renewal(db, member=member, now=now)
    db.flush()
    assert result.term.membership_year == 2027
    assert member.card_year == 2027
    assert member.card_no == 98001
    assert (member.id, member.email, member.password_hash, member.auth_version, member.joined_at) == original
    assert source.card_year == 2024 and source.card_no == 97001
    assert db.query(AnnualMembershipTerm).filter_by(member_id=member.id).count() == 2
    assert stock.next_no == 98002
    with pytest.raises(HTTPException) as early:
        request_renewal(db, member=member, now=now)
    assert early.value.status_code == 409
    assert stock.next_no == 98002


def test_legacy_issued_card_without_term_is_renewable_and_visible_in_quotes(db):
    org = _build_org(db)
    member, source = _build_member_and_source(db, org=org, year=2025, card_no=97002)
    db.delete(source)
    db.flush()
    _stock(db, org, 2027)
    now = datetime(2027, 2, 3)
    summary = serialize_member_membership(db, member=member, now=now)
    assert summary['renewal_year'] == 2027 and summary['can_renew'] is True
    quote = build_quote_center(db, org=org, year=2027, member_id=member.id)
    assert quote['total'] == 1
    assert quote['items'][0]['previous_valid_through'] == '2026-01-01'
    result = request_renewal(db, member=member, now=now)
    assert result.term.membership_year == 2027
    assert db.query(AnnualMembershipTerm).filter_by(member_id=member.id).count() == 2


def test_quote_center_includes_multiyear_lapse_and_exact_member_filter(client, db):
    org, other_org = _build_org(db), _build_org(db)
    old, _ = _build_member_and_source(db, org=org, year=2024, card_no=97003)
    second, _ = _build_member_and_source(db, org=org, year=2026, card_no=97004)
    outsider, _ = _build_member_and_source(db, org=other_org, year=2026, card_no=97005)
    _login_org_admin(client, db, org=org)
    selected = client.get(f'/api/org-admin/quotes?year=2027&member_id={old.id}')
    assert selected.status_code == 200
    assert selected.json()['total'] == 1
    assert selected.json()['items'][0]['member_id'] == old.id
    assert selected.json()['kpis']['due'] == 1
    csv = client.get(f'/api/org-admin/quotes.csv?year=2027&member_id={old.id}')
    assert old.email in csv.text and second.email not in csv.text
    assert client.get(f'/api/org-admin/quotes?year=2027&member_id={outsider.id}').json()['total'] == 0
    assert list(iter_quote_rows(db, org=org, year=2027, member_id=outsider.id)) == []


@pytest.mark.parametrize('state', [MemberStatus.REJECTED, MemberStatus.PENDING_DOCS])
def test_admin_renewal_does_not_bypass_member_rejection_or_pending_approval(db, state):
    org = _build_org(db)
    member, _ = _build_member_and_source(db, org=org, year=2026, card_no=97006, member_status=state)
    batch = _stock(db, org, 2027)
    with pytest.raises(HTTPException):
        confirm_unpaid_renewal(db, member=member, membership_year=2027, now=datetime(2027, 1, 2))
    assert batch.next_no == 98001


def test_recovery_does_not_activate_or_allocate_obsolete_renewal(db):
    org = _build_org(db)
    member, source = _build_member_and_source(db, org=org, year=2024, card_no=97007)
    obsolete = AnnualMembershipTerm(
        member_id=member.id, org_id=org.id, membership_year=2025,
        starts_on=date(2025, 1, 1), valid_through=date(2026, 1, 1),
        status=AnnualMembershipTermStatus.SCHEDULED.value,
        fee_amount=Decimal('0'), currency='EUR', card_no=97501, card_year=2025,
    )
    waiting = AnnualMembershipTerm(
        member_id=member.id, org_id=org.id, membership_year=2026,
        starts_on=date(2026, 1, 1), valid_through=date(2027, 1, 1),
        status=AnnualMembershipTermStatus.APPROVED_WAITING_CARD.value,
        fee_amount=Decimal('0'), currency='EUR',
    )
    db.add_all([obsolete, waiting])
    batch = _stock(db, org, 2026)
    now = datetime(2027, 1, 2)
    activate_due_renewal_terms(db, now=now)
    assert obsolete.status == 'expired'
    retry_waiting_renewal_cards(db, now=now)
    assert member.card_year == source.card_year == 2024
    assert batch.next_no == 98001


def test_cancelled_renewal_cannot_be_resurrected_by_another_request(db):
    org = _build_org(db, fee=Decimal('25.00'))
    org.payment_required_before_card = True
    member, _ = _build_member_and_source(db, org=org, year=2026, card_no=97009)
    first = request_renewal(db, member=member, now=datetime(2027, 1, 1))
    first.term.status = 'cancelled'
    db.flush()
    with pytest.raises(HTTPException) as retry:
        request_renewal(db, member=member, now=datetime(2027, 1, 1))
    assert retry.value.status_code == 409
    assert first.term.status == 'cancelled'


def test_manual_renewal_rejects_underpayment_and_elapsed_year(db):
    org = _build_org(db, fee=Decimal('25.00'))
    member, _ = _build_member_and_source(db, org=org, year=2025, card_no=97008)
    batch = _stock(db, org, 2027)
    kwargs = dict(member=member, admin_id=1, method='contanti', paid_at=datetime(2027, 1, 2), notes=None, now=datetime(2027, 1, 2))
    with pytest.raises(HTTPException, match='') as underpayment:
        record_manual_renewal_payment(db, membership_year=2027, amount=Decimal('1.00'), **kwargs)
    assert underpayment.value.status_code == 409
    assert db.query(MembershipPayment).filter_by(socio_id=member.id).count() == 0
    with pytest.raises(HTTPException) as old_year:
        record_manual_renewal_payment(db, membership_year=2026, amount=Decimal('25.00'), **kwargs)
    assert old_year.value.status_code == 409
    assert batch.next_no == 98001


def test_live_online_checkout_blocks_manual_collection_of_the_same_renewal(db):
    org = _build_org(db, fee=Decimal('25.00'))
    org.payment_required_before_card = True
    member, _ = _build_member_and_source(db, org=org, year=2026, card_no=97010)
    batch = _stock(db, org, 2027)
    now = datetime(2027, 1, 2)
    term = request_renewal(db, member=member, now=now).term
    pending = MembershipPayment(org_id=org.id, socio_id=member.id, annual_term_id=term.id,
        membership_year=2027, payment_kind='renewal', provider='sumup', source='sumup',
        status='pending', amount=Decimal('25.00'), currency='EUR', checkout_reference='qa-live-renewal')
    db.add(pending)
    db.flush()
    with pytest.raises(HTTPException) as blocked:
        record_manual_renewal_payment(db, member=member, membership_year=2027, admin_id=1,
            amount=Decimal('25.00'), method='contanti', paid_at=now, notes=None, now=now)
    assert blocked.value.status_code == 409
    assert 'checkout' in blocked.value.detail
    assert db.query(MembershipPayment).filter_by(socio_id=member.id).count() == 1
    assert batch.next_no == 98001


def test_session_revoked_while_waiting_for_renewal_lock_cannot_issue_card(db, monkeypatch):
    from sqlalchemy import update
    from app.services import renewals
    org = _build_org(db)
    member, _ = _build_member_and_source(db, org=org, year=2026, card_no=97011)
    batch = _stock(db, org, 2027)
    original_lock = renewals.lock_card_allocation
    def concurrent_reset(session, org_id, year):
        session.execute(update(Member).where(Member.id == member.id)
            .values(auth_version=Member.auth_version + 1).execution_options(synchronize_session=False))
        original_lock(session, org_id, year)
    monkeypatch.setattr(renewals, 'lock_card_allocation', concurrent_reset)
    with pytest.raises(HTTPException) as revoked:
        request_renewal(db, member=member, now=datetime(2027, 1, 2))
    assert revoked.value.status_code == 401
    assert member.card_year == 2026
    assert batch.next_no == 98001


def test_old_qr_cannot_extend_an_annual_card_after_promotion_to_new_year(db):
    from app.services.card_verification import resolve_card_verification_membership
    from app.routes.public import _term_valid_until
    org = _build_org(db)
    member, old = _build_member_and_source(db, org=org, year=2026, card_no=97012)
    old.valid_through = date(2027, 2, 10)  # Legacy incorrect extension.
    member.card_year = 2027
    member.card_no = 98012
    db.flush()
    payload = {'member_id': member.id, 'org_id': org.id, 'card_number': 97012, 'card_year': 2026, 'v': 1}
    _, snapshot, reason = resolve_card_verification_membership(db, payload=payload, checked_at=datetime(2027, 1, 2))
    assert snapshot.id == old.id and reason == 'expired'
    assert _term_valid_until(old, member).isoformat() == '2027-01-01T23:59:59.999999+01:00'


def test_delayed_payment_cannot_promise_or_issue_an_obsolete_card(db):
    from app.models import MemberNotification
    from app.services.renewals import complete_renewal_payment
    org = _build_org(db, fee=Decimal('25.00'))
    member, _ = _build_member_and_source(db, org=org, year=2025, card_no=97013)
    term = AnnualMembershipTerm(member_id=member.id, org_id=org.id, membership_year=2026,
        starts_on=date(2026, 1, 1), valid_through=date(2027, 1, 1),
        status='payment_pending', fee_amount=Decimal('25.00'), currency='EUR')
    db.add(term)
    db.flush()
    payment = MembershipPayment(org_id=org.id, socio_id=member.id, annual_term_id=term.id,
        membership_year=2026, payment_kind='renewal', provider='sumup', source='sumup',
        status='completed', amount=Decimal('25.00'), currency='EUR')
    db.add(payment)
    batch = _stock(db, org, 2026)
    assert complete_renewal_payment(db, payment=payment, now=datetime(2027, 1, 2)) is False
    db.flush()
    assert term.status == 'expired' and term.card_no is None
    assert member.card_year == 2025 and batch.next_no == 98001
    notification = db.query(MemberNotification).filter_by(member_id=member.id).one()
    assert 'non attiva' in notification.title and "Contatta l'associazione" in notification.body
