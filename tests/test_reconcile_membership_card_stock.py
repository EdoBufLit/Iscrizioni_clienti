from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException
import pytest
from sqlalchemy import create_engine, event, update
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import CardBatch, Member, MembershipPayment, Organization
from scripts import reconcile_membership_card_stock as script


@pytest.fixture
def legacy_checkout(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    db = sessions()
    org = Organization(
        name="Legacy rollout test", slug="legacy-rollout-test", auto_approve_signup=True,
        payment_provider="sumup", sumup_enabled=True, payment_required_before_card=True,
    )
    db.add(org)
    db.flush()
    member = Member(org_id=org.id, email="rollout@example.test", status="pending_cards", payment_status="pending")
    batch = CardBatch(org_id=org.id, year=datetime.now().year, start_no=100, end_no=101, next_no=102)
    db.add_all([member, batch])
    db.flush()
    payment = MembershipPayment(
        org_id=org.id, socio_id=member.id, membership_year=batch.year,
        payment_kind="initial", provider="sumup", source="sumup", amount=Decimal("10"),
        currency="EUR", status="pending", sumup_checkout_id="legacy-checkout",
        checkout_reference="legacy-reference",
    )
    db.add(payment)
    db.commit()

    original_lock = script.lock_card_allocation

    def track_lock(session, *args, **kwargs):
        result = original_lock(session, *args, **kwargs)
        session.info["holds_stock_lock"] = True
        return result

    def clear_lock(session):
        session.info["holds_stock_lock"] = False

    event.listen(db, "after_commit", clear_lock)
    event.listen(db, "after_rollback", clear_lock)
    monkeypatch.setattr(script, "lock_card_allocation", track_lock)
    monkeypatch.setattr(script, "decrypt_sumup_api_key", lambda _: "test-key")
    monkeypatch.setattr(script, "_worker_request", lambda: None)
    yield db, org, member, batch, payment, sessions
    db.rollback()
    db.close()
    engine.dispose()


def _response(status="PENDING", *, transactions=()):
    return {"id": "legacy-checkout", "status": status, "transactions": list(transactions)}


def _provider_mocks(monkeypatch, db, *, response, action=None):
    calls = []

    def provider(*, method, **kwargs):
        assert not db.info.get("holds_stock_lock"), f"{method} ran under stock lock"
        calls.append(method)
        if action is not None:
            action(method)
        return {}

    def verify(org, payment):
        assert not db.info.get("holds_stock_lock"), "GET ran under stock lock"
        assert payment.sumup_checkout_id == "legacy-checkout"
        calls.append("GET")
        return response

    monkeypatch.setattr(script, "_sumup_request", provider)
    monkeypatch.setattr(script, "verify_sumup_checkout", verify)
    return calls


def test_legacy_failed_checkout_is_reserved_and_committed_before_patch(legacy_checkout, monkeypatch):
    db, org, _, _, payment, sessions = legacy_checkout
    payment.status = "failed"
    db.commit()

    def observe_durable_hold(method):
        assert method == "PATCH"
        with sessions() as observer:
            persisted = observer.get(MembershipPayment, payment.id)
            assert persisted.reservation_state == "held"
            assert persisted.reserved_card_no == 100

    calls = _provider_mocks(monkeypatch, db, response=_response("FAILED"), action=observe_durable_hold)
    assert script._apply(db, payment, org, _response("FAILED")) == "reserved"
    db.commit()
    assert calls == ["PATCH", "GET"]
    assert payment.reservation_state == "held"


def test_empty_stock_closes_checkout_with_all_provider_io_outside_locks(legacy_checkout, monkeypatch):
    db, org, _, batch, payment, _ = legacy_checkout
    batch.is_enabled = False
    db.commit()
    calls = _provider_mocks(monkeypatch, db, response=_response("EXPIRED"))
    assert script._apply(db, payment, org, _response()) == "closed"
    db.commit()
    assert calls == ["DELETE", "GET"]
    assert (payment.status, payment.reservation_state) == ("expired", "released")


def test_paid_webhook_during_delete_is_not_regressed_by_expired_snapshot(legacy_checkout, monkeypatch):
    db, org, _, batch, payment, sessions = legacy_checkout
    batch.is_enabled = False
    db.commit()

    def concurrent_webhook(method):
        assert method == "DELETE"
        with sessions.begin() as other:
            other.execute(update(MembershipPayment).where(MembershipPayment.id == payment.id).values(status="completed"))

    calls = _provider_mocks(monkeypatch, db, response=_response("EXPIRED"), action=concurrent_webhook)
    assert script._apply(db, payment, org, _response()) == "paid_during_reconciliation"
    db.commit()
    assert calls == ["DELETE", "GET"]
    assert payment.status == "completed"
    assert payment.reservation_state is None


def test_paid_webhook_during_patch_is_not_regressed_by_pending_snapshot(legacy_checkout, monkeypatch):
    db, org, _, _, payment, sessions = legacy_checkout

    def concurrent_webhook(method):
        assert method == "PATCH"
        with sessions.begin() as other:
            other.execute(update(MembershipPayment).where(MembershipPayment.id == payment.id).values(status="completed"))

    _provider_mocks(monkeypatch, db, response=_response(), action=concurrent_webhook)
    assert script._apply(db, payment, org, _response()) == "paid_reconciled"
    db.commit()
    assert payment.status == "completed"
    assert payment.reservation_state == "held"


def test_uncertain_patch_keeps_durable_hold_for_worker(legacy_checkout, monkeypatch):
    db, org, _, _, payment, _ = legacy_checkout

    def uncertain_patch(_):
        raise HTTPException(status_code=502, detail="provider timeout")

    calls = _provider_mocks(monkeypatch, db, response=_response(), action=uncertain_patch)
    assert script._apply(db, payment, org, _response()) == "reserved_expiry_update_pending"
    db.commit()
    assert calls == ["PATCH", "GET"]
    assert payment.reservation_state == "held"


def test_inflight_checkout_is_not_marked_released_after_delete(legacy_checkout, monkeypatch):
    db, org, _, batch, payment, _ = legacy_checkout
    batch.is_enabled = False
    db.commit()
    _provider_mocks(monkeypatch, db, response=_response("EXPIRED", transactions=[{"status": "PENDING"}]))
    with pytest.raises(RuntimeError, match="uncertain or in flight"):
        script._apply(db, payment, org, _response())
    assert payment.reservation_state is None


def test_already_protected_checkout_is_not_modified_by_rollout(legacy_checkout, monkeypatch):
    db, org, _, _, payment, _ = legacy_checkout
    script.reserve_payment_card(db, payment)
    db.commit()
    monkeypatch.setattr(script, "_sumup_request", lambda **_: pytest.fail("already protected"))
    monkeypatch.setattr(script, "verify_sumup_checkout", lambda *_: pytest.fail("already protected"))
    assert script._apply(db, payment, org, _response("EXPIRED")) == "already_protected"
    assert payment.reservation_state == "held"
    assert payment.status == "pending"


def test_changed_checkout_identity_aborts_after_provider_io(legacy_checkout, monkeypatch):
    db, org, _, _, payment, sessions = legacy_checkout

    def change_checkout(_):
        with sessions.begin() as other:
            other.execute(update(MembershipPayment).where(MembershipPayment.id == payment.id).values(sumup_checkout_id="replacement"))

    _provider_mocks(monkeypatch, db, response=_response(), action=change_checkout)
    with pytest.raises(RuntimeError, match="identity changed"):
        script._apply(db, payment, org, _response())
    db.rollback()
    db.refresh(payment)
    assert payment.reservation_state == "held"
