from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException

from app.db import SessionLocal
from app.models import (
    AnnualMembershipTerm,
    CardBatch,
    Member,
    MemberDocument,
    MembershipPayment,
    OperationLog,
    Organization,
    RechargeRequest,
)
from app.services import member_maintenance
from app.services.card_lot_lifecycle import close_due_card_lots, is_closed_by_year, require_card_lot_year_open
from app.services.member_activity import is_member_active


ROME = ZoneInfo("Europe/Rome")


@pytest.fixture
def db():
    with SessionLocal() as session:
        existing_enabled = dict(session.query(CardBatch.id, CardBatch.is_enabled).all())
        yield session
        # The production job intentionally scans every tenant. Restore stock
        # belonging to other tests in the shared synthetic SQLite fixture.
        session.rollback()
        for batch_id, enabled in existing_enabled.items():
            session.query(CardBatch).filter(CardBatch.id == batch_id).update({"is_enabled": enabled})
        session.commit()


def _org(db):
    suffix = uuid4().hex
    org = Organization(name=f"Lot lifecycle {suffix}", slug=f"lot-lifecycle-{suffix}", is_active=True)
    db.add(org)
    db.flush()
    return org


def _lot(db, org, year, *, start=1000, enabled=True):
    lot = CardBatch(
        org_id=org.id if org else None,
        year=year,
        start_no=start,
        end_no=start + 9,
        next_no=start + 2,
        is_enabled=enabled,
        notes="Preservare residui e riferimenti",
    )
    db.add(lot)
    db.flush()
    return lot


def _snapshot(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}


@pytest.mark.parametrize(("now", "closed"), [
    (datetime(2026, 12, 31, 22, 59, 59, 999999, tzinfo=timezone.utc), False),
    (datetime(2026, 12, 31, 23, 0, tzinfo=timezone.utc), True),
    (datetime(2026, 12, 31, 23, 0), True),
    (datetime(2027, 1, 1, 0, 0, tzinfo=ROME), True),
])
def test_lot_year_closes_at_rome_new_year_before_issued_card_grace_ends(now, closed):
    old = CardBatch(year=2026, is_enabled=True)
    assert is_closed_by_year(old, now) is closed
    assert is_closed_by_year(CardBatch(year=2027), now) is False
    if closed:
        with pytest.raises(HTTPException) as error:
            require_card_lot_year_open(old, now)
        assert error.value.status_code == 409
        assert "chiuso per cambio anno" in error.value.detail
        old.is_enabled = True  # Calendar closure survives a stale/manual toggle.
        assert is_closed_by_year(old, now) is True
    else:
        require_card_lot_year_open(old, now)


def test_stock_closure_preserves_residuals_holds_orders_credit_and_issued_cards(db):
    org = _org(db)
    old = _lot(db, org, 2026)
    older = _lot(db, org, 2024, start=2000)
    new = _lot(db, org, 2027, start=3000)
    future = _lot(db, org, 2028, start=4000)
    member = Member(
        org_id=org.id, email=f"preserve-{uuid4().hex}@example.com",
        password_hash="existing-hash", status="active", membership_type="annual",
        card_year=2026, card_no=1000, batch_id=old.id,
    )
    db.add(member)
    db.flush()
    term = AnnualMembershipTerm(
        org_id=org.id, member_id=member.id, membership_year=2026,
        card_year=2026, card_no=1000, batch_id=old.id,
        starts_on=date(2026, 1, 1), valid_through=date(2027, 1, 1), status="active",
    )
    document = MemberDocument(member_id=member.id, status="approved", doc_type="identity", rel_path="test/preserved.pdf")
    hold = MembershipPayment(
        org_id=org.id, socio_id=member.id, membership_year=2026,
        amount=Decimal("15.00"), currency="EUR", status="pending", source="sumup",
        checkout_reference=f"preserved-{uuid4().hex}", sumup_checkout_id="keep-provider-checkout",
        reservation_state="held", reserved_card_no=1002, reserved_card_year=2026,
        reserved_batch_id=old.id, reservation_expires_at=datetime(2027, 1, 1, 12),
    )
    order = RechargeRequest(
        association_id=org.id, association_name=org.name, requester_whatsapp="+390212345678",
        requested_cards=10, requested_year=2026, card_batch_id=old.id,
        billing_status="unpaid", amount_due_cents=1000, source="org_admin_portal",
    )
    db.add_all([term, document, hold, order])
    db.commit()
    db.expire_all()
    preserved = [(row, _snapshot(row)) for row in (member, term, document, hold, order, new, future)]
    old_snapshot = _snapshot(old)
    total_lots = db.query(CardBatch).count()
    now = datetime(2027, 1, 1, 0, 0, tzinfo=ROME)

    result = member_maintenance.run_card_lot_closure_job_once(now=now)
    db.expire_all()

    assert result["ok"] is True
    assert {old.id, older.id}.issubset(result["batch_ids"])
    assert old.is_enabled is older.is_enabled is False
    assert _snapshot(old) == {**old_snapshot, "is_enabled": False}
    assert old.released_at is None
    for row, snapshot in preserved:
        assert _snapshot(row) == snapshot
    assert db.query(CardBatch).count() == total_lots
    assert member.card_year == order.requested_year == old.year == 2026
    assert hold.reservation_state == "held"
    assert is_member_active(member, now=now) is True
    audit_count = db.query(OperationLog).filter(OperationLog.action == "card_lots_closed_for_new_year").count()

    retry = member_maintenance.run_card_lot_closure_job_once(now=now)
    assert retry["ok"] is True
    assert retry["closed_count"] == 0
    assert retry["batch_ids"] == []
    assert db.query(OperationLog).filter(OperationLog.action == "card_lots_closed_for_new_year").count() == audit_count


def test_current_year_stock_is_not_closed_a_microsecond_early(db):
    org = _org(db)
    old = _lot(db, org, 2026)
    db.commit()
    result = close_due_card_lots(
        db, org_id=org.id, now=datetime(2026, 12, 31, 22, 59, 59, 999999, tzinfo=timezone.utc),
    )
    db.commit()
    assert result["closed_count"] == 0
    assert old.is_enabled is True


def test_failed_tenant_rolls_back_and_other_tenant_closes_then_retry_recovers(db, monkeypatch):
    failed_org, other_org = _org(db), _org(db)
    failed, other = _lot(db, failed_org, 2026), _lot(db, other_org, 2026)
    db.commit()
    original_audit = member_maintenance.audit.log_operation

    def fail_one_tenant(*args, **kwargs):
        if kwargs["metadata"]["org_id"] == failed_org.id:
            raise RuntimeError("test failed audit transaction")
        return original_audit(*args, **kwargs)

    with monkeypatch.context() as context:
        context.setattr(member_maintenance.audit, "log_operation", fail_one_tenant)
        result = member_maintenance.run_card_lot_closure_job_once(now=datetime(2027, 1, 1, tzinfo=ROME))
    db.expire_all()
    assert result["ok"] is False
    assert result["errors"] == 1
    assert failed.is_enabled is True
    assert other.is_enabled is False
    assert failed.id not in result["batch_ids"]
    assert other.id in result["batch_ids"]

    retry = member_maintenance.run_card_lot_closure_job_once(now=datetime(2027, 1, 1, tzinfo=ROME))
    db.expire_all()
    assert retry["ok"] is True
    assert failed.id in retry["batch_ids"]
    assert failed.is_enabled is False


def test_orphan_lots_close_without_releasing_inventory_and_discovery_failure_is_safe(db, monkeypatch):
    orphan = _lot(db, None, 2026)
    current = _lot(db, None, 2027)
    db.commit()
    result = member_maintenance.run_card_lot_closure_job_once(now=datetime(2027, 1, 1, tzinfo=ROME))
    db.expire_all()
    assert orphan.id in result["batch_ids"]
    assert orphan.is_enabled is False
    assert orphan.released_at is None
    assert current.is_enabled is True

    def connection_failure():
        raise RuntimeError("test offline database")

    monkeypatch.setattr(member_maintenance, "SessionLocal", connection_failure)
    assert member_maintenance.run_card_lot_closure_job_once()["ok"] is False


def test_maintenance_cli_keeps_lot_and_term_jobs_separate_and_purge_disabled(monkeypatch):
    from app import maintenance

    calls = []
    monkeypatch.setattr(maintenance, "run_card_lot_closure_job_once", lambda: calls.append("lots") or {"ok": True, "closed_count": 2})
    monkeypatch.setattr(maintenance, "run_annual_membership_maintenance_job_once", lambda: calls.append("terms") or {"ok": True, "purged_count": 0})
    result = maintenance.run_member_maintenance(purge_pii=True)
    assert calls == ["lots", "terms"]
    assert result["ok"] is True
    assert result["card_lot_closure"]["closed_count"] == 2
    assert result["purged_count"] == 0
    assert result["purge_pii_requested_but_ignored"] is True
