"""Run with --noconftest and the disposable stock_tests database only."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

# Importing this module first enforces APP_ENV/database guards and gives every
# parametrized test its own isolated schema with actual PostgreSQL connections.
from tests.test_card_reservations_postgres import stock_db, YEAR
from sqlalchemy import text
from app.models import AdminUser, CardBatch, CardMovement, NumberingScope, Organization, RechargeRequest
from app.services.card_lot_registry import (
    acquire_card_lot_table_lock, create_automatic_card_lot,
    ensure_recharge_request_batch, find_batch_overlap,
)


def setup(sessions, scope_id):
    with sessions() as db:
        actor = AdminUser(email=f"test-{uuid4().hex}@example.test", role="super_admin")
        other = Organization(name="Second association", slug=f"second-{uuid4().hex}", numbering_scope_id=scope_id)
        db.add_all([actor, other])
        db.commit()
        return actor.id, other.id


def test_simultaneous_automatic_lots_cannot_overlap(stock_db):
    sessions, org_id, scope_id = stock_db
    actor, other = setup(sessions, scope_id)
    barrier = Barrier(4, timeout=20)
    def create(owner):
        with sessions() as db:
            pid = db.execute(text("SELECT pg_backend_pid()")).scalar_one()
            barrier.wait()
            lot, reused = create_automatic_card_lot(db, organization_id=owner, quantity=100,
                year=YEAR, idempotency_key=str(uuid4()), actor_admin_id=actor)
            result = (lot.start_no, lot.end_no, pid)
            assert not reused
            db.commit()
            return result
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = sorted(pool.map(create, [org_id, other, org_id, other]))
    assert len({row[2] for row in results}) == 4
    assert all(left[1] + 1 == right[0] for left, right in zip(results, results[1:]))
    with sessions() as db:
        assert db.query(CardMovement).count() == 4


def test_simultaneous_same_request_creates_one_lot(stock_db):
    sessions, org_id, scope_id = stock_db
    actor, _ = setup(sessions, scope_id)
    key = str(uuid4())
    barrier = Barrier(2, timeout=20)
    def create(_):
        with sessions() as db:
            db.execute(text("SELECT 1"))
            barrier.wait()
            lot, reused = create_automatic_card_lot(db, organization_id=org_id, quantity=100,
                year=YEAR, idempotency_key=key, actor_admin_id=actor)
            result = lot.id, reused
            db.commit()
            return result
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(create, range(2)))
    assert len({row[0] for row in results}) == 1
    assert sorted(row[1] for row in results) == [False, True]
    with sessions() as db:
        assert db.query(CardBatch).count() == db.query(CardMovement).count() == 1


def test_manual_range_and_automatic_creation_share_transaction_lock(stock_db):
    sessions, org_id, scope_id = stock_db
    actor, other = setup(sessions, scope_id)
    barrier = Barrier(2, timeout=20)
    with sessions() as db:
        db.add(CardBatch(org_id=org_id, numbering_scope_id=scope_id, year=YEAR, start_no=1, end_no=100, next_no=1))
        db.commit()
    def attempt(kind):
        with sessions() as db:
            db.execute(text("SELECT 1"))
            barrier.wait()
            if kind == "manual":
                # The same table lock/overlap check used by the manual API.
                acquire_card_lot_table_lock(db)
                if find_batch_overlap(db, 101, 200, domain_scope_id=scope_id):
                    db.rollback()
                    return None
                lot = CardBatch(org_id=other, numbering_scope_id=scope_id, year=YEAR,
                                start_no=101, end_no=200, next_no=101)
                db.add(lot)
            else:
                lot, _ = create_automatic_card_lot(db, organization_id=org_id, quantity=100,
                    year=YEAR, idempotency_key=str(uuid4()), actor_admin_id=actor)
            db.commit()
            return lot.start_no, lot.end_no
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(attempt, ["manual", "automatic"]))
    with sessions() as db:
        lots = db.query(CardBatch).order_by(CardBatch.start_no).all()
        assert len(lots) in (2, 3)
        assert all(left.end_no < right.start_no for left, right in zip(lots, lots[1:]))


def test_recharge_and_registry_creation_cannot_overlap(stock_db):
    sessions, org_id, scope_id = stock_db
    if scope_id is None:
        return  # Recharge is deliberately unavailable for legacy numbering.
    actor, other = setup(sessions, scope_id)
    with sessions() as db:
        db.get(NumberingScope, scope_id).name = "ASSONAM_CENTRAL"
        request = RechargeRequest(association_id=other, association_name="Second association",
                                  requester_whatsapp="test-only", requested_cards=100, requested_year=YEAR)
        db.add(request)
        db.commit()
        request_id = request.id
    barrier = Barrier(2, timeout=20)
    def create(kind):
        with sessions() as db:
            db.execute(text("SELECT 1"))
            barrier.wait()
            if kind == "recharge":
                lot = ensure_recharge_request_batch(db, request_id)
            else:
                lot, _ = create_automatic_card_lot(db, organization_id=org_id, quantity=100,
                    year=YEAR, idempotency_key=str(uuid4()), actor_admin_id=actor)
            result = lot.start_no, lot.end_no
            db.commit()
            return result
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = sorted(pool.map(create, ["recharge", "registry"]))
    assert results == [(30001, 30100), (30101, 30200)]
