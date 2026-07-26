from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
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


@dataclass(frozen=True)
class AttendanceCheckInResult:
    created: bool
    item: MemberAttendance


def serialize_utc(value: datetime) -> str:
    rendered = value.isoformat()
    if value.tzinfo is None:
        return f"{rendered}Z"
    return rendered


def serialize_attendance(item: MemberAttendance) -> dict[str, object]:
    member = item.member
    station = item.scanner_station
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
        "checked_in_at": serialize_utc(item.checked_in_at),
        "source": item.source,
        "scanner_station_id": item.scanner_station_id,
        "scanner_station_name": station.name if station else None,
    }


def existing_attendance(
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


def check_in_member_from_qr(
    db: Session,
    *,
    org_id: int,
    qr_value: str,
    source: str,
    checked_in_by_admin_id: int | None = None,
    scanner_station_id: int | None = None,
) -> AttendanceCheckInResult:
    if (checked_in_by_admin_id is None) == (scanner_station_id is None):
        raise ValueError("Exactly one attendance actor is required")

    token = extract_card_verification_token(qr_value)
    payload = parse_card_verification_token(token) if token else None
    if not payload or payload["org_id"] != org_id:
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
    existing = existing_attendance(
        db,
        org_id=org_id,
        member_id=member.id,
        attendance_date=attendance_date,
    )
    if existing is not None:
        return AttendanceCheckInResult(created=False, item=existing)

    resolved_term: AnnualMembershipTerm | None = annual_term
    card_no = resolved_term.card_no if resolved_term else payload["card_number"]
    card_year = resolved_term.card_year if resolved_term else payload["card_year"]
    membership_type = (
        MembershipType.ANNUAL.value
        if resolved_term is not None
        else resolve_member_membership_type(member)
    )
    attendance = MemberAttendance(
        org_id=org_id,
        member_id=member.id,
        checked_in_by_admin_id=checked_in_by_admin_id,
        scanner_station_id=scanner_station_id,
        card_no=card_no,
        card_year=card_year,
        membership_type=membership_type,
        attendance_date=attendance_date,
        source=source,
        checked_in_at=checked_at,
    )
    db.add(attendance)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = existing_attendance(
            db,
            org_id=org_id,
            member_id=member.id,
            attendance_date=attendance_date,
        )
        if existing is None:
            raise
        return AttendanceCheckInResult(created=False, item=existing)

    db.refresh(attendance)
    return AttendanceCheckInResult(created=True, item=attendance)
