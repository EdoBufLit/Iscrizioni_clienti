from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import Member, MemberStatus


def _purge_member_pii(member: Member, now: datetime) -> None:
    member.email = None
    member.phone = None
    member.fiscal_code = None
    member.password_hash = None
    member.first_name = "EXPIRED"
    member.last_name = "MEMBER"
    member.signup_ip = None
    member.signup_user_agent = None
    member.external_customer_id = None
    member.internal_notes = None
    member.purged_at = now


def expire_and_purge_members(
    *,
    db: Session,
    now: datetime | None = None,
    purge_pii: bool = True,
) -> dict[str, Any]:
    current_time = now or datetime.utcnow()

    candidates = (
        db.query(Member)
        .filter(
            Member.deleted_at.is_(None),
            Member.card_year.isnot(None),
            Member.card_year < current_time.year,
        )
        .all()
    )

    expired_count = 0
    purged_count = 0
    member_ids: list[int] = []

    for member in candidates:
        member.deleted_at = current_time
        member.expired_at = member.expired_at or current_time
        member.status = MemberStatus.EXPIRED
        member.decision_at = member.decision_at or current_time
        if purge_pii:
            _purge_member_pii(member, current_time)
            purged_count += 1

        expired_count += 1
        member_ids.append(member.id)

    return {
        "expired_count": expired_count,
        "purged_count": purged_count,
        "member_ids": member_ids,
        "current_year": current_time.year,
    }
