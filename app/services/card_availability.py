"""One definition of occupied card numbers for issuance, checkout and stock."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import literal, or_, select, union_all
from sqlalchemy.orm import Session

from app.models import (
    AnnualMembershipTerm,
    CardBatch,
    Member,
    MembershipPayment,
    Organization,
)


@dataclass(frozen=True)
class CardBatchAvailability:
    total: int
    assigned: int
    reserved: int
    remaining: int
    next_no: int


def _occupancy_rows(
    db: Session,
    *,
    org_ids: set[int],
    scope_ids: set[int],
    start_no: int,
    end_no: int,
    exclude_payment_id: int | None = None,
):
    # Sessions disable autoflush. The previous allocation must be visible when
    # issuing several cards in one transaction (imports and annual renewals).
    db.flush()
    queries = []
    for model, number, scope, batch_id, filters, kind in (
        (
            Member, Member.card_no, Member.numbering_scope_id,
            Member.batch_id, [], "assigned",
        ),
        (
            AnnualMembershipTerm, AnnualMembershipTerm.card_no,
            AnnualMembershipTerm.numbering_scope_id, AnnualMembershipTerm.batch_id,
            [AnnualMembershipTerm.status.notin_(("expired", "cancelled"))], "assigned",
        ),
        (
            MembershipPayment, MembershipPayment.reserved_card_no,
            MembershipPayment.reserved_numbering_scope_id,
            MembershipPayment.reserved_batch_id,
            [MembershipPayment.reservation_state == "held"], "reserved",
        ),
    ):
        domain = [model.org_id.in_(org_ids)]
        if scope_ids:
            domain.extend(
                (scope.in_(scope_ids), CardBatch.numbering_scope_id.in_(scope_ids))
            )
        if model is MembershipPayment and exclude_payment_id is not None:
            filters = [*filters, MembershipPayment.id != exclude_payment_id]
        queries.append(
            select(model.org_id, scope, CardBatch.numbering_scope_id, number, literal(kind))
            .select_from(model)
            .outerjoin(CardBatch, batch_id == CardBatch.id)
            .where(number >= start_no, number <= end_no, or_(*domain), *filters)
        )
    return db.execute(union_all(*queries)).all()


def occupied_card_numbers(
    db: Session,
    *,
    org_id: int,
    scope_id: int | None,
    start_no: int,
    end_no: int,
    year: int,
    exclude_payment_id: int | None = None,
) -> set[int]:
    """Return numbers protected by live assignments or checkout reservations.

    ``year`` selects the caller's lot, not the uniqueness domain: legacy Member
    numbers are unique per organization across years, and shared scopes also
    protect existing cards belonging to other years. Expiration of a checkout
    hold is deliberately not inferred from the local clock.
    """
    if start_no > end_no:
        return set()
    rows = _occupancy_rows(
        db, org_ids={org_id},
        scope_ids={scope_id} if scope_id is not None else set(),
        start_no=start_no, end_no=end_no, exclude_payment_id=exclude_payment_id,
    )
    return {int(row[3]) for row in rows}


def eligible_card_batches(db: Session, *, org_ids: list[int], year: int) -> list[CardBatch]:
    """Select the same per-organization scope/legacy fallback as allocation."""
    if not org_ids:
        return []
    db.flush()
    rows = db.execute(
        select(CardBatch, Organization.numbering_scope_id)
        .join(Organization, CardBatch.org_id == Organization.id)
        .where(
            CardBatch.org_id.in_(org_ids),
            CardBatch.year == year,
            CardBatch.is_enabled.is_(True),
            CardBatch.released_at.is_(None),
        )
        .order_by(CardBatch.start_no, CardBatch.created_at, CardBatch.id)
        .execution_options(populate_existing=True)
    ).all()
    scoped_orgs = {
        batch.org_id for batch, scope in rows
        if scope is not None and batch.numbering_scope_id == scope
    }
    return [
        batch for batch, scope in rows
        if (
            batch.numbering_scope_id == scope
            if batch.org_id in scoped_orgs
            else batch.numbering_scope_id is None
        )
    ]


def card_batch_availability(db: Session, batches: list[CardBatch]) -> dict[int, CardBatchAvailability]:
    """Bulk snapshot; the query count is independent of the number of lots."""
    if not batches:
        return {}
    rows = _occupancy_rows(
        db, org_ids={b.org_id for b in batches},
        scope_ids={b.numbering_scope_id for b in batches if b.numbering_scope_id is not None},
        start_no=min(b.start_no for b in batches),
        end_no=max(b.end_no for b in batches),
    )
    by_org: dict[int, dict[str, set[int]]] = {}
    by_scope: dict[int, dict[str, set[int]]] = {}
    for org_id, scope_id, linked_scope_id, number, kind in rows:
        by_org.setdefault(org_id, {"assigned": set(), "reserved": set()})[kind].add(number)
        for resolved_scope in {scope_id, linked_scope_id} - {None}:
            by_scope.setdefault(resolved_scope, {"assigned": set(), "reserved": set()})[kind].add(number)
    result = {}
    for batch in batches:
        domain = by_org.get(batch.org_id, {})
        scope_domain = by_scope.get(batch.numbering_scope_id, {})
        assigned = {
            n for n in domain.get("assigned", set()) | scope_domain.get("assigned", set())
            if batch.start_no <= n <= batch.end_no
        }
        reserved = {
            n for n in domain.get("reserved", set()) | scope_domain.get("reserved", set())
            if batch.start_no <= n <= batch.end_no
        }
        occupied = assigned | reserved
        next_no = batch.start_no
        while next_no <= batch.end_no and next_no in occupied:
            next_no += 1
        total = batch.end_no - batch.start_no + 1
        result[batch.id] = CardBatchAvailability(
            total, len(assigned), len(reserved), max(total - len(occupied), 0), next_no
        )
    return result


def batches_with_linked_terms_or_reservations(db: Session, batches: list[CardBatch]) -> set[int]:
    """Protect historical references from edits and live holds from release."""
    if not batches:
        return set()
    batch_ids = [batch.id for batch in batches]
    return set(db.execute(union_all(
        select(AnnualMembershipTerm.batch_id).where(
            AnnualMembershipTerm.batch_id.in_(batch_ids)
        ),
        select(MembershipPayment.reserved_batch_id).where(
            MembershipPayment.reserved_batch_id.in_(batch_ids),
            MembershipPayment.reservation_state == "held",
        ),
    )).scalars())


def batch_has_linked_terms_or_reservations(db: Session, batch: CardBatch) -> bool:
    return batch.id in batches_with_linked_terms_or_reservations(db, [batch])


def card_lot_status(batch: CardBatch, availability: CardBatchAvailability) -> str:
    if batch.released_at is not None:
        return "Rilasciato"
    if batch.is_enabled is not None and not bool(batch.is_enabled):
        return "Disattivo"
    return "Attivo" if availability.remaining else "Esaurito"
