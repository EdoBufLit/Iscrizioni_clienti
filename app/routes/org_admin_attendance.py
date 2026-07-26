from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session

from app import audit
from app.db import get_db
from app.middleware import get_client_ip, get_request_id
from app.models import (
    AdminRole,
    Member,
    MemberAttendance,
)
from app.services.annual_memberships import as_rome_datetime
from app.services.attendance import (
    check_in_member_from_qr,
    serialize_attendance,
    serialize_utc,
)
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


@router.post("/check-in")
def check_in_member(
    body: AttendanceCheckInBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _current_admin(request, db)
    result = check_in_member_from_qr(
        db,
        org_id=admin.org_id,
        qr_value=body.qr_value,
        source="qr",
        checked_in_by_admin_id=admin.id,
    )
    attendance = result.item
    if not result.created:
        return {"created": False, "item": serialize_attendance(attendance)}

    audit.log_operation(
        db,
        action="member.attendance_check_in",
        entity_type="member",
        entity_id=attendance.member_id,
        org_id=admin.org_id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        category="member",
        request_id=get_request_id(request),
        metadata={
            "attendance_id": attendance.id,
            "attendance_date": attendance.attendance_date.isoformat(),
            "checked_in_at": serialize_utc(attendance.checked_in_at),
            "card_no": attendance.card_no,
            "card_year": attendance.card_year,
            "membership_type": attendance.membership_type,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return {"created": True, "item": serialize_attendance(attendance)}


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
        "items": [serialize_attendance(item) for item in items],
    }
