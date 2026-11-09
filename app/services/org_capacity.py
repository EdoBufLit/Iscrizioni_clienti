from __future__ import annotations

from datetime import date
from typing import Literal

from sqlalchemy import func
from sqlalchemy.orm import Query, Session

from app.models import Booking, MemberAttendance, Organization, OrgCapacityAlert
from app.services.booking_rooms import BOOKING_OCCUPANCY_ACTIVE_STATUSES
from app.services.org_admin_notifications import notify_org_admins_about_capacity


def _check_capacity(
    db: Session,
    *,
    org_id: int,
    source: Literal["attendance", "bookings"],
    day: date,
    people_count: Query,
) -> None:
    venue_query = db.query(Organization.max_capacity, Organization.name).filter(
        Organization.id == org_id,
        Organization.max_capacity.is_not(None),
    )

    # Callers have flushed their write. SQLite serializes writers already. In
    # PostgreSQL serialize the count and alert only for the affected date and
    # source, so the next writer sees the first writer's committed changes.
    if db.get_bind().dialect.name == "postgresql":
        scope = f"org_capacity:{source}:{day.isoformat()}"
        lock = func.pg_advisory_xact_lock(org_id, func.hashtext(scope))
        if venue_query.with_entities(lock).one_or_none() is None:
            return

    venue = venue_query.one_or_none()
    if venue is None:
        return
    state = db.get(OrgCapacityAlert, (org_id, source, day))
    if state is not None and state.full_notified:
        return
    capacity = venue.max_capacity
    people = people_count.scalar() or 0
    full = people >= capacity
    if not full and (state is not None or people * 10 < capacity * 9):
        return

    notified = notify_org_admins_about_capacity(
        db,
        org_id=org_id,
        organization_name=venue.name or "Associazione",
        source=source,
        day=day,
        people=people,
        capacity=capacity,
    )
    if notified:
        if state is None:
            db.add(OrgCapacityAlert(org_id=org_id, source=source, day=day, full_notified=full))
        else:
            state.full_notified = True
        db.flush()


def check_attendance_capacity(db: Session, attendance: MemberAttendance) -> None:
    people_count = db.query(func.count(MemberAttendance.id)).filter(
        MemberAttendance.org_id == attendance.org_id,
        MemberAttendance.attendance_date == attendance.attendance_date,
    )
    _check_capacity(
        db,
        org_id=attendance.org_id,
        source="attendance",
        day=attendance.attendance_date,
        people_count=people_count,
    )


def check_booking_capacity(db: Session, booking: Booking) -> None:
    if booking.booking_date is None or booking.status not in BOOKING_OCCUPANCY_ACTIVE_STATUSES:
        return
    people_count = db.query(func.sum(func.coalesce(Booking.party_size, 1))).filter(
        Booking.association_id == booking.association_id,
        Booking.booking_date == booking.booking_date,
        Booking.status.in_(BOOKING_OCCUPANCY_ACTIVE_STATUSES),
    )
    _check_capacity(
        db,
        org_id=booking.association_id,
        source="bookings",
        day=booking.booking_date,
        people_count=people_count,
    )
