from __future__ import annotations

import hashlib
import hmac
import json
from collections import defaultdict
from datetime import date, datetime, time, timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    AnnualCardDeactivationRun,
    AnnualMembershipTerm,
    AnnualMembershipTermStatus,
    Member,
    MemberStatus,
    MembershipType,
    Organization,
)


ROME_TIMEZONE = ZoneInfo("Europe/Rome")
_INACTIVE_TERM_STATUSES = {
    AnnualMembershipTermStatus.EXPIRED.value,
    AnnualMembershipTermStatus.CANCELLED.value,
}


class AnnualDeactivationNotAllowedError(ValueError):
    pass


class AnnualDeactivationPreviewChangedError(ValueError):
    pass


def annual_membership_valid_through(membership_year: int) -> date:
    """Return the inclusive last day for an annual card.

    A 2026 annual card therefore remains valid for the whole of 01/01/2027.
    """

    parsed_year = int(membership_year)
    if parsed_year < 1900 or parsed_year > 9998:
        raise ValueError("Invalid membership year")
    return date(parsed_year + 1, 1, 1)


def annual_membership_expiry_datetime(membership_year: int) -> datetime:
    return datetime.combine(
        annual_membership_valid_through(membership_year),
        time.max,
        tzinfo=ROME_TIMEZONE,
    )


def as_rome_datetime(value: datetime | None = None) -> datetime:
    if value is None:
        return datetime.now(ROME_TIMEZONE)
    if value.tzinfo is None:
        # Application timestamps historically use naive UTC. Preserve that
        # convention at the boundary and only then apply the Rome calendar.
        return value.replace(tzinfo=timezone.utc).astimezone(ROME_TIMEZONE)
    return value.astimezone(ROME_TIMEZONE)


def _as_utc_datetime(value: datetime | None = None) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _status_value(value: object) -> str:
    if isinstance(value, MemberStatus):
        return value.value
    return str(value or "").strip().lower()


def _membership_type_value(value: object) -> str:
    if isinstance(value, MembershipType):
        return value.value
    return str(value or MembershipType.ANNUAL.value).strip().lower()


def _term_status_for_member(
    member: Member,
    *,
    membership_year: int,
    now: datetime | None = None,
) -> str:
    local_today = as_rome_datetime(now).date()
    if getattr(member, "deleted_at", None) is not None:
        return AnnualMembershipTermStatus.EXPIRED.value
    member_status = _status_value(getattr(member, "status", None))
    if member_status == MemberStatus.EXPIRED.value:
        return AnnualMembershipTermStatus.EXPIRED.value
    if member_status == MemberStatus.REJECTED.value:
        return AnnualMembershipTermStatus.CANCELLED.value
    if local_today > annual_membership_valid_through(membership_year):
        return AnnualMembershipTermStatus.EXPIRED.value
    if member_status != MemberStatus.ACTIVE.value:
        return AnnualMembershipTermStatus.DUE.value
    if membership_year > local_today.year:
        return AnnualMembershipTermStatus.SCHEDULED.value
    return AnnualMembershipTermStatus.ACTIVE.value


def _term_starts_on(member: Member, membership_year: int) -> date:
    candidate = getattr(member, "valid_from", None) or getattr(member, "joined_at", None)
    if isinstance(candidate, datetime) and candidate.year == membership_year:
        return candidate.date()
    if isinstance(candidate, date) and candidate.year == membership_year:
        return candidate
    return date(membership_year, 1, 1)


def sync_annual_membership_term(
    db: Session,
    member: Member,
    *,
    source: str | None = None,
    now: datetime | None = None,
) -> AnnualMembershipTerm | None:
    """Dual-write the issued annual card without changing the legacy member row."""

    if _membership_type_value(getattr(member, "membership_type", None)) == MembershipType.TEMPORARY.value:
        return None
    if getattr(member, "card_no", None) is None or getattr(member, "card_year", None) is None:
        return None

    membership_year = int(member.card_year)
    if member.id is None:
        db.flush()

    term = (
        db.query(AnnualMembershipTerm)
        .filter(
            AnnualMembershipTerm.member_id == member.id,
            AnnualMembershipTerm.membership_year == membership_year,
        )
        .first()
    )
    calculated_status = _term_status_for_member(
        member,
        membership_year=membership_year,
        now=now,
    )
    issued_at = (
        getattr(member, "card_email_sent_at", None)
        or getattr(member, "valid_from", None)
        or getattr(member, "joined_at", None)
        or _as_utc_datetime(now)
    )
    organization = getattr(member, "organization", None)
    currency = getattr(organization, "membership_fee_currency", None)
    if not currency:
        currency = (
            db.query(Organization.membership_fee_currency)
            .filter(Organization.id == member.org_id)
            .scalar()
        )
    currency = str(currency or "EUR").strip().upper() or "EUR"

    if term is None:
        term = AnnualMembershipTerm(
            member_id=member.id,
            org_id=member.org_id,
            membership_year=membership_year,
            starts_on=_term_starts_on(member, membership_year),
            valid_through=annual_membership_valid_through(membership_year),
            status=calculated_status,
            fee_amount=getattr(member, "membership_fee_snapshot", None),
            currency=currency,
            card_no=int(member.card_no),
            card_year=membership_year,
            batch_id=getattr(member, "batch_id", None),
            numbering_scope_id=getattr(member, "numbering_scope_id", None),
            issued_at=issued_at,
            activated_at=(
                issued_at
                if calculated_status == AnnualMembershipTermStatus.ACTIVE.value
                else None
            ),
            deactivated_at=(
                getattr(member, "expired_at", None)
                if calculated_status == AnnualMembershipTermStatus.EXPIRED.value
                else None
            ),
            source=source or getattr(member, "signup_source", None),
        )
        db.add(term)
        return term

    term.org_id = member.org_id
    term.card_no = int(member.card_no)
    term.card_year = membership_year
    term.batch_id = getattr(member, "batch_id", None)
    term.numbering_scope_id = getattr(member, "numbering_scope_id", None)
    term.fee_amount = getattr(member, "membership_fee_snapshot", None)
    term.currency = currency
    if source:
        term.source = source
    elif not term.source:
        term.source = getattr(member, "signup_source", None)
    # An unrelated member update must never resurrect an expired/cancelled term.
    if term.status not in _INACTIVE_TERM_STATUSES:
        term.status = calculated_status
        if calculated_status == AnnualMembershipTermStatus.ACTIVE.value and term.activated_at is None:
            term.activated_at = issued_at
    return term


def cancel_current_annual_membership_term(
    db: Session,
    member: Member,
    *,
    now: datetime | None = None,
) -> AnnualMembershipTerm | None:
    if member.id is None or getattr(member, "card_year", None) is None:
        return None
    term = (
        db.query(AnnualMembershipTerm)
        .filter(
            AnnualMembershipTerm.member_id == member.id,
            AnnualMembershipTerm.membership_year == int(member.card_year),
        )
        .first()
    )
    if term is None:
        return None
    term.status = AnnualMembershipTermStatus.CANCELLED.value
    term.deactivated_at = term.deactivated_at or _as_utc_datetime(now)
    return term


def reactivate_current_annual_membership_term(
    db: Session,
    member: Member,
    *,
    now: datetime | None = None,
) -> AnnualMembershipTerm | None:
    """Reactivate a cancelled current term only after an explicit approval/type change."""

    if (
        member.id is None
        or getattr(member, "card_year", None) is None
        or getattr(member, "card_no", None) is None
        or getattr(member, "deleted_at", None) is not None
        or _status_value(getattr(member, "status", None)) != MemberStatus.ACTIVE.value
        or _membership_type_value(getattr(member, "membership_type", None))
        != MembershipType.ANNUAL.value
    ):
        return None
    term = (
        db.query(AnnualMembershipTerm)
        .filter(
            AnnualMembershipTerm.member_id == member.id,
            AnnualMembershipTerm.card_year == int(member.card_year),
            AnnualMembershipTerm.card_no == int(member.card_no),
        )
        .order_by(AnnualMembershipTerm.id.desc())
        .first()
    )
    if term is None:
        return sync_annual_membership_term(db, member, source="explicit_reactivation", now=now)
    calculated_status = _term_status_for_member(
        member,
        membership_year=int(term.membership_year),
        now=now,
    )
    if calculated_status not in {
        AnnualMembershipTermStatus.ACTIVE.value,
        AnnualMembershipTermStatus.SCHEDULED.value,
    }:
        return term
    term.status = calculated_status
    term.deactivated_at = None
    if calculated_status == AnnualMembershipTermStatus.ACTIVE.value:
        term.activated_at = term.activated_at or _as_utc_datetime(now)
    return term


def _candidate_query(db: Session, membership_year: int):
    return (
        db.query(AnnualMembershipTerm, Organization.name)
        .join(Organization, Organization.id == AnnualMembershipTerm.org_id)
        .filter(
            AnnualMembershipTerm.membership_year == membership_year,
            AnnualMembershipTerm.card_year == membership_year,
            AnnualMembershipTerm.status.notin_(_INACTIVE_TERM_STATUSES),
        )
        .order_by(AnnualMembershipTerm.org_id.asc(), AnnualMembershipTerm.id.asc())
    )


def _preview_digest(snapshot: dict[str, Any]) -> str:
    encoded = json.dumps(
        snapshot,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        b"annual-deactivation-preview-v1\x00" + encoded,
        hashlib.sha256,
    ).hexdigest()


def build_annual_deactivation_preview(
    db: Session,
    *,
    membership_year: int,
    now: datetime | None = None,
) -> dict[str, Any]:
    parsed_year = int(membership_year)
    valid_through = annual_membership_valid_through(parsed_year)
    local_now = as_rome_datetime(now)
    rows = _candidate_query(db, parsed_year).all()

    organization_counts: dict[int, dict[str, Any]] = defaultdict(dict)
    term_snapshot: list[dict[str, Any]] = []
    term_ids: list[int] = []
    for term, organization_name in rows:
        term_ids.append(term.id)
        term_snapshot.append(
            {
                "id": term.id,
                "org_id": term.org_id,
                "card_no": term.card_no,
                "card_year": term.card_year,
                "status": term.status,
                "valid_through": term.valid_through.isoformat(),
                "updated_at": term.updated_at.isoformat() if term.updated_at else None,
            }
        )
        bucket = organization_counts[term.org_id]
        bucket["org_id"] = term.org_id
        bucket["organization_name"] = organization_name
        bucket["count"] = int(bucket.get("count", 0)) + 1

    digest_payload = {
        "membership_year": parsed_year,
        "valid_through": valid_through.isoformat(),
        "terms": term_snapshot,
    }
    return {
        "membership_year": parsed_year,
        "valid_through": valid_through.isoformat(),
        "deactivates_at": datetime.combine(
            valid_through,
            time.max,
            tzinfo=ROME_TIMEZONE,
        ).isoformat(),
        "can_execute": local_now.date() > valid_through,
        "total_count": len(term_ids),
        "organizations": list(organization_counts.values()),
        "preview_hash": _preview_digest(digest_payload),
        "term_ids": term_ids,
    }


def execute_annual_deactivation(
    db: Session,
    *,
    membership_year: int,
    preview_hash: str,
    actor_admin_id: int | None,
    now: datetime | None = None,
) -> dict[str, Any]:
    parsed_year = int(membership_year)
    if db.get_bind().dialect.name == "postgresql":
        db.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:resource_name))"),
            {"resource_name": f"annual-card-deactivation:{parsed_year}"},
        )
    existing_run = (
        db.query(AnnualCardDeactivationRun)
        .filter(AnnualCardDeactivationRun.preview_hash == preview_hash)
        .first()
    )
    if existing_run is not None:
        if existing_run.membership_year != parsed_year:
            raise AnnualDeactivationPreviewChangedError("Preview year mismatch")
        return {
            "membership_year": parsed_year,
            "valid_through": existing_run.valid_through.isoformat(),
            "deactivated_count": existing_run.deactivated_count,
            "term_ids": list(existing_run.term_ids_json or []),
            "executed_at": existing_run.executed_at.isoformat(),
            "already_executed": True,
            "run_id": existing_run.id,
        }

    valid_through = annual_membership_valid_through(parsed_year)
    local_now = as_rome_datetime(now)
    if local_now.date() <= valid_through:
        raise AnnualDeactivationNotAllowedError(
            f"Annual cards for {parsed_year} remain valid through {valid_through.isoformat()}"
        )

    preview = build_annual_deactivation_preview(
        db,
        membership_year=parsed_year,
        now=now,
    )
    if not hmac.compare_digest(preview["preview_hash"], preview_hash):
        raise AnnualDeactivationPreviewChangedError(
            "Annual card data changed after preview; generate a new preview"
        )

    term_ids = list(preview["term_ids"])
    terms: list[AnnualMembershipTerm] = []
    if term_ids:
        terms = (
            db.query(AnnualMembershipTerm)
            .filter(AnnualMembershipTerm.id.in_(term_ids))
            .order_by(AnnualMembershipTerm.id.asc())
            .with_for_update()
            .all()
        )

    executed_at = _as_utc_datetime(now)
    for term in terms:
        term.status = AnnualMembershipTermStatus.EXPIRED.value
        term.deactivated_at = term.deactivated_at or executed_at

    run = AnnualCardDeactivationRun(
        membership_year=parsed_year,
        valid_through=valid_through,
        preview_hash=preview_hash,
        deactivated_count=len(terms),
        term_ids_json=term_ids,
        actor_admin_id=actor_admin_id,
        executed_at=executed_at,
    )
    db.add(run)
    db.flush()
    return {
        "membership_year": parsed_year,
        "valid_through": valid_through.isoformat(),
        "deactivated_count": len(terms),
        "term_ids": term_ids,
        "executed_at": executed_at.isoformat(),
        "already_executed": False,
        "run_id": run.id,
    }
