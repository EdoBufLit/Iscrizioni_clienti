from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app import audit
from app.config import settings
from app.db import get_db
from app.log_redaction import hash_identifier
from app.middleware import get_client_ip, get_request_id
from app.models import (
    AdminRole,
    AttendanceStation,
    Organization,
)
from app.services.attendance import (
    check_in_member_from_qr,
    serialize_attendance,
    serialize_utc,
)
from app.services.db_rate_limit import enforce_db_rate_limit
from app.services.org_admin_sessions import get_current_org_admin_from_request
from app.services.org_branding import resolve_club_display_name
from app.services.qr_code import build_qr_data_uri
from app.utils import generate_token, hash_token


admin_router = APIRouter(
    prefix="/api/org-admin/attendance-stations",
    tags=["org-admin-attendance-stations"],
)
station_router = APIRouter(
    prefix="/api/attendance-stations",
    tags=["attendance-stations"],
)

ATTENDANCE_STATION_COOKIE = "attendance_station_session"
PAIRING_TTL = timedelta(minutes=10)
STATION_TOUCH_INTERVAL = timedelta(minutes=5)
STATION_COOKIE_MAX_AGE_SECONDS = 5 * 365 * 24 * 60 * 60


class AttendanceStationCreateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=2, max_length=120)


class AttendanceStationCheckInBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    qr_value: str = Field(..., min_length=20, max_length=2048)


def _current_admin(request: Request, db: Session):
    admin = get_current_org_admin_from_request(request, db)
    if not admin or admin.org_id is None:
        raise HTTPException(status_code=401, detail="Non autenticato")
    return admin


def _serialize_optional_utc(value: datetime | None) -> str | None:
    return serialize_utc(value) if value is not None else None


def _station_status(station: AttendanceStation) -> str:
    if station.revoked_at is not None:
        return "revoked"
    if station.credential_hash and station.paired_at:
        return "active"
    return "pending_pairing"


def _serialize_station(station: AttendanceStation) -> dict[str, object]:
    return {
        "id": station.id,
        "name": station.name,
        "status": _station_status(station),
        "created_at": _serialize_optional_utc(station.created_at),
        "paired_at": _serialize_optional_utc(station.paired_at),
        "last_used_at": _serialize_optional_utc(station.last_used_at),
        "revoked_at": _serialize_optional_utc(station.revoked_at),
    }


def _public_base_url(request: Request) -> str:
    configured = (settings.BASE_URL or "").strip().rstrip("/")
    if configured:
        return configured
    return str(request.base_url).rstrip("/")


def _new_pairing(
    station: AttendanceStation,
    *,
    request: Request,
    now: datetime,
) -> tuple[str, str]:
    raw_pairing_token = generate_token()
    station.pairing_token_hash = hash_token(raw_pairing_token)
    station.pairing_expires_at = now + PAIRING_TTL
    pairing_url = (
        f"{_public_base_url(request)}/api/attendance-stations/pair/"
        f"{raw_pairing_token}"
    )
    return pairing_url, build_qr_data_uri(pairing_url)


def _pairing_response(
    station: AttendanceStation,
    *,
    pairing_url: str,
    pairing_qr_data_url: str,
) -> dict[str, object]:
    return {
        "station": _serialize_station(station),
        "pairing_url": pairing_url,
        "pairing_qr_data_url": pairing_qr_data_url,
        "pairing_expires_at": _serialize_optional_utc(station.pairing_expires_at),
    }


def _get_admin_station(
    db: Session,
    *,
    station_id: int,
    org_id: int,
) -> AttendanceStation:
    station = (
        db.query(AttendanceStation)
        .filter(
            AttendanceStation.id == station_id,
            AttendanceStation.org_id == org_id,
        )
        .first()
    )
    if station is None:
        raise HTTPException(status_code=404, detail="Postazione non trovata")
    return station


def _set_station_cookie(response: Response, raw_credential: str) -> None:
    response.set_cookie(
        ATTENDANCE_STATION_COOKIE,
        raw_credential,
        max_age=STATION_COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        secure=settings.BASE_URL.startswith("https"),
        samesite="lax",
        path="/",
    )


def _resolve_station(
    request: Request,
    db: Session,
    *,
    touch: bool = True,
) -> AttendanceStation | None:
    raw_credential = request.cookies.get(ATTENDANCE_STATION_COOKIE)
    if not raw_credential:
        return None

    now = datetime.utcnow()
    station = (
        db.query(AttendanceStation)
        .join(Organization, Organization.id == AttendanceStation.org_id)
        .filter(
            AttendanceStation.credential_hash == hash_token(raw_credential),
            AttendanceStation.revoked_at.is_(None),
            Organization.is_active.is_(True),
            Organization.deleted_at.is_(None),
        )
        .first()
    )
    if station is None:
        return None

    if touch and (
        station.last_used_at is None
        or station.last_used_at <= now - STATION_TOUCH_INTERVAL
    ):
        station.last_used_at = now
        db.commit()
        db.refresh(station)
    return station


@admin_router.get("")
def list_attendance_stations(
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _current_admin(request, db)
    stations = (
        db.query(AttendanceStation)
        .filter(AttendanceStation.org_id == admin.org_id)
        .order_by(
            AttendanceStation.revoked_at.isnot(None),
            AttendanceStation.created_at.desc(),
            AttendanceStation.id.desc(),
        )
        .all()
    )
    return {"items": [_serialize_station(station) for station in stations]}


@admin_router.post("")
def create_attendance_station(
    body: AttendanceStationCreateBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _current_admin(request, db)
    name = body.name.strip()
    if len(name) < 2:
        raise HTTPException(
            status_code=422,
            detail="Inserisci un nome per la postazione",
        )

    now = datetime.utcnow()
    station = AttendanceStation(
        org_id=admin.org_id,
        name=name,
        created_by_admin_id=admin.id,
        created_at=now,
    )
    pairing_url, pairing_qr_data_url = _new_pairing(
        station,
        request=request,
        now=now,
    )
    db.add(station)
    db.commit()
    db.refresh(station)

    audit.log_operation(
        db,
        action="attendance_station.created",
        entity_type="attendance_station",
        entity_id=station.id,
        org_id=station.org_id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        category="security",
        request_id=get_request_id(request),
        metadata={
            "station_name": station.name,
            "pairing_expires_at": _serialize_optional_utc(
                station.pairing_expires_at
            ),
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return _pairing_response(
        station,
        pairing_url=pairing_url,
        pairing_qr_data_url=pairing_qr_data_url,
    )


@admin_router.post("/{station_id}/pairing")
def renew_attendance_station_pairing(
    station_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _current_admin(request, db)
    station = _get_admin_station(
        db,
        station_id=station_id,
        org_id=admin.org_id,
    )
    if station.revoked_at is not None:
        raise HTTPException(
            status_code=409,
            detail="La postazione è stata revocata",
        )

    now = datetime.utcnow()
    station.credential_hash = None
    station.paired_at = None
    station.last_used_at = None
    station.paired_user_agent = None
    station.paired_ip_hash = None
    pairing_url, pairing_qr_data_url = _new_pairing(
        station,
        request=request,
        now=now,
    )
    db.commit()
    db.refresh(station)

    audit.log_operation(
        db,
        action="attendance_station.pairing_rotated",
        entity_type="attendance_station",
        entity_id=station.id,
        org_id=station.org_id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        category="security",
        request_id=get_request_id(request),
        metadata={
            "station_name": station.name,
            "pairing_expires_at": _serialize_optional_utc(
                station.pairing_expires_at
            ),
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return _pairing_response(
        station,
        pairing_url=pairing_url,
        pairing_qr_data_url=pairing_qr_data_url,
    )


@admin_router.post("/{station_id}/revoke")
def revoke_attendance_station(
    station_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _current_admin(request, db)
    station = _get_admin_station(
        db,
        station_id=station_id,
        org_id=admin.org_id,
    )
    if station.revoked_at is None:
        station.revoked_at = datetime.utcnow()
        station.credential_hash = None
        station.pairing_token_hash = None
        station.pairing_expires_at = None
        db.commit()
        db.refresh(station)

        audit.log_operation(
            db,
            action="attendance_station.revoked",
            entity_type="attendance_station",
            entity_id=station.id,
            org_id=station.org_id,
            actor_admin_id=admin.id,
            actor_role=AdminRole.ORG_ADMIN.value,
            category="security",
            request_id=get_request_id(request),
            metadata={"station_name": station.name},
            ip=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
        db.commit()
    return {"station": _serialize_station(station)}


@station_router.get("/pair/{pairing_token}")
def pair_attendance_station(
    pairing_token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    enforce_db_rate_limit(
        db,
        bucket="attendance-station:pair",
        client_ip=get_client_ip(request),
        window_seconds=600,
        max_requests=30,
    )
    now = datetime.utcnow()
    station = (
        db.query(AttendanceStation)
        .join(Organization, Organization.id == AttendanceStation.org_id)
        .filter(
            AttendanceStation.pairing_token_hash == hash_token(pairing_token),
            AttendanceStation.pairing_expires_at > now,
            AttendanceStation.revoked_at.is_(None),
            Organization.is_active.is_(True),
            Organization.deleted_at.is_(None),
        )
        .first()
    )
    if station is None:
        raise HTTPException(
            status_code=410,
            detail="Collegamento scaduto o già utilizzato",
        )

    raw_credential = generate_token()
    station.credential_hash = hash_token(raw_credential)
    station.pairing_token_hash = None
    station.pairing_expires_at = None
    station.paired_at = now
    station.last_used_at = now
    station.paired_user_agent = (
        (request.headers.get("user-agent") or "")[:512] or None
    )
    station.paired_ip_hash = hash_identifier(get_client_ip(request))
    db.commit()
    db.refresh(station)

    audit.log_operation(
        db,
        action="attendance_station.paired",
        entity_type="attendance_station",
        entity_id=station.id,
        org_id=station.org_id,
        actor_role="attendance_station",
        category="security",
        request_id=get_request_id(request),
        metadata={"station_name": station.name},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    response = RedirectResponse(url="/scanner-presenze", status_code=303)
    _set_station_cookie(response, raw_credential)
    return response


@station_router.get("/session")
def get_attendance_station_session(
    request: Request,
    db: Session = Depends(get_db),
):
    station = _resolve_station(request, db)
    if station is None:
        raise HTTPException(
            status_code=401,
            detail="Dispositivo non autorizzato",
        )
    return {
        "station": _serialize_station(station),
        "organization": {
            "name": resolve_club_display_name(station.organization)
            or station.organization.name
            or "Associazione",
        },
    }


@station_router.post("/check-in")
def check_in_from_attendance_station(
    body: AttendanceStationCheckInBody,
    request: Request,
    db: Session = Depends(get_db),
):
    station = _resolve_station(request, db, touch=False)
    if station is None:
        raise HTTPException(
            status_code=401,
            detail="Dispositivo non autorizzato",
        )

    client_ip = get_client_ip(request)
    enforce_db_rate_limit(
        db,
        bucket="attendance-station:device",
        client_ip=str(station.id),
        window_seconds=60,
        max_requests=120,
    )
    enforce_db_rate_limit(
        db,
        bucket="attendance-station:ip",
        client_ip=client_ip,
        window_seconds=60,
        max_requests=300,
    )

    result = check_in_member_from_qr(
        db,
        org_id=station.org_id,
        qr_value=body.qr_value,
        source="qr_station",
        scanner_station_id=station.id,
    )
    station.last_used_at = datetime.utcnow()
    db.commit()

    if result.created:
        attendance = result.item
        audit.log_operation(
            db,
            action="member.attendance_station_check_in",
            entity_type="member",
            entity_id=attendance.member_id,
            org_id=station.org_id,
            actor_role="attendance_station",
            category="member",
            request_id=get_request_id(request),
            metadata={
                "attendance_id": attendance.id,
                "attendance_date": attendance.attendance_date.isoformat(),
                "checked_in_at": serialize_utc(attendance.checked_in_at),
                "card_no": attendance.card_no,
                "card_year": attendance.card_year,
                "membership_type": attendance.membership_type,
                "scanner_station_id": station.id,
                "scanner_station_name": station.name,
            },
            ip=client_ip,
            user_agent=request.headers.get("user-agent"),
        )
        db.commit()

    return {
        "created": result.created,
        "item": serialize_attendance(result.item),
    }
