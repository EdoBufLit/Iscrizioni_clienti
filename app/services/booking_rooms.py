from __future__ import annotations

from datetime import date, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models import Booking, BookingStatus, Room, RoomTable


ROOM_TABLE_SHAPES = {"round", "square", "rectangle"}
BOOKING_OCCUPANCY_ACTIVE_STATUSES = {
    BookingStatus.NEW.value,
    BookingStatus.PENDING.value,
    BookingStatus.CONFIRMED.value,
    BookingStatus.SEATED.value,
}


def _normalize_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def normalize_room_name(value: Any) -> str:
    normalized = _normalize_text(value)
    if normalized is None:
        raise HTTPException(status_code=422, detail="Nome sala obbligatorio.")
    return normalized[:160]


def normalize_room_table_name(value: Any) -> str:
    normalized = _normalize_text(value)
    if normalized is None:
        raise HTTPException(status_code=422, detail="Nome tavolo obbligatorio.")
    return normalized[:120]


def normalize_room_table_capacity(value: Any) -> int:
    try:
        capacity = int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Capienza tavolo non valida.") from exc
    if capacity <= 0:
        raise HTTPException(status_code=422, detail="La capienza deve essere maggiore di zero.")
    return min(capacity, 100)


def normalize_room_table_shape(value: Any) -> str:
    normalized = (_normalize_text(value) or "round").lower()
    if normalized not in ROOM_TABLE_SHAPES:
        raise HTTPException(status_code=422, detail="Forma tavolo non valida.")
    return normalized


def normalize_room_table_coordinate(value: Any, *, field_label: str) -> int:
    try:
        number = int(float(value))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"{field_label} non valido.") from exc
    return max(0, min(number, 4000))


def normalize_room_table_dimension(value: Any, *, fallback: int) -> int | None:
    if value in (None, "", 0, "0"):
        return None
    try:
        number = int(float(value))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Dimensione tavolo non valida.") from exc
    return max(40, min(number, 600)) or fallback


def serialize_room(room: Room, *, table_count: int | None = None, booking_count: int | None = None) -> dict[str, Any]:
    resolved_table_count = table_count if table_count is not None else len(room.tables or [])
    resolved_booking_count = booking_count if booking_count is not None else len(room.bookings or [])
    return {
        "id": room.id,
        "association_id": room.association_id,
        "name": room.name,
        "is_active": bool(room.is_active),
        "created_at": room.created_at.isoformat() if room.created_at else None,
        "updated_at": room.updated_at.isoformat() if room.updated_at else None,
        "table_count": resolved_table_count,
        "booking_count": resolved_booking_count,
    }


def _serialize_booking_summary(booking: Booking | None) -> dict[str, Any] | None:
    if booking is None:
        return None
    return {
        "id": booking.id,
        "status": booking.status,
        "customer_name": booking.customer_name,
        "booking_date": booking.booking_date.isoformat() if booking.booking_date else None,
        "booking_time": booking.booking_time,
        "party_size": booking.party_size,
        "form_title": booking.form.title if booking.form is not None else None,
    }


def serialize_room_table(
    table: RoomTable,
    *,
    occupancy_state: str = "free",
    active_booking: Booking | None = None,
) -> dict[str, Any]:
    return {
        "id": table.id,
        "association_id": table.association_id,
        "room_id": table.room_id,
        "name": table.name,
        "capacity": table.capacity,
        "shape": table.shape,
        "pos_x": table.pos_x,
        "pos_y": table.pos_y,
        "width": table.width,
        "height": table.height,
        "is_active": bool(table.is_active),
        "is_out_of_service": bool(table.is_out_of_service),
        "created_at": table.created_at.isoformat() if table.created_at else None,
        "updated_at": table.updated_at.isoformat() if table.updated_at else None,
        "occupancy_state": occupancy_state,
        "active_booking": _serialize_booking_summary(active_booking),
    }


def get_room_for_org_admin(db: Session, *, association_id: int, room_id: int) -> Room:
    room = (
        db.query(Room)
        .options(joinedload(Room.tables))
        .filter(Room.id == room_id, Room.association_id == association_id)
        .first()
    )
    if room is None:
        raise HTTPException(status_code=404, detail="Sala non trovata.")
    return room


def get_room_table_for_org_admin(db: Session, *, association_id: int, table_id: int) -> RoomTable:
    table = (
        db.query(RoomTable)
        .options(joinedload(RoomTable.room))
        .filter(RoomTable.id == table_id, RoomTable.association_id == association_id)
        .first()
    )
    if table is None:
        raise HTTPException(status_code=404, detail="Tavolo non trovato.")
    return table


def list_rooms_for_org_admin(db: Session, *, association_id: int, include_inactive: bool = False) -> list[Room]:
    query = (
        db.query(Room)
        .options(joinedload(Room.tables), joinedload(Room.bookings))
        .filter(Room.association_id == association_id)
    )
    if not include_inactive:
        query = query.filter(Room.is_active.is_(True))
    return query.order_by(Room.name.asc(), Room.id.asc()).all()


def list_room_tables_for_org_admin(
    db: Session,
    *,
    association_id: int,
    room_id: int | None = None,
    include_inactive: bool = True,
) -> list[RoomTable]:
    query = (
        db.query(RoomTable)
        .options(joinedload(RoomTable.room))
        .filter(RoomTable.association_id == association_id)
    )
    if room_id is not None:
        query = query.filter(RoomTable.room_id == room_id)
    if not include_inactive:
        query = query.filter(RoomTable.is_active.is_(True))
    return query.order_by(RoomTable.room_id.asc(), RoomTable.name.asc(), RoomTable.id.asc()).all()


def apply_room_updates(room: Room, *, name: Any, is_active: bool) -> Room:
    room.name = normalize_room_name(name)
    room.is_active = bool(is_active)
    return room


def apply_room_table_updates(
    table: RoomTable,
    *,
    room_id: int,
    name: Any,
    capacity: Any,
    shape: Any,
    pos_x: Any,
    pos_y: Any,
    width: Any,
    height: Any,
    is_active: bool,
    is_out_of_service: bool,
) -> RoomTable:
    table.room_id = room_id
    table.name = normalize_room_table_name(name)
    table.capacity = normalize_room_table_capacity(capacity)
    table.shape = normalize_room_table_shape(shape)
    table.pos_x = normalize_room_table_coordinate(pos_x, field_label="Posizione X")
    table.pos_y = normalize_room_table_coordinate(pos_y, field_label="Posizione Y")
    table.width = normalize_room_table_dimension(width, fallback=88)
    table.height = normalize_room_table_dimension(height, fallback=88)
    table.is_active = bool(is_active)
    table.is_out_of_service = bool(is_out_of_service)
    return table


def _active_bookings_by_table(
    db: Session,
    *,
    association_id: int,
    room_id: int,
    focus_date: date | None = None,
    focus_time: str | None = None,
) -> dict[int, Booking]:
    query = (
        db.query(Booking)
        .options(joinedload(Booking.form))
        .filter(
            Booking.association_id == association_id,
            Booking.room_id == room_id,
            Booking.table_id.isnot(None),
            Booking.status.in_(BOOKING_OCCUPANCY_ACTIVE_STATUSES),
        )
    )
    if focus_date is not None:
        query = query.filter(Booking.booking_date == focus_date)
    if focus_time:
        query = query.filter((Booking.booking_time == focus_time) | (Booking.booking_time.is_(None)))
    bookings = query.order_by(
        Booking.status.asc(),
        Booking.booking_time.asc().nulls_last(),
        Booking.created_at.asc(),
    ).all()
    by_table: dict[int, Booking] = {}
    for booking in bookings:
        table_id = int(booking.table_id or 0)
        if table_id and table_id not in by_table:
            by_table[table_id] = booking
    return by_table


def room_map_payload(
    db: Session,
    *,
    association_id: int,
    room_id: int,
    focus_date: date | None = None,
    focus_time: str | None = None,
) -> dict[str, Any]:
    room = get_room_for_org_admin(db, association_id=association_id, room_id=room_id)
    active_by_table = _active_bookings_by_table(
        db,
        association_id=association_id,
        room_id=room_id,
        focus_date=focus_date,
        focus_time=focus_time,
    )
    tables_payload = []
    for table in sorted(room.tables or [], key=lambda item: (item.pos_y, item.pos_x, item.id)):
        booking = active_by_table.get(table.id)
        if bool(table.is_out_of_service):
            occupancy = "out_of_service"
        elif booking is None:
            occupancy = "free"
        elif booking.status == BookingStatus.SEATED.value:
            occupancy = "occupied"
        else:
            occupancy = "reserved"
        tables_payload.append(
            serialize_room_table(
                table,
                occupancy_state=occupancy,
                active_booking=booking,
            )
        )
    return {
        "room": serialize_room(room),
        "focus_date": focus_date.isoformat() if focus_date else None,
        "focus_time": focus_time,
        "tables": tables_payload,
        "totals": {
            "tables": len(tables_payload),
            "free": sum(1 for item in tables_payload if item["occupancy_state"] == "free"),
            "reserved": sum(1 for item in tables_payload if item["occupancy_state"] == "reserved"),
            "occupied": sum(1 for item in tables_payload if item["occupancy_state"] == "occupied"),
            "out_of_service": sum(1 for item in tables_payload if item["occupancy_state"] == "out_of_service"),
        },
    }


def resolve_assignment_targets(
    db: Session,
    *,
    association_id: int,
    room_id: int | None,
    table_id: int | None,
) -> tuple[Room | None, RoomTable | None]:
    room: Room | None = None
    table: RoomTable | None = None
    if table_id is not None:
        table = get_room_table_for_org_admin(db, association_id=association_id, table_id=table_id)
        room = get_room_for_org_admin(db, association_id=association_id, room_id=table.room_id)
        if room_id is not None and room.id != room_id:
            raise HTTPException(status_code=422, detail="Il tavolo selezionato non appartiene alla sala scelta.")
    elif room_id is not None:
        room = get_room_for_org_admin(db, association_id=association_id, room_id=room_id)
    return room, table


def validate_booking_assignment(
    db: Session,
    *,
    booking: Booking,
    room: Room | None,
    table: RoomTable | None,
) -> None:
    if table is not None:
        if not bool(table.is_active):
            raise HTTPException(status_code=422, detail="Il tavolo selezionato non e attivo.")
        if bool(table.is_out_of_service):
            raise HTTPException(status_code=422, detail="Il tavolo selezionato e fuori servizio.")
    if room is not None and not bool(room.is_active):
        raise HTTPException(status_code=422, detail="La sala selezionata non e attiva.")
    if room is None and table is not None:
        raise HTTPException(status_code=422, detail="Sala non valida per il tavolo selezionato.")
    if table is None:
        return
    if booking.booking_date is None:
        return
    conflict_query = (
        db.query(Booking)
        .filter(
            Booking.association_id == booking.association_id,
            Booking.id != booking.id,
            Booking.table_id == table.id,
            Booking.booking_date == booking.booking_date,
            Booking.status.in_(BOOKING_OCCUPANCY_ACTIVE_STATUSES),
        )
    )
    if booking.booking_time:
        conflict_query = conflict_query.filter(
            (Booking.booking_time == booking.booking_time) | (Booking.booking_time.is_(None))
        )
    conflict = conflict_query.first()
    if conflict is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Il tavolo {table.name} e gia assegnato a "
                f"{conflict.customer_name} per la stessa fascia."
            ),
        )


def auto_assign_booking_table(
    db: Session,
    *,
    booking: Booking,
) -> tuple[Room | None, RoomTable | None]:
    if booking.booking_date is None:
        return None, None

    rooms = list_rooms_for_org_admin(
        db,
        association_id=booking.association_id,
        include_inactive=False,
    )
    required_capacity = max(1, int(booking.party_size or 1))

    for room in rooms:
        active_by_table = _active_bookings_by_table(
            db,
            association_id=booking.association_id,
            room_id=room.id,
            focus_date=booking.booking_date,
            focus_time=booking.booking_time,
        )
        ordered_tables = sorted(
            list(room.tables or []),
            key=lambda table: (
                int(table.capacity or 0) < required_capacity,
                int(table.capacity or 0),
                table.pos_y,
                table.pos_x,
                table.id,
            ),
        )
        for table in ordered_tables:
            if not bool(table.is_active) or bool(table.is_out_of_service):
                continue
            if int(table.capacity or 0) < required_capacity:
                continue
            if table.id in active_by_table:
                continue
            validate_booking_assignment(
                db,
                booking=booking,
                room=room,
                table=table,
            )
            return room, table
    return None, None


def maybe_record_assignment_event(
    db: Session,
    *,
    booking: Booking,
    created_by_user_id: int | None,
    previous_room_id: int | None,
    previous_table_id: int | None,
) -> None:
    if previous_room_id == booking.room_id and previous_table_id == booking.table_id:
        return
    from app.services.bookings import _add_booking_event

    _add_booking_event(
        db,
        booking=booking,
        event_type="assignment_updated",
        payload_json={
            "from_room_id": previous_room_id,
            "to_room_id": booking.room_id,
            "from_table_id": previous_table_id,
            "to_table_id": booking.table_id,
        },
        created_by_user_id=created_by_user_id,
    )


def update_table_positions(
    db: Session,
    *,
    association_id: int,
    room_id: int,
    positions: list[dict[str, Any]],
) -> list[RoomTable]:
    room = get_room_for_org_admin(db, association_id=association_id, room_id=room_id)
    tables_by_id = {table.id: table for table in list(room.tables or [])}
    updated: list[RoomTable] = []
    for payload in positions:
        table_id = int(payload.get("id") or 0)
        table = tables_by_id.get(table_id)
        if table is None:
            raise HTTPException(status_code=404, detail="Tavolo non trovato per il salvataggio mappa.")
        table.pos_x = normalize_room_table_coordinate(payload.get("pos_x"), field_label="Posizione X")
        table.pos_y = normalize_room_table_coordinate(payload.get("pos_y"), field_label="Posizione Y")
        if payload.get("width") not in (None, ""):
            table.width = normalize_room_table_dimension(payload.get("width"), fallback=88)
        if payload.get("height") not in (None, ""):
            table.height = normalize_room_table_dimension(payload.get("height"), fallback=88)
        updated.append(table)
    db.flush()
    return updated
