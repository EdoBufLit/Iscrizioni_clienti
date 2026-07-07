from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import AdminUser, WhatsAppConnection
from app.services.org_admin_sessions import get_current_org_admin_from_request
from app.services.whatsapp_evolution import EvolutionLiteClient, normalize_phone
from app.services.whatsapp_provider import (
    WHATSAPP_PROVIDER_GREEN_API,
    WhatsAppProviderError,
    get_provider_for_connection,
    verify_webhook_secret,
    whatsapp_feature_enabled,
)
from app.services.whatsapp_sync import (
    apply_connection_snapshot,
    cleanup_own_profile_chat_names,
    create_pending_outbound_message,
    finalize_outbound_send,
    get_chat_for_connection,
    get_connection_by_provider_instance_id,
    get_messages_for_chat,
    get_or_create_chat_for_number,
    get_or_create_connection,
    list_chats_for_connection,
    mark_outbound_message_failed,
    serialize_chat,
    serialize_connection,
    serialize_message,
)
from app.services.whatsapp_webhook_outbox import enqueue_whatsapp_webhook_event

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


class OpenWhatsAppChatBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    number: str = Field(..., min_length=5, max_length=64)
    display_name: str | None = Field(default=None, max_length=255)


def _get_current_org_admin(request: Request, db: Session) -> AdminUser | None:
    return get_current_org_admin_from_request(request, db)


def _require_whatsapp_feature_enabled() -> None:
    if not whatsapp_feature_enabled():
        raise HTTPException(status_code=404, detail="Feature WhatsApp non disponibile.")


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
    provider = get_provider_for_connection(connection)
    try:
        snapshot = provider.connect(connection)
    except WhatsAppProviderError as exc:
        db.rollback()
        raise HTTPException(status_code=503 if exc.retryable else 400, detail=str(exc)) from exc

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
        provider = get_provider_for_connection(connection)
        try:
            snapshot = provider.get_qr(connection)
        except WhatsAppProviderError as exc:
            raise HTTPException(status_code=503 if exc.retryable else 400, detail=str(exc)) from exc
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
    provider = get_provider_for_connection(connection)
    try:
        provider.logout(connection)
    except WhatsAppProviderError as exc:
        raise HTTPException(status_code=503 if exc.retryable else 400, detail=str(exc)) from exc

    connection.status = "not_connected"
    connection.qr_code = None
    connection.last_error = None
    db.commit()
    db.refresh(connection)
    return {"ok": True, "connection": serialize_connection(connection)}


@router.post("/reset")
def reset_whatsapp_connection(
    request: Request,
    db: Session = Depends(get_db),
):
    _require_whatsapp_feature_enabled()
    admin = _require_org_admin_access(request, db)
    connection = _get_existing_connection(db, org_id=admin.organization.id)
    if connection is None:
        return {"ok": True, "connection": serialize_connection(None)}
    provider = get_provider_for_connection(connection)
    errors: list[str] = []
    try:
        provider.logout(connection)
    except WhatsAppProviderError as exc:
        errors.append(str(exc))
    try:
        provider.delete_instance(connection)
    except WhatsAppProviderError as exc:
        errors.append(str(exc))
    connection.status = "not_connected"
    connection.qr_code = None
    connection.last_error = "; ".join(errors)[:1000] if errors else None
    connection.connected_at = None
    db.commit()
    db.refresh(connection)
    return {"ok": True, "connection": serialize_connection(connection), "errors": errors}


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
    if cleanup_own_profile_chat_names(db, connection=connection):
        db.commit()
    items = [serialize_chat(chat) for chat in list_chats_for_connection(db, connection=connection)]
    return {"items": items, "total": len(items)}


@router.get("/contacts")
def list_whatsapp_contacts(
    request: Request,
    db: Session = Depends(get_db),
):
    _require_whatsapp_feature_enabled()
    admin = _require_org_admin_access(request, db)
    connection = _get_existing_connection(db, org_id=admin.organization.id)
    if connection is None or connection.status != "connected":
        return {"items": [], "total": 0}
    items = [
        {
            "remote_jid": chat.external_chat_id,
            "display_name": chat.display_name or normalize_phone(chat.external_chat_id) or chat.external_chat_id,
            "phone_number": normalize_phone(chat.external_chat_id),
            "profile_pic_url": None,
            "updated_at": chat.updated_at.isoformat() if chat.updated_at else None,
        }
        for chat in list_chats_for_connection(db, connection=connection)
    ]
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


@router.post("/draft-chat")
def open_whatsapp_chat(
    body: OpenWhatsAppChatBody,
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
        db.commit()
        db.refresh(chat)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"ok": True, "chat": serialize_chat(chat)}


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
    provider = get_provider_for_connection(connection)
    try:
        send_result = provider.send_text(
            connection,
            number=normalize_phone(chat.external_chat_id) or chat.external_chat_id,
            text=text,
        )
        finalize_outbound_send(pending_message, send_result)
        db.commit()
        db.refresh(pending_message)
    except WhatsAppProviderError as exc:
        mark_outbound_message_failed(pending_message, error_message=str(exc))
        db.commit()
        raise HTTPException(status_code=503 if exc.retryable else 400, detail=str(exc)) from exc

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
    provider = get_provider_for_connection(connection)
    try:
        send_result = provider.send_text(
            connection,
            number=normalized_number,
            text=text,
        )
        finalize_outbound_send(pending_message, send_result)
        db.commit()
        db.refresh(chat)
        db.refresh(pending_message)
    except WhatsAppProviderError as exc:
        mark_outbound_message_failed(pending_message, error_message=str(exc))
        db.commit()
        raise HTTPException(status_code=503 if exc.retryable else 400, detail=str(exc)) from exc

    return {
        "ok": True,
        "chat": serialize_chat(chat),
        "message": serialize_message(pending_message),
    }


@internal_router.post("/evolution")
def receive_evolution_webhook(
    payload: Any = Body(...),
    db: Session = Depends(get_db),
    x_evolution_apikey: str | None = Header(default=None, alias="X-Evolution-ApiKey"),
):
    _require_whatsapp_feature_enabled()
    if not x_evolution_apikey or x_evolution_apikey.strip() != settings.EVOLUTION_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid Evolution webhook credentials.")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Payload webhook non valido.")

    try:
        event = enqueue_whatsapp_webhook_event(db, payload=payload)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    logger.info(
        "whatsapp_evolution_webhook_enqueued event=%s instance=%s outbox_id=%s status=%s",
        event.event_name,
        event.instance_name,
        event.id,
        event.status,
    )
    return {"ok": True, "queued": True, "event_id": event.id}


@internal_router.post("/green-api")
def receive_green_api_webhook(
    payload: Any = Body(...),
    db: Session = Depends(get_db),
    x_green_api_secret: str | None = Header(default=None, alias="X-Green-Api-Secret"),
    x_webhook_secret: str | None = Header(default=None, alias="X-Webhook-Secret"),
):
    _require_whatsapp_feature_enabled()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Payload webhook non valido.")

    instance_data = payload.get("instanceData")
    instance_id = ""
    if isinstance(instance_data, dict):
        instance_id = str(instance_data.get("idInstance") or "").strip()
    if not instance_id:
        raise HTTPException(status_code=400, detail="Webhook Green API senza idInstance.")

    connection = get_connection_by_provider_instance_id(
        db,
        provider=WHATSAPP_PROVIDER_GREEN_API,
        provider_instance_id=instance_id,
    )
    if connection is not None and not verify_webhook_secret(
        x_green_api_secret or x_webhook_secret,
        connection.provider_webhook_secret_hash,
    ):
        raise HTTPException(status_code=403, detail="Invalid Green API webhook credentials.")

    try:
        event = enqueue_whatsapp_webhook_event(db, payload=payload)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    logger.info(
        "whatsapp_green_api_webhook_enqueued event=%s instance=%s outbox_id=%s status=%s",
        event.event_name,
        event.instance_name,
        event.id,
        event.status,
    )
    return {"ok": True, "queued": True, "event_id": event.id}
