from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import Member, MemberStatus
from app.services.card_allocation import release_card_number


def _purge_member_pii(member: Member, now: datetime) -> None:
    member.email = None
    member.phone = None
    member.fiscal_code = None
    member.birth_date = None
    member.birth_place = None
    member.birth_place_code = None
    member.gender = None
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
        release_card_number(
            db,
            org_id=member.org_id,
            year=member.card_year,
            card_no=member.card_no,
            batch_id=member.batch_id,
        )
        member.deleted_at = current_time
        member.expired_at = member.expired_at or current_time
        member.status = MemberStatus.EXPIRED
        member.decision_at = member.decision_at or current_time
        # Free reusable identifiers after yearly expiration cleanup.
        member.card_no = None
        member.batch_id = None
        member.numbering_scope_id = None
        member.external_customer_id = None
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
