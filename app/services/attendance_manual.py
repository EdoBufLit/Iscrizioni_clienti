from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import String, and_, cast, func, or_
from sqlalchemy.orm import Session, load_only

from app.models import Member, MemberAttendance
from app.services.annual_memberships import as_rome_datetime
from app.services.attendance import AttendanceCheckInResult, check_in_member_from_qr
from app.services.card_verification import (
    build_card_verification_token,
    card_snapshot_membership_type,
    resolve_card_verification_membership,
)
from app.services.member_membership import resolve_member_membership_type
from app.services.member_search import normalize_member_search


def _contains(column, value: str):
    literal = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return column.ilike(f"%{literal}%", escape="\\")


def search_attendance_members(db: Session, *, org_id: int, search: str) -> dict:
    """Return a bounded selection, with the same card eligibility as QR check-in."""
    normalized = normalize_member_search(search)
    if not 2 <= len(normalized) <= 120:
        raise HTTPException(status_code=422, detail="Inserisci almeno 2 caratteri per cercare un socio")

    query = db.query(Member).filter(
        Member.org_id == org_id,
        Member.deleted_at.is_(None),
        or_(
            and_(*(
                or_(_contains(Member.first_name, term), _contains(Member.last_name, term))
                for term in normalized.split()
            )),
            _contains(Member.email, normalized),
            _contains(cast(Member.card_no, String), normalized),
        ),
    )
    total = query.with_entities(func.count(Member.id)).scalar() or 0
    now = datetime.utcnow()
    today = as_rome_datetime(now).date()
    already_checked_in = (
        db.query(MemberAttendance.id)
        .filter(
            MemberAttendance.org_id == org_id,
            MemberAttendance.member_id == Member.id,
            MemberAttendance.attendance_date == today,
        )
        .correlate(Member)
        .exists()
    )
    candidates = (
        query.add_columns(already_checked_in.label("already_checked_in"))
        .options(load_only(
            Member.id, Member.org_id, Member.first_name, Member.last_name,
            Member.email, Member.card_no, Member.card_year, Member.membership_type,
        ))
        .order_by(Member.last_name, Member.first_name, Member.id)
        .limit(20)
        .all()
    )
    items = []
    for member, checked_in in candidates:
        active = False
        membership_type = resolve_member_membership_type(member)
        if member.card_no and member.card_year:
            resolved_member, snapshot, inactive_reason = resolve_card_verification_membership(
                db,
                payload={
                    "member_id": member.id,
                    "org_id": org_id,
                    "card_number": member.card_no,
                    "card_year": member.card_year,
                },
                checked_at=now,
            )
            active = resolved_member is not None and not inactive_reason
            membership_type = card_snapshot_membership_type(snapshot, resolved_member)
        items.append({
            "id": member.id,
            "name": f"{member.first_name or ''} {member.last_name or ''}".strip(),
            "email": member.email,
            "card_no": member.card_no,
            "card_year": member.card_year,
            "membership_type": membership_type,
            "is_active": active,
            "already_checked_in": bool(checked_in),
        })
    return {"items": items, "total": int(total)}


def check_in_member_manually(
    db: Session,
    *,
    org_id: int,
    member_id: int,
    checked_in_by_admin_id: int,
) -> AttendanceCheckInResult:
    member = db.query(Member).filter(
        Member.id == member_id,
        Member.org_id == org_id,
        Member.deleted_at.is_(None),
    ).first()
    if member is None:
        raise HTTPException(status_code=404, detail="Socio non trovato")
    if not member.card_no or not member.card_year:
        raise HTTPException(status_code=409, detail="Tessera non attiva")

    # Use the current signed card identity so annual terms, temporary purchases,
    # Rome-day deduplication and race handling follow the QR path exactly.
    token = build_card_verification_token(
        member_id=member.id,
        org_id=org_id,
        card_number=member.card_no,
        card_year=member.card_year,
    )
    return check_in_member_from_qr(
        db,
        org_id=org_id,
        qr_value=token,
        source="manual",
        checked_in_by_admin_id=checked_in_by_admin_id,
    )
