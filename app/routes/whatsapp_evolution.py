from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import AdminRole, AdminUser, WhatsAppConnection
from app.services.whatsapp_evolution import (
    EvolutionApiError,
    EvolutionLiteClient,
    normalize_phone,
)
from app.services.whatsapp_sync import (
    apply_connection_snapshot,
    get_or_create_chat_for_number,
    create_pending_outbound_message,
    finalize_outbound_send,
    get_chat_for_connection,
    get_connection_by_instance_name,
    get_messages_for_chat,
    get_or_create_connection,
    ingest_evolution_webhook,
    list_chats_for_connection,
    mark_outbound_message_failed,
    serialize_chat,
    serialize_connection,
    serialize_message,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/org-admin/communications/whatsapp", tags=["whatsapp-evolution"])
internal_router = APIRouter(prefix="/api/internal/whatsapp", tags=["whatsapp-evolution-internal"])


class SendWhatsAppMessageBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(..., min_length=1, max_length=4096)


class StartWhatsAppChatBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    number: str = Field(..., min_length=5, max_length=64)
    text: str = Field(..., min_length=1, max_length=4096)
    display_name: str | None = Field(default=None, max_length=255)


def _get_current_org_admin(request: Request, db: Session) -> AdminUser | None:
    admin_id = request.session.get("org_admin_id")
    if not admin_id:
        return None
    return (
        db.query(AdminUser)
        .filter(
            AdminUser.id == admin_id,
            AdminUser.role == AdminRole.ORG_ADMIN,
            AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None),
        )
        .first()
    )


def _require_whatsapp_feature_enabled() -> None:
    if not settings.ENABLE_WHATSAPP_EVOLUTION:
        raise HTTPException(status_code=404, detail="Feature WhatsApp Evolution non disponibile.")


def _require_org_admin_access(request: Request, db: Session) -> AdminUser:
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if admin.organization is None:
        raise HTTPException(status_code=403, detail="Associazione non disponibile.")
    if not bool(admin.organization.communications_enabled):
        raise HTTPException(
            status_code=403,
            detail="Modulo Comunicazioni non attivo. Contatta ASSONAM per abilitarlo.",
        )
    return admin


def _get_existing_connection(db: Session, *, org_id: int) -> WhatsAppConnection | None:
    return (
        db.query(WhatsAppConnection)
        .filter(WhatsAppConnection.org_id == org_id)
        .first()
    )


@router.get("/connection")
def get_whatsapp_connection(
    request: Request,
    db: Session = Depends(get_db),
):
    _require_whatsapp_feature_enabled()
    admin = _require_org_admin_access(request, db)
    connection = _get_existing_connection(db, org_id=admin.organization.id)
    return serialize_connection(connection)


@router.post("/connect")
def connect_whatsapp(
    request: Request,
    db: Session = Depends(get_db),
):
    _require_whatsapp_feature_enabled()
    admin = _require_org_admin_access(request, db)
    connection = get_or_create_connection(db, admin.organization)
    db.commit()
    db.refresh(connection)
    client = EvolutionLiteClient()
    try:
        client.ensure_instance(org_id=admin.organization.id)
        snapshot = client.connect(connection.instance_name)
    except EvolutionApiError as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    db.refresh(connection)
    apply_connection_snapshot(connection, snapshot)
    db.commit()
    db.refresh(connection)
    return {"ok": True, "connection": serialize_connection(connection)}


@router.get("/qr")
def get_whatsapp_qr(
    request: Request,
    db: Session = Depends(get_db),
):
    _require_whatsapp_feature_enabled()
    admin = _require_org_admin_access(request, db)
    connection = _get_existing_connection(db, org_id=admin.organization.id)
    if connection is None:
        return serialize_connection(None)
    if not connection.qr_code and connection.status != "connected":
        client = EvolutionLiteClient()
        try:
            snapshot = client.get_qr(connection.instance_name)
        except EvolutionApiError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        apply_connection_snapshot(connection, snapshot)
        db.commit()
        db.refresh(connection)
    return serialize_connection(connection)


@router.post("/disconnect")
def disconnect_whatsapp(
    request: Request,
    db: Session = Depends(get_db),
):
    _require_whatsapp_feature_enabled()
    admin = _require_org_admin_access(request, db)
    connection = _get_existing_connection(db, org_id=admin.organization.id)
    if connection is None:
        return {"ok": True, "connection": serialize_connection(None)}
    client = EvolutionLiteClient()
    try:
        client.logout(connection.instance_name)
    except EvolutionApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    connection.status = "not_connected"
    connection.qr_code = None
    connection.last_error = None
    db.commit()
    db.refresh(connection)
    return {"ok": True, "connection": serialize_connection(connection)}


@router.get("/chats")
def list_whatsapp_chats(
    request: Request,
    db: Session = Depends(get_db),
):
    _require_whatsapp_feature_enabled()
    admin = _require_org_admin_access(request, db)
    connection = _get_existing_connection(db, org_id=admin.organization.id)
    if connection is None:
        return {"items": [], "total": 0}
    items = [serialize_chat(chat) for chat in list_chats_for_connection(db, connection=connection)]
    return {"items": items, "total": len(items)}


@router.get("/chats/{chat_id}/messages")
def list_whatsapp_messages(
    chat_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    _require_whatsapp_feature_enabled()
    admin = _require_org_admin_access(request, db)
    connection = _get_existing_connection(db, org_id=admin.organization.id)
    if connection is None:
        raise HTTPException(status_code=404, detail="Chat non trovata.")
    chat = get_chat_for_connection(db, connection=connection, chat_id=chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat non trovata.")
    items = [serialize_message(message) for message in get_messages_for_chat(db, chat=chat)]
    db.commit()
    return {
        "chat": serialize_chat(chat),
        "items": items,
        "total": len(items),
    }


@router.post("/chats/{chat_id}/messages")
def send_whatsapp_message(
    chat_id: int,
    body: SendWhatsAppMessageBody,
    request: Request,
    db: Session = Depends(get_db),
):
    _require_whatsapp_feature_enabled()
    admin = _require_org_admin_access(request, db)
    connection = _get_existing_connection(db, org_id=admin.organization.id)
    if connection is None:
        raise HTTPException(status_code=409, detail="Connessione WhatsApp non configurata.")
    if connection.status != "connected":
        raise HTTPException(status_code=409, detail="WhatsApp non connesso.")
    chat = get_chat_for_connection(db, connection=connection, chat_id=chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat non trovata.")

    text = body.text.strip()
    pending_message = create_pending_outbound_message(
        db,
        connection=connection,
        chat=chat,
        text_body=text,
    )
    client = EvolutionLiteClient()
    try:
        send_result = client.send_text(
            connection.instance_name,
            number=normalize_phone(chat.external_chat_id) or chat.external_chat_id,
            text=text,
        )
        finalize_outbound_send(pending_message, send_result)
        db.commit()
        db.refresh(pending_message)
    except EvolutionApiError as exc:
        mark_outbound_message_failed(pending_message, error_message=str(exc))
        db.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"ok": True, "message": serialize_message(pending_message)}


@router.post("/outbound")
def start_whatsapp_chat(
    body: StartWhatsAppChatBody,
    request: Request,
    db: Session = Depends(get_db),
):
    _require_whatsapp_feature_enabled()
    admin = _require_org_admin_access(request, db)
    connection = _get_existing_connection(db, org_id=admin.organization.id)
    if connection is None:
        raise HTTPException(status_code=409, detail="Connessione WhatsApp non configurata.")
    if connection.status != "connected":
        raise HTTPException(status_code=409, detail="WhatsApp non connesso.")

    text = body.text.strip()
    normalized_number = normalize_phone(body.number)
    if not normalized_number:
        raise HTTPException(status_code=400, detail="Numero WhatsApp non valido.")

    try:
        chat = get_or_create_chat_for_number(
            db,
            connection=connection,
            number=normalized_number,
            display_name=body.display_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    pending_message = create_pending_outbound_message(
        db,
        connection=connection,
        chat=chat,
        text_body=text,
    )
    client = EvolutionLiteClient()
    try:
        send_result = client.send_text(
            connection.instance_name,
            number=normalized_number,
            text=text,
        )
        finalize_outbound_send(pending_message, send_result)
        db.commit()
        db.refresh(chat)
        db.refresh(pending_message)
    except EvolutionApiError as exc:
        mark_outbound_message_failed(pending_message, error_message=str(exc))
        db.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "ok": True,
        "chat": serialize_chat(chat),
        "message": serialize_message(pending_message),
    }


@internal_router.post("/evolution")
async def receive_evolution_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_evolution_apikey: str | None = Header(default=None, alias="X-Evolution-ApiKey"),
):
    _require_whatsapp_feature_enabled()
    if not x_evolution_apikey or x_evolution_apikey.strip() != settings.EVOLUTION_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid Evolution webhook credentials.")

    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Payload webhook non valido.")

    ingest_evolution_webhook(db, payload=payload)
    db.commit()
    logger.info(
        "whatsapp_evolution_webhook_processed event=%s instance=%s",
        payload.get("event"),
        payload.get("instance"),
    )
    return {"ok": True}
