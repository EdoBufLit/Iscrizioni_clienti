"""PostgreSQL-only concurrency checks; run with pytest --noconftest.

Requires APP_ENV=test and DATABASE_URL targeting the disposable stock_tests
database. Every test creates and drops only its own UUID-named schema.
No application startup, production database, provider call or migration runs.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
import os
from threading import Barrier, Event
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker


_TEST_URL = make_url(os.getenv("DATABASE_URL", "sqlite://"))
if (
    os.getenv("APP_ENV", "").lower() != "test"
    or _TEST_URL.get_backend_name() != "postgresql"
    or _TEST_URL.database != "stock_tests"
):
    pytest.skip(
        "Requires APP_ENV=test, PostgreSQL DATABASE_URL with database=stock_tests, "
        "and --noconftest (normal app fixtures force SQLite).",
        allow_module_level=True,
    )

from fastapi import HTTPException

from app.db import Base
from app.models import CardBatch, Member, MembershipPayment, NumberingScope, Organization
from app.services.card_allocation import allocate_next_card, lock_card_allocation
from app.services.card_availability import card_batch_availability
from app.services.card_reservations import reserve_payment_card
from app.services.membership_payments import reuse_existing_sumup_checkout


YEAR = datetime.now(timezone.utc).year


@pytest.fixture(params=[False, True], ids=["organization-domain", "shared-scope-domain"])
def stock_db(request):
    schema_name = f"stock_concurrency_{uuid4().hex}"
    # Both engines connect exclusively to the named disposable test database.
    control_engine = create_engine(_TEST_URL, pool_pre_ping=True)
    test_engine = None
    schema_created = False
    try:
        with control_engine.begin() as conn:
            assert conn.execute(text("SELECT current_database()")).scalar_one() == "stock_tests"
            conn.execute(text(f'CREATE SCHEMA "{schema_name}"'))
            schema_created = True
        test_engine = create_engine(
            _TEST_URL,
            connect_args={
                "options": f"-csearch_path={schema_name} -clock_timeout=15000 -cstatement_timeout=30000",
            },
            pool_size=12,
            max_overflow=0,
            pool_pre_ping=True,
        )
        Base.metadata.create_all(test_engine)
        sessions = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)
        with sessions() as db:
            scope = None
            if request.param:
                scope = NumberingScope(name=f"test-{uuid4().hex}", scope_type="shared")
                db.add(scope)
                db.flush()
            org = Organization(
                name="PostgreSQL concurrency fixture",
                slug=f"stock-tests-{uuid4().hex}",
                numbering_scope_id=scope.id if scope else None,
            )
            db.add(org)
            db.commit()
            org_id = org.id
            scope_id = org.numbering_scope_id
        yield sessions, org_id, scope_id
    finally:
        if test_engine is not None:
            test_engine.dispose()
        if schema_created:
            with control_engine.begin() as conn:
                # Exact generated identifier; no application tables or other
                # schema can be addressed by this cleanup statement.
                assert schema_name.startswith("stock_concurrency_")
                conn.execute(text(f'DROP SCHEMA "{schema_name}" CASCADE'))
        control_engine.dispose()


def _batch_and_members(sessions, org_id, scope_id, *, count, occupied=()):
    with sessions() as db:
        batch = CardBatch(
            org_id=org_id, numbering_scope_id=scope_id, year=YEAR,
            start_no=1000, end_no=1000 + count - 1, next_no=1000 + count,
        )
        db.add(batch)
        db.flush()
        for number in occupied:
            db.add(Member(
                org_id=org_id, email=f"occupied-{number}@stock-tests.invalid",
                card_no=number, card_year=YEAR, batch_id=batch.id,
                numbering_scope_id=scope_id, status="active",
            ))
        db.commit()
        return batch.id


def _payments(sessions, org_id, *, count):
    with sessions() as db:
        payments = [MembershipPayment(
            org_id=org_id, membership_year=YEAR, payment_kind="initial",
            provider="sumup", amount=Decimal("10.00"), currency="EUR",
            status="pending", source="sumup", checkout_reference=f"test-{uuid4().hex}",
        ) for _ in range(count)]
        db.add_all(payments)
        db.commit()
        return [payment.id for payment in payments]


@dataclass(frozen=True)
class Result:
    status: int
    card_no: int | None
    backend_pid: int
    kind: str


def _parallel_attempts(sessions, *, org_id, payment_ids, manual_member_id=None):
    jobs = [("checkout", payment_id) for payment_id in payment_ids]
    if manual_member_id is not None:
        jobs.append(("manual", manual_member_id))
    barrier = Barrier(len(jobs), timeout=20)

    def attempt(job):
        kind, entity_id = job
        with sessions() as db:
            backend_pid = db.execute(text("SELECT pg_backend_pid()")).scalar_one()
            entity = db.get(MembershipPayment if kind == "checkout" else Member, entity_id)
            assert entity is not None
            # All contenders own a separate live PostgreSQL connection and
            # begin allocation together, while no transaction has committed.
            barrier.wait()
            try:
                if kind == "checkout":
                    allocation = reserve_payment_card(db, entity)
                else:
                    allocation = allocate_next_card(db, org_id, YEAR)
                    entity.card_no = allocation.card_no
                    entity.card_year = allocation.year
                    entity.batch_id = allocation.batch_id
                    entity.numbering_scope_id = allocation.numbering_scope_id
                    entity.status = "active"
                db.commit()
                return Result(200, allocation.card_no, backend_pid, kind)
            except HTTPException as exc:
                db.rollback()
                return Result(exc.status_code, None, backend_pid, kind)

    with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
        futures = [pool.submit(attempt, job) for job in jobs]
        results = [future.result(timeout=60) for future in futures]
    assert len({result.backend_pid for result in results}) == len(jobs)
    return results


def test_two_concurrent_checkouts_admit_only_one_hold_on_the_last_card(stock_db):
    sessions, org_id, scope_id = stock_db
    batch_id = _batch_and_members(sessions, org_id, scope_id, count=1)
    payment_ids = _payments(sessions, org_id, count=2)

    results = _parallel_attempts(sessions, org_id=org_id, payment_ids=payment_ids)

    assert sorted(result.status for result in results) == [200, 409]
    assert [result.card_no for result in results if result.status == 200] == [1000]
    with sessions() as db:
        held = db.query(MembershipPayment).filter_by(reservation_state="held").all()
        assert len(held) == 1
        assert held[0].reserved_card_no == 1000
        assert held[0].reservation_expires_at is not None
        assert db.query(Member).filter(Member.card_no.is_not(None)).count() == 0
        assert card_batch_availability(db, [db.get(CardBatch, batch_id)])[batch_id].remaining == 0


def test_ten_parallel_checkouts_fill_ten_historical_holes_without_duplicates(stock_db):
    sessions, org_id, scope_id = stock_db
    holes = set(range(1000, 1100, 10))
    occupied = set(range(1000, 1100)) - holes
    batch_id = _batch_and_members(sessions, org_id, scope_id, count=100, occupied=occupied)
    payment_ids = _payments(sessions, org_id, count=10)

    results = _parallel_attempts(sessions, org_id=org_id, payment_ids=payment_ids)

    assert all(result.status == 200 for result in results)
    assert {result.card_no for result in results} == holes
    with sessions() as db:
        held = db.query(MembershipPayment).filter_by(reservation_state="held").all()
        assert len(held) == 10
        assert {payment.reserved_card_no for payment in held} == holes
        assert {number for number, in db.query(Member.card_no).all()} == occupied
        assert card_batch_availability(db, [db.get(CardBatch, batch_id)])[batch_id].remaining == 0


def test_checkout_and_manual_issuance_cannot_both_claim_the_last_card(stock_db):
    sessions, org_id, scope_id = stock_db
    batch_id = _batch_and_members(sessions, org_id, scope_id, count=1)
    payment_ids = _payments(sessions, org_id, count=1)
    with sessions() as db:
        member = Member(org_id=org_id, email="manual@stock-tests.invalid", status="pending_cards")
        db.add(member)
        db.commit()
        manual_member_id = member.id

    results = _parallel_attempts(
        sessions, org_id=org_id, payment_ids=payment_ids, manual_member_id=manual_member_id,
    )

    assert sorted(result.status for result in results) == [200, 409]
    with sessions() as db:
        held = db.query(MembershipPayment).filter_by(reservation_state="held").count()
        assigned = db.query(Member).filter(Member.card_no.is_not(None)).count()
        assert held + assigned == 1
        winner = next(result for result in results if result.status == 200)
        assert winner.card_no == 1000
        assert (held, assigned) == ((1, 0) if winner.kind == "checkout" else (0, 1))
        assert card_batch_availability(db, [db.get(CardBatch, batch_id)])[batch_id].remaining == 0


def test_slow_checkout_verification_does_not_block_other_stock_allocation(stock_db):
    sessions, org_id, scope_id = stock_db
    _batch_and_members(sessions, org_id, scope_id, count=2)
    first_id, second_id = _payments(sessions, org_id, count=2)
    with sessions() as db:
        payment = db.get(MembershipPayment, first_id)
        reserve_payment_card(db, payment)
        payment.sumup_checkout_id = "slow-provider-checkout"
        payment.hosted_checkout_url = "https://sumup.example/slow"
        db.commit()

    provider_entered = Event()
    provider_continue = Event()

    def verify(org, payment):
        provider_entered.set()
        assert provider_continue.wait(timeout=10), "Test did not release the provider response"
        return {"id": payment.sumup_checkout_id, "status": "PENDING"}

    def retry():
        with sessions() as db:
            # Match the request path: the caller already owns the domain lock
            # while it resolves the existing payment to retry.
            lock_card_allocation(db, org_id, YEAR)
            payment = db.get(MembershipPayment, first_id)
            org = db.get(Organization, org_id)
            reusable = reuse_existing_sumup_checkout(db, payment, org, verify_checkout=verify)
            db.commit()
            return reusable

    def reserve_other_card():
        with sessions() as db:
            payment = db.get(MembershipPayment, second_id)
            allocation = reserve_payment_card(db, payment)
            db.commit()
            return allocation.card_no

    with ThreadPoolExecutor(max_workers=2) as pool:
        retry_future = pool.submit(retry)
        try:
            assert provider_entered.wait(timeout=5), "Checkout never reached provider verification"
            other_future = pool.submit(reserve_other_card)
            # This must finish while provider_continue is still unset. Keeping
            # a domain lock over HTTP I/O makes this assertion time out.
            assert other_future.result(timeout=3) == 1001
        finally:
            provider_continue.set()
        assert retry_future.result(timeout=5) is True


def test_two_expired_checkout_retries_create_only_one_replacement(stock_db):
    sessions, org_id, scope_id = stock_db
    _batch_and_members(sessions, org_id, scope_id, count=2)
    old_id = _payments(sessions, org_id, count=1)[0]
    with sessions() as db:
        member = Member(org_id=org_id, email="retry@stock-tests.invalid", status="pending_cards")
        db.add(member)
        db.flush()
        member_id = member.id
        payment = db.get(MembershipPayment, old_id)
        payment.socio_id = member_id
        reserve_payment_card(db, payment)
        payment.sumup_checkout_id = "expired-checkout"
        payment.hosted_checkout_url = "https://sumup.example/expired"
        db.commit()

    both_provider_requests = Barrier(2, timeout=8)
    created_provider_checkouts = []

    def verify(org, payment):
        # Both requests selected the same old attempt before dropping their
        # domain locks for the provider GET.
        both_provider_requests.wait()
        return {"id": "expired-checkout", "status": "EXPIRED", "transactions": []}

    def retry():
        with sessions() as db:
            lock_card_allocation(db, org_id, YEAR)
            old_payment = db.get(MembershipPayment, old_id)
            org = db.get(Organization, org_id)
            try:
                reusable = reuse_existing_sumup_checkout(db, old_payment, org, verify_checkout=verify)
                assert reusable is False
                # This is the create-checkout contract after a safe False:
                # the helper must still own the domain and validate that no
                # newer attempt appeared while it performed provider I/O.
                payment = MembershipPayment(
                    org_id=org_id, socio_id=member_id, membership_year=YEAR,
                    payment_kind="initial", provider="sumup", source="sumup",
                    amount=Decimal("10.00"), currency="EUR", status="pending",
                    checkout_reference=f"replacement-{uuid4().hex}",
                )
                db.add(payment)
                reserve_payment_card(db, payment)
                db.commit()
                # Represents POST /checkouts; no external request is made.
                created_provider_checkouts.append(payment.id)
                return "created"
            except HTTPException as exc:
                db.rollback()
                assert exc.status_code == 409
                return "conflict"

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(retry) for _ in range(2)]
        outcomes = [future.result(timeout=20) for future in futures]

    assert sorted(outcomes) == ["conflict", "created"]
    assert len(created_provider_checkouts) == 1
    with sessions() as db:
        payments = db.query(MembershipPayment).filter_by(socio_id=member_id).all()
        assert len(payments) == 2
        assert db.get(MembershipPayment, old_id).reservation_state == "released"
        holds = [payment for payment in payments if payment.reservation_state == "held"]
        assert len(holds) == 1
        assert holds[0].id == created_provider_checkouts[0]
