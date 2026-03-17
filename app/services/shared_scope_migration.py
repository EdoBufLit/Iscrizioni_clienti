from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from app.models import CardBatch, Member, Organization
from app.services.numbering_scopes import (
    ASSONAM_CENTRAL_SCOPE_NAME,
    ensure_assonam_central_scope,
    get_assonam_central_scope,
)


@dataclass(frozen=True)
class SharedScopeAllowlistEntry:
    org_id: int
    slug: str | None = None
    name: str | None = None
    approved_by: str | None = None
    note: str | None = None


def _batch_next_candidate(batch: CardBatch) -> int:
    baseline = batch.next_no if batch.next_no is not None else batch.start_no
    return batch.start_no if baseline < batch.start_no else baseline


def _batch_manual_enabled(batch: CardBatch) -> bool:
    value = batch.is_enabled
    if value is None:
        return True
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value != 0
    return bool(value)


def _batch_is_assignable(batch: CardBatch) -> bool:
    return (
        batch.released_at is None
        and _batch_manual_enabled(batch)
        and _batch_next_candidate(batch) <= batch.end_no
    )


def _ranges_overlap(
    start_a: int,
    end_a: int,
    start_b: int,
    end_b: int,
) -> bool:
    return start_a <= end_b and start_b <= end_a


def _normalize_entry(entry: dict[str, Any]) -> SharedScopeAllowlistEntry:
    try:
        org_id = int(entry["org_id"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"Invalid allowlist entry: {entry!r}") from exc

    return SharedScopeAllowlistEntry(
        org_id=org_id,
        slug=str(entry["slug"]).strip() or None if entry.get("slug") is not None else None,
        name=str(entry["name"]).strip() or None if entry.get("name") is not None else None,
        approved_by=(
            str(entry["approved_by"]).strip() or None
            if entry.get("approved_by") is not None
            else None
        ),
        note=str(entry["note"]).strip() or None if entry.get("note") is not None else None,
    )


def normalize_allowlist_entries(
    entries: list[dict[str, Any]] | list[SharedScopeAllowlistEntry],
) -> list[SharedScopeAllowlistEntry]:
    normalized: list[SharedScopeAllowlistEntry] = []
    seen_ids: set[int] = set()
    for raw_entry in entries:
        entry = (
            raw_entry
            if isinstance(raw_entry, SharedScopeAllowlistEntry)
            else _normalize_entry(raw_entry)
        )
        if entry.org_id in seen_ids:
            continue
        seen_ids.add(entry.org_id)
        normalized.append(entry)
    return normalized


def _serialize_allowlist_entry(entry: SharedScopeAllowlistEntry) -> dict[str, Any]:
    return {
        "org_id": entry.org_id,
        "slug": entry.slug,
        "name": entry.name,
        "approved_by": entry.approved_by,
        "note": entry.note,
    }


def _batch_member_stats(db: Session, batch: CardBatch) -> dict[str, Any]:
    range_filter = and_(
        Member.deleted_at.is_(None),
        Member.org_id == batch.org_id,
        Member.card_year == batch.year,
        Member.card_no.isnot(None),
        Member.card_no >= batch.start_no,
        Member.card_no <= batch.end_no,
    )

    range_rows = (
        db.query(Member.id, Member.card_no)
        .filter(range_filter)
        .order_by(Member.id.asc())
        .all()
    )
    linked_rows = (
        db.query(Member.id, Member.card_no)
        .filter(
            Member.deleted_at.is_(None),
            Member.batch_id == batch.id,
        )
        .order_by(Member.id.asc())
        .all()
    )

    range_member_ids = {int(member_id) for member_id, _ in range_rows}
    linked_member_ids = {int(member_id) for member_id, _ in linked_rows}
    range_card_numbers = {
        int(card_no) for _, card_no in range_rows if card_no is not None
    }
    linked_card_numbers = {
        int(card_no) for _, card_no in linked_rows if card_no is not None
    }
    out_of_range_linked_cards = {
        int(card_no)
        for _, card_no in linked_rows
        if card_no is not None and not (batch.start_no <= int(card_no) <= batch.end_no)
    }

    return {
        "member_ids": sorted(range_member_ids | linked_member_ids),
        "range_member_ids": sorted(range_member_ids),
        "linked_member_ids": sorted(linked_member_ids),
        "card_numbers": sorted(range_card_numbers | linked_card_numbers),
        "range_card_numbers": sorted(range_card_numbers),
        "linked_card_numbers": sorted(linked_card_numbers),
        "out_of_range_linked_cards": sorted(out_of_range_linked_cards),
        "members_in_range_count": len(range_member_ids),
        "linked_members_count": len(linked_member_ids),
        "numbered_cards_in_range_count": len(range_card_numbers),
    }


def _serialize_batch_base(batch: CardBatch, stats: dict[str, Any]) -> dict[str, Any]:
    return {
        "batch_id": batch.id,
        "org_id": batch.org_id,
        "numbering_scope_id": batch.numbering_scope_id,
        "year": batch.year,
        "start_no": batch.start_no,
        "end_no": batch.end_no,
        "next_no": batch.next_no,
        "released_at": batch.released_at.isoformat() if batch.released_at else None,
        "is_enabled": _batch_manual_enabled(batch),
        "assignable": _batch_is_assignable(batch),
        "members_in_range_count": stats["members_in_range_count"],
        "linked_members_count": stats["linked_members_count"],
        "numbered_cards_in_range_count": stats["numbered_cards_in_range_count"],
        "range_card_numbers": stats["range_card_numbers"],
        "out_of_range_linked_cards": stats["out_of_range_linked_cards"],
    }


def _build_projected_scope_batch_set(
    db: Session,
    *,
    target_scope_id: int,
    moved_batch_ids: set[int],
) -> dict[int, list[CardBatch]]:
    existing_scope_batches = (
        db.query(CardBatch)
        .filter(
            CardBatch.numbering_scope_id == target_scope_id,
            CardBatch.released_at.is_(None),
        )
        .order_by(CardBatch.year.asc(), CardBatch.start_no.asc(), CardBatch.id.asc())
        .all()
    )
    batches_by_year: dict[int, list[CardBatch]] = defaultdict(list)
    for batch in existing_scope_batches:
        batches_by_year[batch.year].append(batch)

    if moved_batch_ids:
        moved_batches = (
            db.query(CardBatch)
            .filter(CardBatch.id.in_(sorted(moved_batch_ids)))
            .order_by(CardBatch.year.asc(), CardBatch.start_no.asc(), CardBatch.id.asc())
            .all()
        )
        for batch in moved_batches:
            batches_by_year[batch.year].append(batch)

    return batches_by_year


def _build_projected_org_scope_batches(
    db: Session,
    *,
    org_id: int,
    target_scope_id: int,
    moved_batch_ids: set[int],
    year: int,
) -> list[CardBatch]:
    org_scope_filter = CardBatch.numbering_scope_id == target_scope_id
    if moved_batch_ids:
        org_scope_filter = or_(
            org_scope_filter,
            CardBatch.id.in_(sorted(moved_batch_ids)),
        )
    batches = (
        db.query(CardBatch)
        .filter(
            CardBatch.org_id == org_id,
            CardBatch.year == year,
            CardBatch.released_at.is_(None),
            org_scope_filter,
        )
        .order_by(CardBatch.start_no.asc(), CardBatch.id.asc())
        .all()
    )
    return batches


def _occupied_numbers_for_projected_scope(
    db: Session,
    *,
    target_scope_id: int,
    moved_batch_ids: set[int],
    start_no: int,
    end_no: int,
) -> set[int]:
    if start_no > end_no:
        return set()

    scope_filter = or_(Member.numbering_scope_id == target_scope_id)
    if moved_batch_ids:
        scope_filter = or_(scope_filter, Member.batch_id.in_(sorted(moved_batch_ids)))

    scope_rows = (
        db.query(Member.card_no)
        .outerjoin(CardBatch, Member.batch_id == CardBatch.id)
        .filter(
            Member.card_no.isnot(None),
            Member.card_no >= start_no,
            Member.card_no <= end_no,
            Member.deleted_at.is_(None),
            or_(
                scope_filter,
                CardBatch.numbering_scope_id == target_scope_id,
            ),
        )
        .all()
    )
    return {int(card_no) for (card_no,) in scope_rows if card_no is not None}


def _occupied_numbers_for_org(
    db: Session,
    *,
    org_id: int,
    start_no: int,
    end_no: int,
) -> set[int]:
    if start_no > end_no:
        return set()
    rows = (
        db.query(Member.card_no)
        .filter(
            Member.org_id == org_id,
            Member.deleted_at.is_(None),
            Member.card_no.isnot(None),
            Member.card_no >= start_no,
            Member.card_no <= end_no,
        )
        .all()
    )
    return {int(card_no) for (card_no,) in rows if card_no is not None}


def _compute_next_from_batches(
    db: Session,
    *,
    org_id: int,
    batches: list[CardBatch],
    scope_id: int | None,
    moved_batch_ids: set[int] | None = None,
) -> dict[str, Any]:
    if not batches:
        return {"card_no": None, "batch_id": None}

    ordered_batches = sorted(
        batches,
        key=lambda batch: (
            _batch_next_candidate(batch),
            batch.start_no,
            batch.created_at or datetime.min,
            batch.id,
        ),
    )
    moved_ids = moved_batch_ids or set()

    for batch in ordered_batches:
        next_candidate = _batch_next_candidate(batch)
        if next_candidate > batch.end_no:
            continue

        occupied_numbers = _occupied_numbers_for_org(
            db,
            org_id=org_id,
            start_no=next_candidate,
            end_no=batch.end_no,
        )
        if scope_id is not None:
            occupied_numbers |= _occupied_numbers_for_projected_scope(
                db,
                target_scope_id=scope_id,
                moved_batch_ids=moved_ids,
                start_no=next_candidate,
                end_no=batch.end_no,
            )

        while next_candidate <= batch.end_no and next_candidate in occupied_numbers:
            next_candidate += 1

        if next_candidate <= batch.end_no:
            return {
                "card_no": next_candidate,
                "batch_id": batch.id,
                "start_no": batch.start_no,
                "end_no": batch.end_no,
            }

    return {"card_no": None, "batch_id": None}


def _current_next_for_org_year(
    db: Session,
    *,
    org: Organization,
    year: int,
) -> dict[str, Any]:
    if org.numbering_scope_id is None:
        batches = (
            db.query(CardBatch)
            .filter(
                CardBatch.org_id == org.id,
                CardBatch.numbering_scope_id.is_(None),
                CardBatch.year == year,
                CardBatch.released_at.is_(None),
                CardBatch.is_enabled.is_(True),
            )
            .all()
        )
        result = _compute_next_from_batches(
            db,
            org_id=org.id,
            batches=batches,
            scope_id=None,
        )
        result["mode"] = "legacy"
        return result

    scoped_batches = (
        db.query(CardBatch)
        .filter(
            CardBatch.org_id == org.id,
            CardBatch.numbering_scope_id == org.numbering_scope_id,
            CardBatch.year == year,
            CardBatch.released_at.is_(None),
            CardBatch.is_enabled.is_(True),
        )
        .all()
    )
    if scoped_batches:
        result = _compute_next_from_batches(
            db,
            org_id=org.id,
            batches=scoped_batches,
            scope_id=org.numbering_scope_id,
        )
        result["mode"] = "scoped"
        return result

    fallback_batches = (
        db.query(CardBatch)
        .filter(
            CardBatch.org_id == org.id,
            CardBatch.numbering_scope_id.is_(None),
            CardBatch.year == year,
            CardBatch.released_at.is_(None),
            CardBatch.is_enabled.is_(True),
        )
        .all()
    )
    result = _compute_next_from_batches(
        db,
        org_id=org.id,
        batches=fallback_batches,
        scope_id=None,
    )
    result["mode"] = "scoped_legacy_fallback"
    return result


def _projected_next_for_org_year(
    db: Session,
    *,
    org: Organization,
    year: int,
    target_scope_id: int,
    moved_batch_ids: set[int],
) -> dict[str, Any]:
    scoped_batches = _build_projected_org_scope_batches(
        db,
        org_id=org.id,
        target_scope_id=target_scope_id,
        moved_batch_ids=moved_batch_ids,
        year=year,
    )
    scoped_batches = [batch for batch in scoped_batches if _batch_is_assignable(batch)]
    if scoped_batches:
        result = _compute_next_from_batches(
            db,
            org_id=org.id,
            batches=scoped_batches,
            scope_id=target_scope_id,
            moved_batch_ids=moved_batch_ids,
        )
        result["mode"] = "scoped"
        return result

    fallback_batches = (
        db.query(CardBatch)
        .filter(
            CardBatch.org_id == org.id,
            CardBatch.numbering_scope_id.is_(None),
            CardBatch.year == year,
            CardBatch.released_at.is_(None),
            CardBatch.is_enabled.is_(True),
            CardBatch.id.notin_(sorted(moved_batch_ids)) if moved_batch_ids else True,
        )
        .all()
    )
    result = _compute_next_from_batches(
        db,
        org_id=org.id,
        batches=fallback_batches,
        scope_id=None,
    )
    result["mode"] = "scoped_legacy_fallback" if fallback_batches else "scoped"
    return result


def _normalize_validation(
    entry: SharedScopeAllowlistEntry,
    org: Organization | None,
) -> dict[str, Any]:
    if org is None:
        return {
            "org_found": False,
            "slug_matches": entry.slug is None,
            "name_matches": entry.name is None,
        }

    return {
        "org_found": True,
        "slug_matches": entry.slug is None or entry.slug == org.slug,
        "name_matches": entry.name is None or entry.name == org.name,
    }


def _batch_conflict_rows(
    existing_rows: list[dict[str, Any]],
    candidate_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    conflicts: list[dict[str, Any]] = []
    for index, current in enumerate(candidate_rows):
        for other in existing_rows:
            if current["batch_id"] == other["batch_id"]:
                continue
            if current["year"] != other["year"]:
                continue
            if not _ranges_overlap(
                current["start_no"],
                current["end_no"],
                other["start_no"],
                other["end_no"],
            ):
                continue
            conflicts.append(
                {
                    "left_batch_id": current["batch_id"],
                    "left_org_id": current["org_id"],
                    "left_scope_id": current["numbering_scope_id"],
                    "right_batch_id": other["batch_id"],
                    "right_org_id": other["org_id"],
                    "right_scope_id": other["numbering_scope_id"],
                    "year": current["year"],
                    "start_no": max(current["start_no"], other["start_no"]),
                    "end_no": min(current["end_no"], other["end_no"]),
                }
            )
        for other in candidate_rows[index + 1 :]:
            if current["batch_id"] == other["batch_id"]:
                continue
            if current["year"] != other["year"]:
                continue
            if not _ranges_overlap(
                current["start_no"],
                current["end_no"],
                other["start_no"],
                other["end_no"],
            ):
                continue
            conflicts.append(
                {
                    "left_batch_id": current["batch_id"],
                    "left_org_id": current["org_id"],
                    "left_scope_id": current["numbering_scope_id"],
                    "right_batch_id": other["batch_id"],
                    "right_org_id": other["org_id"],
                    "right_scope_id": other["numbering_scope_id"],
                    "year": current["year"],
                    "start_no": max(current["start_no"], other["start_no"]),
                    "end_no": min(current["end_no"], other["end_no"]),
                }
            )
    return conflicts


def run_shared_scope_migration(
    db: Session,
    *,
    allowlist_entries: list[dict[str, Any]] | list[SharedScopeAllowlistEntry],
    apply: bool = False,
    org_id: int | None = None,
    fail_on_ambiguous: bool = False,
) -> dict[str, Any]:
    entries = normalize_allowlist_entries(allowlist_entries)
    if org_id is not None:
        entries = [entry for entry in entries if entry.org_id == org_id]
    if not entries:
        raise ValueError("Allowlist vuota dopo il filtro applicato.")

    target_scope = (
        ensure_assonam_central_scope(db) if apply else get_assonam_central_scope(db)
    )
    scope_missing = target_scope is None
    target_scope_id = target_scope.id if target_scope is not None else None

    org_ids = [entry.org_id for entry in entries]
    orgs = (
        db.query(Organization)
        .options(joinedload(Organization.numbering_scope))
        .filter(Organization.id.in_(org_ids))
        .all()
    )
    org_by_id = {org.id: org for org in orgs}

    all_batches = (
        db.query(CardBatch)
        .filter(CardBatch.org_id.in_(org_ids))
        .order_by(CardBatch.org_id.asc(), CardBatch.year.asc(), CardBatch.start_no.asc())
        .all()
    )
    batches_by_org: dict[int, list[CardBatch]] = defaultdict(list)
    batch_stats: dict[int, dict[str, Any]] = {}
    for batch in all_batches:
        batches_by_org[batch.org_id].append(batch)
        batch_stats[batch.id] = _batch_member_stats(db, batch)

    existing_scope_batches = []
    if target_scope_id is not None:
        for batch in (
            db.query(CardBatch)
            .filter(
                CardBatch.numbering_scope_id == target_scope_id,
                CardBatch.released_at.is_(None),
            )
            .order_by(CardBatch.year.asc(), CardBatch.start_no.asc(), CardBatch.id.asc())
            .all()
        ):
            existing_scope_batches.append(
                {
                    "batch_id": batch.id,
                    "org_id": batch.org_id,
                    "numbering_scope_id": batch.numbering_scope_id,
                    "year": batch.year,
                    "start_no": batch.start_no,
                    "end_no": batch.end_no,
                }
            )

    candidate_batches: list[dict[str, Any]] = []
    released_sensitive_batches: list[dict[str, Any]] = []
    ambiguous_batches: list[dict[str, Any]] = []
    skipped_orgs: list[dict[str, Any]] = []
    selected_orgs: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    projected_behavior_checks: list[dict[str, Any]] = []

    preliminary_move_ids: set[int] = set()
    org_years: dict[int, set[int]] = defaultdict(set)

    for entry in entries:
        org = org_by_id.get(entry.org_id)
        validation = _normalize_validation(entry, org)
        if org is None:
            skipped_orgs.append(
                {
                    "allowlist": _serialize_allowlist_entry(entry),
                    "reason": "organization_not_found",
                    "validation": validation,
                }
            )
            continue

        org_batches = batches_by_org.get(org.id, [])
        members_with_card_no = (
            db.query(Member)
            .filter(
                Member.org_id == org.id,
                Member.deleted_at.is_(None),
                Member.card_no.isnot(None),
            )
            .count()
        )

        org_payload = {
            "allowlist": _serialize_allowlist_entry(entry),
            "org_id": org.id,
            "org_name": org.name,
            "org_slug": org.slug,
            "current_numbering_scope_id": org.numbering_scope_id,
            "current_numbering_scope_name": getattr(org.numbering_scope, "name", None),
            "members_with_card_no": int(members_with_card_no),
            "validation": validation,
            "batch_ids": [batch.id for batch in org_batches],
        }
        selected_orgs.append(org_payload)

        for batch in org_batches:
            org_years[org.id].add(batch.year)
            stats = batch_stats[batch.id]
            reasons: list[str] = []
            classification = "legacy_inactive_candidate"
            apply_candidate = False
            apply_eligible = False
            blocks_auto_apply = False

            if batch.numbering_scope_id == target_scope_id and target_scope_id is not None:
                classification = "already_scoped"
            elif batch.numbering_scope_id is not None:
                classification = "ambiguous"
                reasons.append("batch_already_attached_to_other_scope")
                blocks_auto_apply = True
            elif stats["out_of_range_linked_cards"]:
                classification = "ambiguous"
                reasons.append("linked_member_card_out_of_batch_range")
                blocks_auto_apply = True
            elif batch.released_at is not None:
                classification = "released_sensitive"
                reasons.append("released_batches_are_report_only")
            elif _batch_is_assignable(batch):
                classification = "legacy_active_candidate"
                reasons.append("assignable_unreleased_batch")
                apply_candidate = True
                apply_eligible = True
            elif stats["members_in_range_count"] > 0 or stats["linked_members_count"] > 0:
                classification = "legacy_inactive_candidate"
                reasons.append("historical_occupancy_needs_batch_scope_context")
                apply_candidate = True
                apply_eligible = True
            else:
                classification = "legacy_inactive_candidate"
                reasons.append("inactive_unreleased_batch_not_needed_for_behavior")

            row = {
                **_serialize_batch_base(batch, stats),
                "classification": classification,
                "reasons": reasons,
                "apply_candidate": apply_candidate,
                "apply_eligible": apply_eligible,
                "blocks_auto_apply": blocks_auto_apply,
                "reported_only": classification == "released_sensitive",
            }
            if classification == "released_sensitive":
                released_sensitive_batches.append(row)
            elif classification == "ambiguous":
                ambiguous_batches.append(row)
            elif classification in {"legacy_active_candidate", "legacy_inactive_candidate"}:
                candidate_batches.append(row)
            if apply_candidate:
                preliminary_move_ids.add(batch.id)

    candidate_rows_for_conflicts = [
        row
        for row in candidate_batches
        if row["apply_candidate"] and row["apply_eligible"]
    ]
    conflicts = _batch_conflict_rows(existing_scope_batches, candidate_rows_for_conflicts)
    conflicted_batch_ids = {
        conflict["left_batch_id"]
        for conflict in conflicts
        if conflict["left_batch_id"] in preliminary_move_ids
    } | {
        conflict["right_batch_id"]
        for conflict in conflicts
        if conflict["right_batch_id"] in preliminary_move_ids
    }

    if conflicted_batch_ids:
        still_candidates: list[dict[str, Any]] = []
        for row in candidate_batches:
            if row["batch_id"] not in conflicted_batch_ids:
                still_candidates.append(row)
                continue
            updated_row = dict(row)
            updated_row["classification"] = "ambiguous"
            updated_row["apply_candidate"] = False
            updated_row["apply_eligible"] = False
            updated_row["blocks_auto_apply"] = True
            updated_row["reasons"] = list(updated_row["reasons"]) + ["scope_overlap_conflict"]
            ambiguous_batches.append(updated_row)
        candidate_batches = still_candidates
        preliminary_move_ids -= conflicted_batch_ids

    moved_batch_ids = {
        row["batch_id"] for row in candidate_batches if row["apply_eligible"]
    }
    projected_active_ranges_by_org_year: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    if target_scope_id is not None:
        for org_payload in selected_orgs:
            org_obj = org_by_id.get(org_payload["org_id"])
            if org_obj is None:
                continue
            for year in sorted(org_years.get(org_obj.id) or {datetime.utcnow().year}):
                projected_batches = _build_projected_org_scope_batches(
                    db,
                    org_id=org_obj.id,
                    target_scope_id=target_scope_id,
                    moved_batch_ids={
                        row["batch_id"]
                        for row in candidate_batches
                        if row["apply_eligible"] and row["org_id"] == org_obj.id
                    },
                    year=year,
                )
                for batch in projected_batches:
                    if _batch_is_assignable(batch):
                        projected_active_ranges_by_org_year[(org_obj.id, year)].append(
                            (batch.start_no, batch.end_no)
                        )

    updated_released_rows: list[dict[str, Any]] = []
    blocking_released_batch_ids: set[int] = set()
    for row in released_sensitive_batches:
        stats = batch_stats[row["batch_id"]]
        projected_ranges = projected_active_ranges_by_org_year.get(
            (row["org_id"], row["year"]),
            [],
        )
        overlaps_projected_active = any(
            _ranges_overlap(row["start_no"], row["end_no"], start_no, end_no)
            for start_no, end_no in projected_ranges
        )
        updated_row = dict(row)
        if overlaps_projected_active and stats["range_card_numbers"]:
            updated_row["blocks_auto_apply"] = True
            updated_row["reasons"] = list(updated_row["reasons"]) + [
                "released_batch_cards_overlap_projected_active_shared_domain"
            ]
            blocking_released_batch_ids.add(updated_row["batch_id"])
        else:
            updated_row["reasons"] = list(updated_row["reasons"]) + [
                "reported_for_historical_shared_pool_reconstruction"
            ]
        updated_released_rows.append(updated_row)
    released_sensitive_batches = updated_released_rows

    migrated_orgs: list[dict[str, Any]] = []
    migrated_batches: list[dict[str, Any]] = []
    safe_org_ids: set[int] = set()

    for org_payload in selected_orgs:
        org = org_by_id[org_payload["org_id"]]
        org_batch_ids = set(org_payload["batch_ids"])
        org_reasons: list[str] = []
        if scope_missing:
            org_reasons.append("target_scope_missing")
        if not org_payload["validation"]["slug_matches"]:
            org_reasons.append("allowlist_slug_mismatch")
        if not org_payload["validation"]["name_matches"]:
            org_reasons.append("allowlist_name_mismatch")
        if any(
            row["batch_id"] in org_batch_ids and row["blocks_auto_apply"]
            for row in ambiguous_batches
        ):
            org_reasons.append("ambiguous_legacy_batches_present")
        if any(batch_id in org_batch_ids for batch_id in blocking_released_batch_ids):
            org_reasons.append("released_sensitive_batches_require_manual_review")

        years = sorted(org_years.get(org.id) or {datetime.utcnow().year})
        org_checks: list[dict[str, Any]] = []
        for year in years:
            current_next = _current_next_for_org_year(db, org=org, year=year)
            projected_next = (
                _projected_next_for_org_year(
                    db,
                    org=org,
                    year=year,
                    target_scope_id=target_scope_id,
                    moved_batch_ids=moved_batch_ids,
                )
                if target_scope_id is not None
                else {"card_no": None, "batch_id": None, "mode": "target_scope_missing"}
            )
            identical = (
                current_next.get("card_no") == projected_next.get("card_no")
                and current_next.get("batch_id") == projected_next.get("batch_id")
            )
            org_checks.append(
                {
                    "org_id": org.id,
                    "year": year,
                    "current_next": current_next,
                    "projected_next": projected_next,
                    "behavior_identical": identical,
                }
            )
            if not identical:
                org_reasons.append(f"projected_behavior_diff_year_{year}")

        projected_behavior_checks.extend(org_checks)

        safe_to_apply = len(org_reasons) == 0
        org_payload["safe_to_apply"] = safe_to_apply
        org_payload["reasons"] = sorted(set(org_reasons))
        org_payload["projected_behavior_checks"] = org_checks
        org_payload["candidate_batch_ids"] = sorted(
            row["batch_id"]
            for row in candidate_batches
            if row["batch_id"] in org_batch_ids and row["apply_eligible"]
        )
        org_payload["released_sensitive_batch_ids"] = sorted(
            row["batch_id"]
            for row in released_sensitive_batches
            if row["batch_id"] in org_batch_ids
        )

        if safe_to_apply:
            safe_org_ids.add(org.id)

    if apply and target_scope_id is not None:
        if fail_on_ambiguous and (ambiguous_batches or blocking_released_batch_ids or scope_missing):
            raise RuntimeError("Dry-run non sicuro: presenti batch ambigui o sensibili.")

        for org_payload in selected_orgs:
            if not org_payload["safe_to_apply"]:
                continue
            org = org_by_id[org_payload["org_id"]]
            if org.numbering_scope_id != target_scope_id:
                org.numbering_scope_id = target_scope_id
                migrated_orgs.append(
                    {
                        "org_id": org.id,
                        "org_name": org.name,
                        "new_scope_id": target_scope_id,
                        "new_scope_name": ASSONAM_CENTRAL_SCOPE_NAME,
                    }
                )
            for row in candidate_batches:
                if row["batch_id"] not in org_payload["candidate_batch_ids"]:
                    continue
                batch = next(
                    batch for batch in batches_by_org[org.id] if batch.id == row["batch_id"]
                )
                if batch.numbering_scope_id == target_scope_id:
                    continue
                batch.numbering_scope_id = target_scope_id
                migrated_batches.append(
                    {
                        "batch_id": batch.id,
                        "org_id": batch.org_id,
                        "year": batch.year,
                        "start_no": batch.start_no,
                        "end_no": batch.end_no,
                        "new_scope_id": target_scope_id,
                        "new_scope_name": ASSONAM_CENTRAL_SCOPE_NAME,
                    }
                )
        db.commit()
    elif apply:
        db.rollback()
        raise RuntimeError("Scope ASSONAM_CENTRAL mancante e non creabile.")

    report = {
        "mode": "apply" if apply else "dry-run",
        "target_scope": {
            "id": target_scope_id,
            "name": getattr(target_scope, "name", ASSONAM_CENTRAL_SCOPE_NAME),
            "exists": target_scope is not None,
        },
        "selected_orgs": selected_orgs,
        "skipped_orgs": skipped_orgs,
        "candidate_batches": candidate_batches,
        "migrated_orgs": migrated_orgs,
        "migrated_batches": migrated_batches,
        "released_sensitive_batches": released_sensitive_batches,
        "ambiguous_batches": ambiguous_batches,
        "conflicts": conflicts,
        "projected_behavior_checks": projected_behavior_checks,
        "summary": {
            "selected_org_count": len(selected_orgs),
            "skipped_org_count": len(skipped_orgs),
            "safe_to_apply_org_count": len(safe_org_ids),
            "candidate_batch_count": len(candidate_batches),
            "released_sensitive_batch_count": len(released_sensitive_batches),
            "ambiguous_batch_count": len(ambiguous_batches),
            "conflict_count": len(conflicts),
            "migrated_org_count": len(migrated_orgs),
            "migrated_batch_count": len(migrated_batches),
            "scope_missing": scope_missing,
        },
    }
    return report
