from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import String, cast, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import audit
from app.db import get_db
from app.middleware import get_client_ip, get_request_id
from app.models import (
    AdminRole,
    AnnualMembershipTerm,
    Member,
    MemberAttendance,
    MembershipType,
)
from app.services.annual_memberships import as_rome_datetime
from app.services.card_verification import (
    extract_card_verification_token,
    parse_card_verification_token,
    resolve_card_verification_membership,
)
from app.services.member_membership import resolve_member_membership_type
from app.services.org_admin_sessions import get_current_org_admin_from_request


router = APIRouter(prefix="/api/org-admin/attendances", tags=["org-admin-attendance"])


class AttendanceCheckInBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    qr_value: str = Field(..., min_length=20, max_length=2048)


def _current_admin(request: Request, db: Session):
    admin = get_current_org_admin_from_request(request, db)
    if not admin or admin.org_id is None:
        raise HTTPException(status_code=401, detail="Non autenticato")
    return admin


def _serialize_utc(value: datetime) -> str:
    rendered = value.isoformat()
    if value.tzinfo is None:
        return f"{rendered}Z"
    return rendered


def _serialize_attendance(item: MemberAttendance) -> dict[str, object]:
    member = item.member
    return {
        "id": item.id,
        "member_id": item.member_id,
        "member_name": (
            f"{member.first_name or ''} {member.last_name or ''}".strip()
            if member
            else "Socio"
        ),
        "card_no": item.card_no,
        "card_year": item.card_year,
        "membership_type": item.membership_type,
        "attendance_date": item.attendance_date.isoformat(),
        "checked_in_at": _serialize_utc(item.checked_in_at),
        "source": item.source,
    }


def _existing_attendance(
    db: Session,
    *,
    org_id: int,
    member_id: int,
    attendance_date: date,
) -> MemberAttendance | None:
    return (
        db.query(MemberAttendance)
        .filter(
            MemberAttendance.org_id == org_id,
            MemberAttendance.member_id == member_id,
            MemberAttendance.attendance_date == attendance_date,
        )
        .first()
    )


@router.post("/check-in")
def check_in_member(
    body: AttendanceCheckInBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _current_admin(request, db)
    token = extract_card_verification_token(body.qr_value)
    payload = parse_card_verification_token(token) if token else None
    if not payload or payload["org_id"] != admin.org_id:
        raise HTTPException(status_code=404, detail="QR tessera non riconosciuto")

    checked_at = datetime.utcnow()
    member, annual_term, inactive_reason = resolve_card_verification_membership(
        db,
        payload=payload,
        checked_at=checked_at,
    )
    if member is None:
        raise HTTPException(status_code=404, detail="QR tessera non riconosciuto")
    if inactive_reason:
        raise HTTPException(status_code=409, detail="Tessera non attiva")

    attendance_date = as_rome_datetime(checked_at).date()
    existing = _existing_attendance(
        db,
        org_id=admin.org_id,
        member_id=member.id,
        attendance_date=attendance_date,
    )
    if existing is not None:
        return {"created": False, "item": _serialize_attendance(existing)}

    resolved_term: AnnualMembershipTerm | None = annual_term
    card_no = resolved_term.card_no if resolved_term else payload["card_number"]
    card_year = resolved_term.card_year if resolved_term else payload["card_year"]
    membership_type = (
        MembershipType.ANNUAL.value
        if resolved_term is not None
        else resolve_member_membership_type(member)
    )
    attendance = MemberAttendance(
        org_id=admin.org_id,
        member_id=member.id,
        checked_in_by_admin_id=admin.id,
        card_no=card_no,
        card_year=card_year,
        membership_type=membership_type,
        attendance_date=attendance_date,
        source="qr",
        checked_in_at=checked_at,
    )
    db.add(attendance)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = _existing_attendance(
            db,
            org_id=admin.org_id,
            member_id=member.id,
            attendance_date=attendance_date,
        )
        if existing is None:
            raise
        return {"created": False, "item": _serialize_attendance(existing)}

    db.refresh(attendance)
    audit.log_operation(
        db,
        action="member.attendance_check_in",
        entity_type="member",
        entity_id=member.id,
        org_id=admin.org_id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        category="member",
        request_id=get_request_id(request),
        metadata={
            "attendance_id": attendance.id,
            "attendance_date": attendance.attendance_date.isoformat(),
            "checked_in_at": _serialize_utc(attendance.checked_in_at),
            "card_no": attendance.card_no,
            "card_year": attendance.card_year,
            "membership_type": attendance.membership_type,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return {"created": True, "item": _serialize_attendance(attendance)}


@router.get("")
def list_attendances(
    request: Request,
    day: date | None = None,
    q: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=100, ge=1, le=250),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    admin = _current_admin(request, db)
    selected_day = day or as_rome_datetime().date()
    query = (
        db.query(MemberAttendance)
        .join(Member, Member.id == MemberAttendance.member_id)
        .filter(
            MemberAttendance.org_id == admin.org_id,
            MemberAttendance.attendance_date == selected_day,
        )
    )
    normalized_q = (q or "").strip()
    if normalized_q:
        pattern = f"%{normalized_q}%"
        query = query.filter(
            or_(
                Member.first_name.ilike(pattern),
                Member.last_name.ilike(pattern),
                Member.email.ilike(pattern),
                cast(MemberAttendance.card_no, String).ilike(pattern),
            )
        )

    total = query.with_entities(func.count(MemberAttendance.id)).scalar() or 0
    items = (
        query.order_by(
            MemberAttendance.checked_in_at.desc(),
            MemberAttendance.id.desc(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "day": selected_day.isoformat(),
        "total": int(total),
        "items": [_serialize_attendance(item) for item in items],
    }
