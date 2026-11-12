from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import String, and_, cast, func, or_
from sqlalchemy.orm import Session, joinedload

from app import audit
from app.db import get_db
from app.middleware import get_client_ip, get_request_id
from app.models import (
    AdminRole,
    AdminUser,
    Booking,
    Member,
    MemberAttendance,
)
from app.services.annual_memberships import as_rome_datetime
from app.services.card_identity import format_card_number_label
from app.services.attendance import (
    AttendanceCheckInResult,
    attendance_card_namespace,
    check_in_member_from_qr,
    serialize_attendance,
    serialize_utc,
)
from app.services.attendance_manual import check_in_member_manually, search_attendance_members
from app.services.booking_event_availability import find_form_booking_series_for_time, is_form_date_closed
from app.services.org_admin_sessions import get_current_org_admin_from_request


router = APIRouter(prefix="/api/org-admin/attendances", tags=["org-admin-attendance"])


class AttendanceCheckInBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    qr_value: str = Field(..., min_length=20, max_length=2048)


class AttendanceManualCheckInBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    member_id: int = Field(..., gt=0, strict=True)


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
    return _check_in_response(db, admin=admin, result=result, request=request)


def _find_member_active_booking_for_day(
    db: Session,
    *,
    org_id: int,
    member_id: int,
    attendance_date: date,
) -> dict | None:
    member = db.query(Member).filter(Member.id == member_id, Member.org_id == org_id).first()
    filters = [Booking.member_id == member_id]
    if member and member.email:
        filters.append(and_(Booking.member_id.is_(None), func.lower(func.trim(Booking.customer_email)) == member.email.strip().lower()))
    booking = (
        db.query(Booking)
        .options(
            joinedload(Booking.room),
            joinedload(Booking.table),
            joinedload(Booking.form),
        )
        .filter(
            Booking.association_id == org_id,
            Booking.booking_date == attendance_date,
            Booking.status.in_(["confirmed", "seated"]),
            or_(*filters),
        )
        .order_by(Booking.booking_time.asc().nulls_last(), Booking.id.desc())
        .all()
    )
    for candidate in booking:
        if not candidate.form or not candidate.booking_time:
            continue
        if is_form_date_closed(db, form=candidate.form, date_value=attendance_date):
            continue
        series = find_form_booking_series_for_time(db, form=candidate.form, booking_date=attendance_date, booking_time=candidate.booking_time[:5])
        if series and not series.is_closed:
            booking = candidate
            break
    else:
        return None
    return {
        "id": booking.id,
        "status": booking.status,
        "booking_date": booking.booking_date.isoformat() if booking.booking_date else None,
        "booking_time": booking.booking_time,
        "party_size": booking.party_size,
        "room_id": booking.room_id,
        "room_name": booking.room.name if booking.room else None,
        "table_id": booking.table_id,
        "table_name": booking.table.name if booking.table else None,
        "event_title": series.title,
    }


def _check_in_response(
    db: Session,
    *,
    admin: AdminUser,
    result: AttendanceCheckInResult,
    request: Request,
):
    attendance = result.item
    active_booking = _find_member_active_booking_for_day(
        db,
        org_id=admin.org_id,
        member_id=attendance.member_id,
        attendance_date=attendance.attendance_date,
    )
    if not result.created:
        return {
            "created": False,
            "item": serialize_attendance(attendance),
            "active_booking": active_booking,
        }

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
            "card_namespace": attendance_card_namespace(attendance),
            "card_number_label": format_card_number_label(attendance.card_no, attendance_card_namespace(attendance)),
            "card_year": attendance.card_year,
            "membership_type": attendance.membership_type,
            "source": attendance.source,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return {
        "created": True,
        "item": serialize_attendance(attendance),
        "active_booking": active_booking,
    }


@router.get("/members")
def find_attendance_members(
    request: Request,
    q: str = Query(..., min_length=2, max_length=120),
    db: Session = Depends(get_db),
):
    admin = _current_admin(request, db)
    return search_attendance_members(db, org_id=admin.org_id, search=q)


@router.post("/manual-check-in")
def manual_check_in_member(
    body: AttendanceManualCheckInBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _current_admin(request, db)
    result = check_in_member_manually(
        db,
        org_id=admin.org_id,
        member_id=body.member_id,
        checked_in_by_admin_id=admin.id,
    )
    return _check_in_response(db, admin=admin, result=result, request=request)


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
        query.options(
            joinedload(MemberAttendance.member).selectinload(Member.annual_membership_terms),
            joinedload(MemberAttendance.scanner_station),
        ).order_by(
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
