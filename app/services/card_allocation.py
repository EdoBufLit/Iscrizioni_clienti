from __future__ import annotations

from dataclasses import dataclass
import logging

from fastapi import HTTPException
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from app.models import CardBatch, Member, Organization

logger = logging.getLogger(__name__)

SCOPE_LOCK_NAMESPACE = 1


@dataclass(frozen=True)
class CardAllocationResult:
    card_no: int
    batch_id: int
    year: int
    numbering_scope_id: int | None = None


def _card_range_exhausted(org_id: int, year: int) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail=(
            "card_range_exhausted: Nessun lotto tessere disponibile "
            f"per org_id={org_id} anno={year}"
        ),
    )


def _advisory_lock_key(domain_id: int, year: int, *, namespace: int = 0) -> int:
    raw_key = (
        ((namespace & 0xFFFF) << 48)
        | ((domain_id & 0xFFFF) << 32)
        | (year & 0xFFFFFFFF)
    )
    if raw_key >= (1 << 63):
        raw_key -= (1 << 64)
    return raw_key


def _acquire_allocation_lock(
    db: Session,
    *,
    domain_id: int,
    year: int,
    namespace: int = 0,
    immediate_sqlite: bool = True,
) -> None:
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        db.execute(
            text("SELECT pg_advisory_xact_lock(:lock_key)"),
            {"lock_key": _advisory_lock_key(domain_id, year, namespace=namespace)},
        )
        return
    if dialect == "sqlite":
        db.execute(text("PRAGMA busy_timeout = 5000"))
        if immediate_sqlite:
            db.execute(text("BEGIN IMMEDIATE"))


def _ordered_legacy_batches_query(org_id: int, year: int):
    return (
        select(CardBatch)
        .where(
            CardBatch.org_id == org_id,
            CardBatch.numbering_scope_id.is_(None),
            CardBatch.year == year,
            CardBatch.is_enabled.is_(True),
            CardBatch.released_at.is_(None),
        )
        .order_by(
            func.coalesce(CardBatch.next_no, CardBatch.start_no).asc(),
            CardBatch.start_no.asc(),
            CardBatch.created_at.asc(),
            CardBatch.id.asc(),
        )
    )


def _ordered_scope_batches_query(scope_id: int, year: int):
    return (
        select(CardBatch)
        .where(
            CardBatch.numbering_scope_id == scope_id,
            CardBatch.year == year,
            CardBatch.is_enabled.is_(True),
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


def _occupied_numbers_for_org(
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
            Member.card_no.isnot(None),
            Member.card_no >= start_no,
            Member.card_no <= end_no,
        )
    ).all()
    return {int(row[0]) for row in occupied_rows if row[0] is not None}


def _occupied_numbers_for_scope(
    db: Session,
    *,
    scope_id: int,
    start_no: int,
    end_no: int,
) -> set[int]:
    if start_no > end_no:
        return set()
    occupied_rows = db.execute(
        select(Member.card_no)
        .select_from(Member)
        .outerjoin(CardBatch, Member.batch_id == CardBatch.id)
        .where(
            Member.card_no.isnot(None),
            Member.card_no >= start_no,
            Member.card_no <= end_no,
            or_(
                Member.numbering_scope_id == scope_id,
                CardBatch.numbering_scope_id == scope_id,
            ),
        )
    ).all()
    return {int(row[0]) for row in occupied_rows if row[0] is not None}


def _assign_from_batches(
    db: Session,
    *,
    org: Organization,
    year: int,
    candidate_batches: list[CardBatch],
    use_scope_occupancy: bool,
) -> CardAllocationResult:
    exhausted_batch_ids: list[int] = []
    scope_id = org.numbering_scope_id

    for batch in candidate_batches:
        next_candidate = _batch_next_candidate(batch)
        if next_candidate > batch.end_no:
            exhausted_batch_ids.append(batch.id)
            continue

        occupied_numbers = _occupied_numbers_for_org(
            db,
            org_id=org.id,
            start_no=next_candidate,
            end_no=batch.end_no,
        )
        if use_scope_occupancy and scope_id is not None and batch.numbering_scope_id is not None:
            occupied_numbers |= _occupied_numbers_for_scope(
                db,
                scope_id=scope_id,
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
                "batch_exhausted_fallback org_id=%s year=%s exhausted_batch_ids=%s selected_batch_id=%s use_scope=%s",
                org.id,
                year,
                exhausted_batch_ids,
                batch.id,
                use_scope_occupancy,
            )

        logger.info(
            "card_allocated org_id=%s year=%s batch_id=%s card_no=%s scope_id=%s legacy_fallback=%s",
            org.id,
            year,
            batch.id,
            next_candidate,
            batch.numbering_scope_id,
            not use_scope_occupancy,
        )
        return CardAllocationResult(
            card_no=next_candidate,
            batch_id=batch.id,
            year=year,
            numbering_scope_id=batch.numbering_scope_id,
        )

    raise _card_range_exhausted(org.id, year)


def _allocate_next_card_legacy(db: Session, org: Organization, year: int) -> CardAllocationResult:
    _acquire_allocation_lock(db, domain_id=org.id, year=year)
    candidate_batches = db.execute(_ordered_legacy_batches_query(org.id, year)).scalars().all()
    if not candidate_batches:
        raise _card_range_exhausted(org.id, year)
    return _assign_from_batches(
        db,
        org=org,
        year=year,
        candidate_batches=candidate_batches,
        use_scope_occupancy=False,
    )


def _allocate_next_card_scoped(db: Session, org: Organization, year: int) -> CardAllocationResult:
    if org.numbering_scope_id is None:
        return _allocate_next_card_legacy(db, org, year)

    _acquire_allocation_lock(
        db,
        domain_id=org.numbering_scope_id,
        year=year,
        namespace=SCOPE_LOCK_NAMESPACE,
    )

    scoped_batches = db.execute(
        _ordered_scope_batches_query(org.numbering_scope_id, year)
    ).scalars().all()
    if scoped_batches:
        return _assign_from_batches(
            db,
            org=org,
            year=year,
            candidate_batches=scoped_batches,
            use_scope_occupancy=True,
        )

    legacy_fallback_batches = db.execute(
        _ordered_legacy_batches_query(org.id, year)
    ).scalars().all()
    if legacy_fallback_batches:
        logger.info(
            "scoped_allocation_legacy_batch_fallback org_id=%s year=%s scope_id=%s batch_count=%s",
            org.id,
            year,
            org.numbering_scope_id,
            len(legacy_fallback_batches),
        )
        return _assign_from_batches(
            db,
            org=org,
            year=year,
            candidate_batches=legacy_fallback_batches,
            use_scope_occupancy=False,
        )

    raise _card_range_exhausted(org.id, year)


def release_card_number(
    db: Session,
    *,
    org_id: int,
    year: int | None,
    card_no: int | None,
    batch_id: int | None = None,
) -> None:
    if card_no is None or card_no <= 0:
        return

    org = db.query(Organization).filter(Organization.id == org_id).first()
    org_scope_id = getattr(org, "numbering_scope_id", None)

    batch: CardBatch | None = None
    if batch_id is not None:
        filters = [CardBatch.id == batch_id, CardBatch.released_at.is_(None)]
        if org_scope_id is not None:
            filters.append(
                or_(
                    CardBatch.org_id == org_id,
                    CardBatch.numbering_scope_id == org_scope_id,
                )
            )
        else:
            filters.append(CardBatch.org_id == org_id)
        if year is not None and year > 0:
            batch = db.query(CardBatch).filter(*filters, CardBatch.year == year).first()
        if batch is None:
            batch = db.query(CardBatch).filter(*filters).first()

    if batch is None:
        range_filters = [
            CardBatch.released_at.is_(None),
            CardBatch.start_no <= card_no,
            CardBatch.end_no >= card_no,
        ]
        if org_scope_id is not None:
            range_filters.append(
                or_(
                    CardBatch.numbering_scope_id == org_scope_id,
                    CardBatch.org_id == org_id,
                )
            )
        else:
            range_filters.append(CardBatch.org_id == org_id)
        if year is not None and year > 0:
            batch = (
                db.query(CardBatch)
                .filter(*range_filters, CardBatch.year == year)
                .order_by(CardBatch.start_no.asc(), CardBatch.id.asc())
                .first()
            )
        if batch is None:
            batch = (
                db.query(CardBatch)
                .filter(*range_filters)
                .order_by(CardBatch.year.desc(), CardBatch.start_no.asc(), CardBatch.id.asc())
                .first()
            )

    if batch is None:
        return

    lock_year = year if year is not None and year > 0 else batch.year
    if batch.numbering_scope_id is not None:
        _acquire_allocation_lock(
            db,
            domain_id=batch.numbering_scope_id,
            year=lock_year,
            namespace=SCOPE_LOCK_NAMESPACE,
            immediate_sqlite=False,
        )
    else:
        _acquire_allocation_lock(
            db,
            domain_id=org_id,
            year=lock_year,
            immediate_sqlite=False,
        )

    current_next = _batch_next_candidate(batch)
    if card_no < current_next:
        batch.next_no = card_no
        db.add(batch)
        logger.info(
            "card_released_rewind_next_no org_id=%s year=%s batch_id=%s card_no=%s next_no=%s scope_id=%s",
            org_id,
            year,
            batch.id,
            card_no,
            batch.next_no,
            batch.numbering_scope_id,
        )


def allocate_next_card(db: Session, org_id: int, year: int) -> CardAllocationResult:
    if year <= 0:
        raise HTTPException(status_code=400, detail="card_year non valido")

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")

    if org.numbering_scope_id is None:
        return _allocate_next_card_legacy(db, org, year)
    return _allocate_next_card_scoped(db, org, year)
