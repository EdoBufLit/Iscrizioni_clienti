"""Release concurrency checks: --noconftest, stock_tests, UUID schemas only."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from decimal import Decimal
from threading import Barrier, Event
import time
from types import SimpleNamespace
from uuid import uuid4

# This fixture module enforces APP_ENV=test and the disposable database name.
from tests.test_card_reservations_postgres import stock_db, YEAR
from fastapi import HTTPException
from starlette.requests import Request
from app.models import (
    AccountingAllocation, AccountingMutation, AccountingReceipt, AdminRole,
    AdminUser, EmailOutbox, Member, MemberBulkItem, MemberBulkRequest,
    MemberBulkRun, MemberStatus, Organization,
)
from app.services import member_accounting as ledger, member_bulk as bulk
from sqlalchemy import text


def prepare(sessions, org_id):
    with sessions() as db:
        org = db.get(Organization, org_id)
        org.membership_fee_amount = Decimal("30.00")
        org.membership_fee_currency = "EUR"
        admin = AdminUser(org_id=org_id, role=AdminRole.ORG_ADMIN, is_active=True,
                          email=f"release-admin-{uuid4().hex}@example.com")
        member = Member(org_id=org_id, first_name="Release", last_name="Synthetic",
                        email=f"release-member-{uuid4().hex}@example.com", status=MemberStatus.ACTIVE,
                        card_no=880001, card_year=YEAR, membership_type="annual",
                        membership_fee_snapshot=Decimal("30.00"),
                        joined_at=datetime(YEAR, 1, 1), valid_until=datetime.utcnow()+timedelta(days=30))
        db.add_all([admin, member])
        db.commit()
        return admin.id, member.id


def receipt(sessions, org_id, admin_id):
    with sessions() as db:
        result = ledger.mutate(db, org_id=org_id, request_key=uuid4().hex,
            operation="create", payload={"synthetic": True}, callback=lambda: ledger.create_receipt(
                db, org_id=org_id, admin_id=admin_id, values={"amount_cents": 3000, "currency": "EUR",
                    "method": "bank_transfer", "paid_on": date.today(), "reference": uuid4().hex}))
        db.commit()
        return result["receipt"]["id"]


def test_simultaneous_receipts_cannot_settle_one_obligation_twice(stock_db):
    sessions, org_id, _ = stock_db
    admin_id, member_id = prepare(sessions, org_id)
    receipts = [receipt(sessions, org_id, admin_id) for _ in range(2)]
    barrier = Barrier(2, timeout=10)
    target = f"initial:{member_id}:{YEAR}"
    def allocate(receipt_id):
        with sessions() as db:
            barrier.wait()
            try:
                ledger.mutate(db, org_id=org_id, request_key=uuid4().hex, operation="allocate",
                    payload={"receipt_id": receipt_id}, callback=lambda: ledger.allocate(
                        db, org_id=org_id, receipt_id=receipt_id, admin_id=admin_id, version=1,
                        items=[{"target_key": target, "amount_cents": 3000}]))
                db.commit()
                return 200
            except HTTPException as error:
                db.rollback()
                return error.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(allocate, receipts)) == [200, 409]
    with sessions() as db:
        assert db.query(AccountingAllocation).filter_by(member_id=member_id).count() == 1
        assert ledger.member_year_balance(db, member=db.get(Member, member_id), year=YEAR)["paid_cents"] == 3000


def test_same_receipt_request_has_one_postgres_effect(stock_db):
    sessions, org_id, _ = stock_db
    admin_id, member_id = prepare(sessions, org_id)
    receipt_id = receipt(sessions, org_id, admin_id)
    barrier = Barrier(2, timeout=10)
    request_key = uuid4().hex
    def allocate(_):
        with sessions() as db:
            barrier.wait()
            result = ledger.mutate(db, org_id=org_id, request_key=request_key, operation="allocate",
                payload={"receipt_id": receipt_id}, callback=lambda: ledger.allocate(
                    db, org_id=org_id, receipt_id=receipt_id, admin_id=admin_id, version=1,
                    items=[{"target_key": f"initial:{member_id}:{YEAR}", "amount_cents": 3000}]))
            db.commit()
            return result
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(allocate, range(2)))
    assert results[0] == results[1]
    with sessions() as db:
        assert db.query(AccountingAllocation).count() == 1
        assert db.query(AccountingMutation).filter_by(request_key=request_key).count() == 1


def test_concurrent_bulk_preview_and_execution_enqueue_once(stock_db, monkeypatch):
    sessions, org_id, _ = stock_db
    admin_id, member_id = prepare(sessions, org_id)
    payload = {"action": "send_access", "request_key": uuid4().hex,
               "selection": {"mode": "ids", "member_ids": [member_id]}}
    barrier = Barrier(2, timeout=10)
    def preview(_):
        with sessions() as db:
            admin = db.get(AdminUser, admin_id)
            barrier.wait()
            return bulk.preview_run(db, admin=admin, payload=payload).id
    with ThreadPoolExecutor(max_workers=2) as pool:
        ids = list(pool.map(preview, range(2)))
    assert len(set(ids)) == 1
    run_id = ids[0]
    # Exercise actual run/member row locks and the real outbox enqueue. Auth
    # middleware has separate tests; no startup or delivery worker is running.
    monkeypatch.setattr(bulk, "resolve_org_admin_session",
                        lambda request, db, **kw: SimpleNamespace(admin=db.get(AdminUser, admin_id)))
    request = Request({"type": "http", "scheme": "http", "headers": [], "server": ("test", 80)})
    barrier = Barrier(2, timeout=10)
    def execute(_):
        with sessions() as db:
            admin = db.get(AdminUser, admin_id)
            barrier.wait()
            return bulk.execute_run(db, admin=admin, run_id=run_id,
                                    request_key="same-batch-key", request=request).status
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(execute, range(2))) == ["completed", "completed"]
    with sessions() as db:
        assert db.query(MemberBulkRun).count() == 1
        assert db.query(MemberBulkItem).filter_by(status="succeeded").count() == 1
        assert db.query(MemberBulkRequest).count() == 1
        assert db.query(EmailOutbox).count() == 1
        assert db.query(EmailOutbox).one().attempts == 0


def test_purge_waits_for_profile_before_detaching_bulk_item(stock_db):
    from app.services.member_cleanup import purge_deleted_members_permanently

    sessions, org_id, _ = stock_db
    admin_id, member_id = prepare(sessions, org_id)
    with sessions() as db:
        run = bulk.preview_run(db, admin=db.get(AdminUser, admin_id), payload={
            "action": "export", "request_key": uuid4().hex,
            "selection": {"mode": "ids", "member_ids": [member_id]}})
        run_id = run.id
        db.get(Member, member_id).deleted_at = datetime.utcnow()
        db.commit()
    started = Event()
    process_id = []
    def purge():
        with sessions() as db:
            process_id.append(db.execute(text("SELECT pg_backend_pid()")).scalar_one())
            started.set()
            count = purge_deleted_members_permanently(db, org_id=org_id)
            db.commit()
            return count
    with ThreadPoolExecutor(max_workers=1) as pool, sessions() as holder:
        holder.query(Member).filter_by(id=member_id).with_for_update().one()
        future = pool.submit(purge)
        try:
            assert started.wait(timeout=5)
            blocked_query = None
            for _ in range(100):
                with sessions() as monitor:
                    row = monitor.execute(text("SELECT query,wait_event_type FROM pg_stat_activity WHERE pid=:pid"), {"pid": process_id[0]}).one()
                if row.wait_event_type == "Lock":
                    blocked_query = row.query.lower()
                    break
                time.sleep(0.02)
            # PostgreSQL truncates pg_stat_activity.query at 1024 bytes by
            # default; this model's SELECT list is longer than that limit.
            assert blocked_query and blocked_query.startswith("select members.")
            holder.execute(text("SET LOCAL lock_timeout='500ms'"))
            # Equivalent to a bulk operation holding the profile and then
            # updating its outcome. Purge must not own the outcome lock first.
            holder.query(MemberBulkItem).filter_by(run_id=run_id).update({MemberBulkItem.detail: "synthetic concurrency proof"})
        finally:
            holder.rollback()
        assert future.result(timeout=15) == 1
    with sessions() as db:
        assert db.query(MemberBulkItem).filter_by(run_id=run_id).one().member_id is None
