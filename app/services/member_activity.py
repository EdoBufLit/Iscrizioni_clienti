from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import and_, or_
from sqlalchemy.sql.elements import ColumnElement

from app.models import Member, MemberStatus
from app.services.annual_memberships import as_rome_datetime
from app.services.member_membership import is_member_membership_expired

MEMBER_INACTIVE_REASON_DELETED = "deleted"
MEMBER_INACTIVE_REASON_EXPIRED = "expired"
MEMBER_INACTIVE_REASON_NOT_APPROVED = "not_approved"
MEMBER_STATUS_ACTIVE = "ACTIVE"
MEMBER_STATUS_EXPIRED = "EXPIRED"
MEMBER_STATUS_DELETED = "DELETED"
MEMBER_STATUS_PENDING = "PENDING"

_INACTIVE_REASON_LABELS = {
    MEMBER_INACTIVE_REASON_DELETED: "Eliminata",
    MEMBER_INACTIVE_REASON_EXPIRED: "Scaduta",
    MEMBER_INACTIVE_REASON_NOT_APPROVED: "Non approvata",
}


def _normalize_member_status(status: object) -> str:
    if isinstance(status, MemberStatus):
        return status.value
    if status is None:
        return ""
    return str(status).strip().lower()


def get_member_inactive_reason(member: Member | None, now: datetime | None = None) -> str:
    current_time = now or datetime.utcnow()
    if member is None:
        return MEMBER_INACTIVE_REASON_DELETED

    member_deleted_at = getattr(member, "deleted_at", None)
    member_expired_at = getattr(member, "expired_at", None)
    member_status = getattr(member, "status", None)
    member_card_no = getattr(member, "card_no", None)
    member_card_year = getattr(member, "card_year", None)

    if member_deleted_at is not None:
        if member_expired_at is not None:
            return MEMBER_INACTIVE_REASON_EXPIRED
        return MEMBER_INACTIVE_REASON_DELETED

    normalized_status = _normalize_member_status(member_status)
    if normalized_status == MemberStatus.EXPIRED.value:
        return MEMBER_INACTIVE_REASON_EXPIRED

    if normalized_status != MemberStatus.ACTIVE.value:
        return MEMBER_INACTIVE_REASON_NOT_APPROVED

    if member_card_no is None:
        return MEMBER_INACTIVE_REASON_NOT_APPROVED

    if member_card_year is None:
        return MEMBER_INACTIVE_REASON_NOT_APPROVED

    if is_member_membership_expired(member, now=current_time):
        return MEMBER_INACTIVE_REASON_EXPIRED

    return ""


def is_member_active(member: Member | None, now: datetime | None = None) -> bool:
    return get_member_inactive_reason(member, now=now) == ""


def is_card_active(member: Member | None, now: datetime | None = None) -> bool:
    return is_member_active(member, now=now)


def get_member_lifecycle_status(member: Member | None, now: datetime | None = None) -> str:
    inactive_reason = get_member_inactive_reason(member, now=now)
    if inactive_reason == MEMBER_INACTIVE_REASON_DELETED:
        return MEMBER_STATUS_DELETED
    if inactive_reason == MEMBER_INACTIVE_REASON_EXPIRED:
        return MEMBER_STATUS_EXPIRED
    if inactive_reason == MEMBER_INACTIVE_REASON_NOT_APPROVED:
        return MEMBER_STATUS_PENDING
    return MEMBER_STATUS_ACTIVE


def member_inactive_reason_label(reason: str) -> str:
    return _INACTIVE_REASON_LABELS.get(reason, _INACTIVE_REASON_LABELS[MEMBER_INACTIVE_REASON_NOT_APPROVED])


def member_active_filters(now: datetime | None = None) -> tuple[ColumnElement[bool], ...]:
    current_time = now or datetime.utcnow()
    local_today = as_rome_datetime(current_time).date()
    database_current_time = (
        current_time
        if current_time.tzinfo is None
        else current_time.astimezone(timezone.utc).replace(tzinfo=None)
    )
    minimum_annual_year = (
        local_today.year - 1
        if (local_today.month, local_today.day) == (1, 1)
        else local_today.year
    )
    return (
        Member.deleted_at.is_(None),
        Member.status == MemberStatus.ACTIVE,
        Member.card_no.isnot(None),
        Member.card_year.isnot(None),
        or_(
            and_(
                Member.valid_until.isnot(None),
                Member.valid_until >= database_current_time,
            ),
            and_(Member.valid_until.is_(None), Member.card_year >= minimum_annual_year),
        ),
    )


def member_expired_filters(now: datetime | None = None) -> tuple[ColumnElement[bool], ...]:
    current_time = now or datetime.utcnow()
    local_today = as_rome_datetime(current_time).date()
    database_current_time = (
        current_time
        if current_time.tzinfo is None
        else current_time.astimezone(timezone.utc).replace(tzinfo=None)
    )
    minimum_annual_year = (
        local_today.year - 1
        if (local_today.month, local_today.day) == (1, 1)
        else local_today.year
    )
    return (
        Member.deleted_at.is_(None),
        Member.card_no.isnot(None),
        Member.card_year.isnot(None),
        or_(
            Member.status == MemberStatus.EXPIRED,
            and_(
                Member.valid_until.isnot(None),
                Member.valid_until < database_current_time,
            ),
            and_(Member.valid_until.is_(None), Member.card_year < minimum_annual_year),
        ),
    )
