from __future__ import annotations

from dataclasses import dataclass
import logging

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import CardBatch, Organization
from app.services.card_availability import eligible_card_batches, occupied_card_numbers

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
        if immediate_sqlite:
            if db.in_transaction():
                logger.debug("sqlite_allocation_lock_skipped_existing_transaction")
                return
            # Acquire the SQLite writer lock before the first ORM SELECT.  A
            # Session.execute(PRAGMA ...) auto-begins the SQLAlchemy
            # transaction, which previously made the guard above skip
            # ``BEGIN IMMEDIATE`` on every call and allowed parallel workers
            # to read the same ``next_no`` value.
            connection = db.connection()
            connection.exec_driver_sql("PRAGMA busy_timeout = 5000")
            connection.exec_driver_sql("BEGIN IMMEDIATE")
            return
        db.execute(text("PRAGMA busy_timeout = 5000"))


def _acquire_sqlite_allocation_lock_before_read(db: Session) -> None:
    """Serialize SQLite allocation before resolving the organization.

    PostgreSQL uses the narrower advisory lock once the numbering domain is
    known.  SQLite only supports a database-level writer lock, so taking it
    before the first SELECT is both the smallest safe critical section and
    the only way to avoid a deferred read transaction racing another worker.
    """

    bind = db.get_bind()
    if bind is None or bind.dialect.name != "sqlite":
        return
    connection = db.connection()
    connection.exec_driver_sql("PRAGMA busy_timeout = 5000")
    # An ORM SELECT can autobegin the Session without starting a SQLite
    # transaction. Acquire the writer lock in that case too; never nest BEGIN
    # after a write or an already acquired request lock.
    if not connection.connection.driver_connection.in_transaction:
        connection.exec_driver_sql("BEGIN IMMEDIATE")


def lock_card_allocation(db: Session, org_id: int, year: int) -> Organization:
    """Lock the complete uniqueness domain until the caller commits/rolls back."""
    if year <= 0:
        raise HTTPException(status_code=400, detail="card_year non valido")
    _acquire_sqlite_allocation_lock_before_read(db)
    # Member uniqueness is per organization across all years. Always acquire
    # the organization before its shared scope, including legacy fallback lots.
    _acquire_allocation_lock(db, domain_id=org_id, year=0)
    db.flush()
    org = db.query(Organization).filter(Organization.id == org_id).populate_existing().first()
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    if org.numbering_scope_id is not None:
        _acquire_allocation_lock(db, domain_id=org.numbering_scope_id, year=0, namespace=SCOPE_LOCK_NAMESPACE)
    return org


def _batch_next_candidate(batch: CardBatch) -> int:
    return max(batch.next_no if batch.next_no is not None else batch.start_no, batch.start_no)


def _assign_from_batches(
    db: Session,
    *,
    org: Organization,
    year: int,
    candidate_batches: list[CardBatch],
    use_scope_occupancy: bool,
) -> CardAllocationResult:
    exhausted_batch_ids: list[int] = []
    occupied_numbers = occupied_card_numbers(
        db, org_id=org.id,
        scope_id=org.numbering_scope_id if use_scope_occupancy else None,
        start_no=min(batch.start_no for batch in candidate_batches),
        end_no=max(batch.end_no for batch in candidate_batches), year=year,
    )

    for batch in candidate_batches:
        next_candidate = batch.start_no
        while next_candidate <= batch.end_no and next_candidate in occupied_numbers:
            next_candidate += 1

        if next_candidate > batch.end_no:
            exhausted_batch_ids.append(batch.id)
            batch.next_no = next_candidate
            db.add(batch)
            continue

        batch.next_no = next_candidate + 1
        while batch.next_no <= batch.end_no and batch.next_no in occupied_numbers:
            batch.next_no += 1
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

    lock_card_allocation(db, org_id, year or 1)

    batch: CardBatch | None = None
    if batch_id is not None:
        filters = [CardBatch.id == batch_id, CardBatch.released_at.is_(None)]
        filters.append(CardBatch.org_id == org_id)
        if year is not None and year > 0:
            batch = db.query(CardBatch).filter(*filters, CardBatch.year == year).first()
        if batch is None:
            batch = db.query(CardBatch).filter(*filters).first()

    if batch is None:
        range_filters = [
            CardBatch.org_id == org_id,
            CardBatch.released_at.is_(None),
            CardBatch.start_no <= card_no,
            CardBatch.end_no >= card_no,
        ]
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
    """Select a free number; persist its owner in this transaction before commit."""
    org = lock_card_allocation(db, org_id, year)
    batches = eligible_card_batches(db, org_ids=[org_id], year=year)
    if not batches:
        raise _card_range_exhausted(org_id, year)
    return _assign_from_batches(
        db, org=org, year=year, candidate_batches=batches,
        use_scope_occupancy=batches[0].numbering_scope_id is not None,
    )
