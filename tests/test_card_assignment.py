"""Integration tests for multi-batch annual card allocation."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import threading
import uuid

import pytest
from fastapi import HTTPException

from app.db import SessionLocal
from app.models import CardBatch, Organization
from app.services.card_allocation import allocate_next_card


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _create_org(db, slug_prefix: str) -> Organization:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Card Alloc {suffix}",
        slug=f"{slug_prefix}-{suffix}",
        is_active=True,
        privacy_version="v1",
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _create_batch(
    db,
    *,
    org_id: int,
    year: int,
    start_no: int,
    end_no: int,
    next_no: int | None = None,
) -> CardBatch:
    batch = CardBatch(
        org_id=org_id,
        year=year,
        start_no=start_no,
        end_no=end_no,
        next_no=start_no if next_no is None else next_no,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def test_allocate_falls_back_to_next_available_batch_in_same_year(db):
    current_year = datetime.utcnow().year
    org = _create_org(db, "card-alloc-fallback")
    _create_batch(db, org_id=org.id, year=current_year, start_no=100, end_no=101, next_no=100)
    _create_batch(db, org_id=org.id, year=current_year, start_no=200, end_no=205, next_no=200)

    first = allocate_next_card(db, org.id, current_year)
    db.commit()
    second = allocate_next_card(db, org.id, current_year)
    db.commit()
    third = allocate_next_card(db, org.id, current_year)
    db.commit()

    assert [first.card_no, second.card_no, third.card_no] == [100, 101, 200]


def test_exhausted_first_batch_uses_second_without_409(db):
    current_year = datetime.utcnow().year
    org = _create_org(db, "card-alloc-no-409")
    _create_batch(db, org_id=org.id, year=current_year, start_no=100, end_no=101, next_no=102)
    _create_batch(db, org_id=org.id, year=current_year, start_no=200, end_no=205, next_no=200)

    allocation = allocate_next_card(db, org.id, current_year)
    db.commit()

    assert allocation.card_no == 200


def test_allocate_returns_409_when_all_batches_exhausted(db):
    current_year = datetime.utcnow().year
    org = _create_org(db, "card-alloc-exhausted")
    _create_batch(db, org_id=org.id, year=current_year, start_no=100, end_no=101, next_no=102)
    _create_batch(db, org_id=org.id, year=current_year, start_no=200, end_no=205, next_no=206)

    with pytest.raises(HTTPException) as exc_info:
        allocate_next_card(db, org.id, current_year)

    assert exc_info.value.status_code == 409
    assert "card_range_exhausted" in str(exc_info.value.detail)


def test_allocate_is_concurrency_safe_for_10_parallel_requests(db):
    current_year = datetime.utcnow().year
    org = _create_org(db, "card-alloc-concurrency")
    org_id = org.id
    start_no = 30000
    _create_batch(
        db,
        org_id=org_id,
        year=current_year,
        start_no=start_no,
        end_no=start_no + 20,
        next_no=start_no,
    )

    barrier = threading.Barrier(10)

    def _worker() -> int:
        session = SessionLocal()
        try:
            barrier.wait(timeout=10)
            allocation = allocate_next_card(session, org_id, current_year)
            session.commit()
            return allocation.card_no
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=10) as executor:
        assigned_numbers = list(executor.map(lambda _idx: _worker(), range(10)))

    assert len(assigned_numbers) == 10
    assert len(set(assigned_numbers)) == 10
    assert sorted(assigned_numbers) == list(range(start_no, start_no + 10))
