from __future__ import annotations

from dataclasses import dataclass
import logging

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models import CardBatch, Member

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CardAllocationResult:
    card_no: int
    batch_id: int
    year: int


def _card_range_exhausted(org_id: int, year: int) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail=(
            "card_range_exhausted: Nessun lotto tessere disponibile "
            f"per org_id={org_id} anno={year}"
        ),
    )


def _advisory_lock_key(org_id: int, year: int) -> int:
    raw_key = ((org_id & 0xFFFFFFFF) << 32) | (year & 0xFFFFFFFF)
    if raw_key >= (1 << 63):
        raw_key -= (1 << 64)
    return raw_key


def _acquire_allocation_lock(db: Session, *, org_id: int, year: int) -> None:
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        db.execute(
            text("SELECT pg_advisory_xact_lock(:lock_key)"),
            {"lock_key": _advisory_lock_key(org_id, year)},
        )
        return
    if dialect == "sqlite":
        db.execute(text("PRAGMA busy_timeout = 5000"))
        db.execute(text("BEGIN IMMEDIATE"))


def _ordered_batches_query(org_id: int, year: int):
    return (
        select(CardBatch)
        .where(
            CardBatch.org_id == org_id,
            CardBatch.year == year,
            CardBatch.released_at.is_(None),
        )
        .order_by(
            func.coalesce(CardBatch.next_no, CardBatch.start_no).asc(),
            CardBatch.start_no.asc(),
            CardBatch.created_at.asc(),
            CardBatch.id.asc(),
        )
    )


def _batch_next_candidate(batch: CardBatch) -> int:
    baseline = batch.next_no if batch.next_no is not None else batch.start_no
    if baseline < batch.start_no:
        return batch.start_no
    return baseline


def _occupied_numbers(
    db: Session,
    *,
    org_id: int,
    start_no: int,
    end_no: int,
) -> set[int]:
    if start_no > end_no:
        return set()
    occupied_rows = db.execute(
        select(Member.card_no).where(
            Member.org_id == org_id,
            Member.deleted_at.is_(None),
            Member.card_no.isnot(None),
            Member.card_no >= start_no,
            Member.card_no <= end_no,
        )
    ).all()
    return {int(row[0]) for row in occupied_rows if row[0] is not None}


def allocate_next_card(db: Session, org_id: int, year: int) -> CardAllocationResult:
    if year <= 0:
        raise HTTPException(status_code=400, detail="card_year non valido")

    _acquire_allocation_lock(db, org_id=org_id, year=year)
    candidate_batches = db.execute(_ordered_batches_query(org_id, year)).scalars().all()
    if not candidate_batches:
        raise _card_range_exhausted(org_id, year)

    exhausted_batch_ids: list[int] = []
    for batch in candidate_batches:
        next_candidate = _batch_next_candidate(batch)
        if next_candidate > batch.end_no:
            exhausted_batch_ids.append(batch.id)
            continue

        occupied_numbers = _occupied_numbers(
            db,
            org_id=org_id,
            start_no=next_candidate,
            end_no=batch.end_no,
        )
        while next_candidate <= batch.end_no and next_candidate in occupied_numbers:
            next_candidate += 1

        if next_candidate > batch.end_no:
            exhausted_batch_ids.append(batch.id)
            batch.next_no = next_candidate
            db.add(batch)
            continue

        batch.next_no = next_candidate + 1
        db.add(batch)
        db.flush()

        if exhausted_batch_ids:
            logger.info(
                "batch_exhausted_fallback org_id=%s year=%s exhausted_batch_ids=%s selected_batch_id=%s",
                org_id,
                year,
                exhausted_batch_ids,
                batch.id,
            )

        logger.info(
            "card_allocated org_id=%s year=%s batch_id=%s card_no=%s",
            org_id,
            year,
            batch.id,
            next_candidate,
        )
        return CardAllocationResult(card_no=next_candidate, batch_id=batch.id, year=year)

    raise _card_range_exhausted(org_id, year)
