"""Central communications are available to every affiliate, outside campaign plans."""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    AdminUser, AffiliateCommunication, AffiliateCommunicationRead,
    AffiliateCommunicationRecipient, OrgAdminNotification,
)
from app.services.affiliate_communications import (
    audience_admins, list_eligible_organizations, preview_audience,
    record_communication_read, resolve_audience, send_communication,
    serialize_communication, serialize_recipient,
)
from app.services.org_admin_sessions import get_current_org_admin_from_request
from app.services.super_admin_auth import resolve_super_admin_session

super_admin_router = APIRouter(prefix="/api/super-admin/communications", tags=["Central communications"])
org_admin_router = APIRouter(prefix="/api/org-admin/communications/inbox", tags=["Central communications"])


class CommunicationDraft(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=20000)
    audience: Literal["all", "selected"]
    organization_ids: list[int] = Field(default_factory=list, max_length=10000)

    @field_validator("subject", "body", mode="before")
    @classmethod
    def clean_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("subject")
    @classmethod
    def subject_single_line(cls, value: str) -> str:
        if "\n" in value or "\r" in value:
            raise ValueError("L'oggetto deve essere su una sola riga.")
        return value

    @model_validator(mode="after")
    def validate_selection(self):
        if self.audience == "selected" and not self.organization_ids:
            raise ValueError("Seleziona almeno un'associazione.")
        if self.audience == "all" and self.organization_ids:
            raise ValueError("Per tutte le associazioni, lascia vuota la selezione manuale.")
        if any(org_id < 1 for org_id in self.organization_ids):
            raise ValueError("Selezione associazioni non valida.")
        self.organization_ids = sorted(set(self.organization_ids))
        return self


class CommunicationSend(CommunicationDraft):
    idempotency_key: str = Field(min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_.:-]+$")
    expected_organization_ids: list[int] | None = Field(default=None, max_length=10000)


def _require_org_admin(request: Request, db: Session) -> AdminUser:
    admin = get_current_org_admin_from_request(request, db)
    if admin is None:
        raise HTTPException(401, "Not authenticated")
    org = admin.organization
    if org is None or org.deleted_at is not None or not org.is_active:
        raise HTTPException(403, "Associazione non attiva.")
    return admin


def _paged(items: list, total: int, page: int, page_size: int) -> dict:
    return {"items": items, "total": total, "page": page, "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size)}


@super_admin_router.get("/recipients")
def recipients(request: Request, db: Session = Depends(get_db)):
    resolve_super_admin_session(request, db)
    organizations = list_eligible_organizations(db)
    admins = audience_admins(db, organizations)
    return {"items": [serialize_recipient(org, admins[org.id]) for org in organizations],
            "total": len(organizations)}


@super_admin_router.post("/preview")
def preview(body: CommunicationDraft, request: Request, db: Session = Depends(get_db)):
    resolve_super_admin_session(request, db)
    return preview_audience(db, resolve_audience(db, body.audience, body.organization_ids))


@super_admin_router.post("")
def send(body: CommunicationSend, request: Request, db: Session = Depends(get_db)):
    admin = resolve_super_admin_session(request, db).admin
    item, replayed = send_communication(db, admin=admin, request=request, **body.model_dump())
    return {"item": serialize_communication(item), "replayed": replayed}


@super_admin_router.get("")
def history(
    request: Request, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    resolve_super_admin_session(request, db)
    query = db.query(AffiliateCommunication)
    total = query.count()
    items = query.order_by(AffiliateCommunication.created_at.desc(), AffiliateCommunication.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return _paged([serialize_communication(item) for item in items], total, page, page_size)


@super_admin_router.get("/{communication_id}")
def detail(communication_id: int, request: Request, db: Session = Depends(get_db)):
    resolve_super_admin_session(request, db)
    item = db.get(AffiliateCommunication, communication_id)
    if item is None:
        raise HTTPException(404, "Comunicazione non trovata.")
    serialized = serialize_communication(item)
    serialized["recipients"] = [{
        "id": recipient.id,
        "organization_id": recipient.organization_id,
        "organization_name": recipient.organization_name,
        "admin_count": recipient.admin_count, "email_count": recipient.email_count,
    } for recipient in db.query(AffiliateCommunicationRecipient).filter_by(communication_id=item.id).order_by(AffiliateCommunicationRecipient.organization_name.asc()).all()]
    return {"item": serialized}


def _inbox_query(db: Session, admin: AdminUser):
    return db.query(AffiliateCommunication, AffiliateCommunicationRead.read_at).join(
        AffiliateCommunicationRecipient,
        AffiliateCommunicationRecipient.communication_id == AffiliateCommunication.id,
    ).outerjoin(AffiliateCommunicationRead, and_(
        AffiliateCommunicationRead.communication_id == AffiliateCommunication.id,
        AffiliateCommunicationRead.admin_user_id == admin.id,
    )).filter(AffiliateCommunicationRecipient.organization_id == admin.org_id)


def _serialize_inbox(item: AffiliateCommunication, read_at: datetime | None) -> dict:
    # Audience counts and sender account details belong to the central admin only.
    result = serialize_communication(item)
    for key in ("audience", "recipient_count", "email_count", "notification_count", "created_by_email"):
        result.pop(key)
    result.update(is_read=read_at is not None, read_at=read_at.isoformat() + "Z" if read_at else None)
    return result


@org_admin_router.get("")
def inbox(
    request: Request, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    unread_only: bool = False, db: Session = Depends(get_db),
):
    admin = _require_org_admin(request, db)
    query = _inbox_query(db, admin)
    unread_count = query.filter(AffiliateCommunicationRead.read_at.is_(None)).count()
    if unread_only:
        query = query.filter(AffiliateCommunicationRead.read_at.is_(None))
    total = query.count()
    items = query.order_by(AffiliateCommunication.created_at.desc(), AffiliateCommunication.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {**_paged([_serialize_inbox(item, read_at) for item, read_at in items], total, page, page_size),
            "unread_count": unread_count}


@org_admin_router.get("/{communication_id}")
def inbox_detail(communication_id: int, request: Request, db: Session = Depends(get_db)):
    admin = _require_org_admin(request, db)
    row = _inbox_query(db, admin).filter(AffiliateCommunication.id == communication_id).first()
    if row is None:
        raise HTTPException(404, "Comunicazione non trovata.")
    return {"item": _serialize_inbox(*row)}


@org_admin_router.post("/{communication_id}/read")
def read(communication_id: int, request: Request, db: Session = Depends(get_db)):
    admin = _require_org_admin(request, db)
    row = _inbox_query(db, admin).filter(AffiliateCommunication.id == communication_id).first()
    if row is None:
        raise HTTPException(404, "Comunicazione non trovata.")
    now = datetime.utcnow()
    record_communication_read(db, communication_id=communication_id, admin_user_id=admin.id, now=now)
    db.query(OrgAdminNotification).filter(
        OrgAdminNotification.communication_id == communication_id,
        OrgAdminNotification.admin_user_id == admin.id,
        OrgAdminNotification.org_id == admin.org_id,
        OrgAdminNotification.is_read.is_(False),
    ).update({OrgAdminNotification.is_read: True, OrgAdminNotification.read_at: now}, synchronize_session=False)
    db.commit()
    read_row = db.get(AffiliateCommunicationRead, (communication_id, admin.id))
    return {"item": _serialize_inbox(row[0], read_row.read_at)}
