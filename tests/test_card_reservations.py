from datetime import datetime, timezone
from decimal import Decimal
import uuid

from fastapi import HTTPException
import pytest

from app.db import SessionLocal
from app.models import CardBatch, Member, MembershipPayment, Organization
from app.services import card_reservations as reservations
from app.services import membership_payments as payments
from app.services.card_inventory import compute_org_card_stock


@pytest.fixture
def held_payment():
    db = SessionLocal()
    suffix = uuid.uuid4().hex
    org = Organization(name="Reservation test", slug=f"reservation-{suffix}", privacy_version="v1", is_active=True,
                       auto_approve_signup=True, payment_provider="sumup", sumup_enabled=True, payment_required_before_card=True)
    db.add(org)
    db.flush()
    member = Member(org_id=org.id, first_name="Test", last_name="Reservation", email=f"{suffix}@example.test",
                    status="pending_cards", payment_status="pending", payment_required=True)
    batch = CardBatch(org_id=org.id, year=2026, start_no=100, end_no=101, next_no=102, is_enabled=True)
    db.add_all([member, batch])
    db.flush()
    payment = MembershipPayment(org_id=org.id, socio_id=member.id, membership_year=2026, payment_kind="initial",
                                provider="sumup", source="sumup", amount=Decimal("10.00"), currency="EUR",
                                status="pending", checkout_reference=f"test-{suffix}")
    db.add(payment)
    allocation = reservations.reserve_payment_card(db, payment, now=datetime(2026, 9, 7, tzinfo=timezone.utc))
    assert allocation.card_no == 100
    db.commit()
    yield db, org, member, batch, payment
    db.close()


def _provider_checkout(payment, status="PENDING", transactions=None):
    return {"id": payment.sumup_checkout_id or "checkout-test", "checkout_reference": payment.checkout_reference,
            "status": status, "transactions": [] if transactions is None else transactions}


def test_hold_is_durable_and_local_expiry_does_not_free_stock(held_payment):
    db, org, member, batch, payment = held_payment
    assert member.card_no is None
    assert payment.reservation_expires_at.replace(tzinfo=timezone.utc) == datetime(2026, 9, 7, 0, 15, tzinfo=timezone.utc)
    assert compute_org_card_stock(db, org.id, now=datetime(2026, 9, 8))["remaining"] == 1
    again = reservations.reserve_payment_card(db, payment, now=datetime(2026, 9, 8, tzinfo=timezone.utc))
    assert again.card_no == 100
    assert payment.reservation_expires_at.replace(tzinfo=timezone.utc) == datetime(2026, 9, 7, 0, 15, tzinfo=timezone.utc)


def test_only_verified_paid_hold_can_be_consumed(held_payment):
    db, org, member, batch, payment = held_payment
    with pytest.raises(HTTPException) as error:
        reservations.reserved_payment_allocation(db, payment)
    assert error.value.status_code == 409
    payment.status = "completed"
    result = reservations.reserved_payment_allocation(db, payment)
    assert result.card_no == 100
    member.card_no, member.batch_id, member.card_year = result.card_no, result.batch_id, result.year
    member.status = "active"
    db.commit()
    assert payment.reservation_state == "consumed"
    assert reservations.reserved_payment_allocation(db, payment) is None
    assert compute_org_card_stock(db, org.id, now=datetime(2026, 9, 7))["remaining"] == 1


@pytest.mark.parametrize("existing_number, expected", [(100, "consumed"), (101, "released")])
def test_paid_late_after_card_issued_settles_hold_without_replacing_card(held_payment, existing_number, expected):
    db, org, member, batch, payment = held_payment
    member.card_no, member.card_year, member.batch_id = existing_number, 2026, batch.id
    member.status = "active"
    member.payment_status = "manual_completed"
    db.commit()
    payments.update_payment_state_from_sumup(
        db=db, payment=payment, org=org, verified_payload=_provider_checkout(payment, "PAID")
    )
    db.commit()
    assert member.card_no == existing_number
    assert payment.status == "completed"
    assert payment.reservation_state == expected
    assert compute_org_card_stock(db, org.id, now=datetime(2026, 9, 7))["remaining"] == 1


def test_expired_old_attempt_does_not_undo_another_confirmed_payment(held_payment):
    db, org, member, batch, payment = held_payment
    member.payment_status = "manual_completed"
    member.card_is_paid = True
    db.commit()
    payments.update_payment_state_from_sumup(
        db=db, payment=payment, org=org, verified_payload=_provider_checkout(payment, "EXPIRED")
    )
    db.commit()
    assert payment.reservation_state == "released"
    assert member.payment_status == "manual_completed"
    assert member.card_is_paid


def test_legacy_failed_checkout_is_reserved_and_expiry_set_before_reuse(held_payment, monkeypatch):
    db, org, member, batch, payment = held_payment
    payment.reservation_state = None
    payment.reservation_expires_at = None
    payment.sumup_checkout_id = "legacy-failed"
    payment.hosted_checkout_url = "https://sumup.example/legacy-failed"
    payment.status = "failed"
    db.commit()
    calls = []
    monkeypatch.setattr(payments, "decrypt_sumup_api_key", lambda value: "test-only")

    def update(**kwargs):
        assert kwargs["method"] == "PATCH"
        assert kwargs["path"] == "checkouts/legacy-failed"
        assert "valid_until" in kwargs["json_payload"]
        with SessionLocal() as check:
            saved = check.get(MembershipPayment, payment.id)
            assert saved.reservation_state == "held"
            assert saved.reserved_card_no == 100
        calls.append(kwargs["method"])
        return {}

    monkeypatch.setattr(payments, "_sumup_request", update)
    assert payments.reuse_existing_sumup_checkout(
        db, payment, org,
        verify_checkout=lambda org, payment: _provider_checkout(payment, "FAILED"),
    )
    assert calls == ["PATCH"]
    assert db.query(MembershipPayment).filter_by(org_id=org.id).count() == 1


@pytest.mark.parametrize("payload", [
    {"status": "PENDING", "transactions": []},
    {"status": "FAILED", "transactions": []},
    {"status": "CANCELLED", "transactions": []},
    {"status": "EXPIRED"},
    {"status": "EXPIRED", "transactions": [{"status": "PENDING"}]},
    {"status": "EXPIRED", "transactions": [{"status": "SUCCESSFUL"}]},
    {"status": "EXPIRED", "transactions": [{}]},
])
def test_incomplete_or_inflight_provider_state_never_releases_hold(held_payment, payload):
    db, org, member, batch, payment = held_payment
    assert not reservations.release_payment_reservation(db, payment, verified_payload=payload)
    assert payment.reservation_state == "held"


def test_terminal_expired_checkout_releases_and_reuses_hole(held_payment):
    db, org, member, batch, payment = held_payment
    payload = {"status": "EXPIRED", "transactions": [{"status": "FAILED"}]}
    assert reservations.release_payment_reservation(db, payment, verified_payload=payload)
    assert payment.status == "expired"
    assert compute_org_card_stock(db, org.id, now=datetime(2026, 9, 7))["remaining"] == 2
    assert not reservations.release_payment_reservation(db, payment, verified_payload=payload)


def test_paid_hold_never_released_by_expired_notification(held_payment):
    db, org, member, batch, payment = held_payment
    payment.status = "completed"
    assert not reservations.release_payment_reservation(db, payment, verified_payload={"status": "EXPIRED", "transactions": []})
    assert payment.reservation_state == "held"


def test_lost_creation_response_recovered_without_second_post(held_payment, monkeypatch):
    db, org, member, batch, payment = held_payment
    calls = []

    def provider(org, *, method, path):
        calls.append((method, path))
        return [{**_provider_checkout(payment), "hosted_checkout_url": "https://checkout.sumup.com/test"}]

    monkeypatch.setattr(reservations, "_provider_request", provider)
    assert reservations.ensure_checkout_reference_recovered(db, payment, org)
    assert payment.sumup_checkout_id == "checkout-test"
    assert payment.hosted_checkout_url == "https://checkout.sumup.com/test"
    assert len(calls) == 1 and calls[0][0] == "GET"
    assert reservations.ensure_checkout_reference_recovered(db, payment, org)
    assert len(calls) == 1


def test_empty_reference_lookup_waits_for_expiry_before_release(held_payment, monkeypatch):
    db, org, member, batch, payment = held_payment
    monkeypatch.setattr(reservations, "_provider_request", lambda *args, **kwargs: [])
    assert not reservations.ensure_checkout_reference_recovered(db, payment, org, now=datetime(2026, 9, 7, 0, 1, tzinfo=timezone.utc))
    assert payment.reservation_state == "held"
    assert not reservations.ensure_checkout_reference_recovered(db, payment, org, now=datetime(2026, 9, 7, 0, 16, tzinfo=timezone.utc))
    assert payment.reservation_state == "released"


def test_provider_error_does_not_release_lost_checkout(held_payment, monkeypatch):
    db, org, member, batch, payment = held_payment

    def unavailable(*args, **kwargs):
        raise HTTPException(status_code=502, detail="Provider unavailable")

    monkeypatch.setattr(reservations, "_provider_request", unavailable)
    with pytest.raises(HTTPException):
        reservations.ensure_checkout_reference_recovered(db, payment, org, now=datetime(2026, 9, 8, tzinfo=timezone.utc))
    assert payment.reservation_state == "held"


def test_paid_during_deactivation_is_fulfilled_once(held_payment, monkeypatch):
    db, org, member, batch, payment = held_payment
    payment.sumup_checkout_id = "race-checkout"
    db.commit()
    states = iter([_provider_checkout(payment), _provider_checkout(payment, "PAID", [{"status": "SUCCESSFUL"}])])
    monkeypatch.setattr(payments, "verify_sumup_checkout", lambda *args: next(states))

    def cannot_deactivate(*args, **kwargs):
        assert kwargs["method"] == "DELETE"
        raise HTTPException(status_code=400, detail="Already processed")

    monkeypatch.setattr(reservations, "_provider_request", cannot_deactivate)
    assert reservations.reconcile_payment_reservation(db, payment, org, now=datetime(2026, 9, 8, tzinfo=timezone.utc)) == "consumed"
    db.commit()
    assert payment.status == "completed" and member.card_no == 100
    assert member.status.value == "active"
    assert reservations.reconcile_payment_reservation(db, payment, org) == "consumed"


def test_inflight_expired_attempt_stays_held(held_payment, monkeypatch):
    db, org, member, batch, payment = held_payment
    payment.sumup_checkout_id = "inflight-checkout"
    db.commit()
    payload = _provider_checkout(payment, "EXPIRED", [{"status": "PENDING"}])
    monkeypatch.setattr(payments, "verify_sumup_checkout", lambda *args: payload)
    monkeypatch.setattr(reservations, "_provider_request", lambda *args, **kwargs: payload)
    assert reservations.reconcile_payment_reservation(db, payment, org, now=datetime(2026, 9, 8, tzinfo=timezone.utc)) == "held"


def test_paid_awaiting_approval_keeps_number_beyond_fifteen_minutes(held_payment):
    db, org, member, batch, payment = held_payment
    org.auto_approve_signup = False
    payment.status = member.payment_status = "completed"
    db.commit()
    assert reservations.reconcile_payment_reservation(db, payment, org, now=datetime(2026, 10, 1, tzinfo=timezone.utc)) == "held"
    assert member.card_no is None
    member.decision_at = datetime(2026, 10, 1)
    assert reservations.reconcile_payment_reservation(db, payment, org) == "consumed"
    assert member.card_no == 100


def test_worker_provider_error_keeps_hold_and_reports_error(held_payment, monkeypatch):
    db, org, member, batch, payment = held_payment
    payment.sumup_checkout_id = "unavailable-checkout"
    db.commit()

    def unavailable(*args, **kwargs):
        raise HTTPException(status_code=502, detail="Provider unavailable")

    monkeypatch.setattr(payments, "verify_sumup_checkout", unavailable)
    calls = []
    result = reservations.reconcile_membership_payments_once(limit=10000, heartbeat=lambda: calls.append(True))
    assert result["errors"] >= 1
    assert calls
    db.refresh(payment)
    assert payment.reservation_state == "held"
