from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import html
import json
import logging
import uuid
from typing import Any

from sqlalchemy import or_
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.log_redaction import hash_identifier
from app.models import (
    Booking,
    BookingEvent,
    BookingStatus,
    Organization,
    WhatsAppChat,
    WhatsAppConnection,
    WhatsAppMessage,
)
from app.services.booking_customer_actions import apply_booking_text_reply
from app.services.whatsapp_evolution import (
    EvolutionChat,
    EvolutionContact,
    EvolutionConnectionSnapshot,
    EvolutionHistoryMessage,
    EvolutionLiteClient,
    EvolutionSendTextResult,
    build_evolution_instance_name,
    canonicalize_whatsapp_chat_id,
    is_whatsapp_group_jid,
    normalize_phone,
    resolve_connection_status,
)
from app.services.whatsapp_provider import (
    WHATSAPP_PROVIDER_GREEN_API,
    WhatsAppProviderError,
    default_whatsapp_provider_name,
    ensure_connection_provider_defaults,
    get_provider_for_connection,
    provider_name_for_connection,
)

logger = logging.getLogger(__name__)

OUTBOUND_STATUS_QUEUED = "queued"
OUTBOUND_STATUS_SENDING = "sending"
OUTBOUND_SENT_STATUSES = ("sent", "delivered", "read")


def utcnow() -> datetime:
    return datetime.utcnow()


def get_or_create_connection(db: Session, org: Organization) -> WhatsAppConnection:
    connection = (
        db.query(WhatsAppConnection)
        .filter(WhatsAppConnection.org_id == org.id)
        .first()
    )
    if connection is not None:
        expected_name = build_evolution_instance_name(org.id)
        if not connection.instance_name:
            connection.instance_name = expected_name
        ensure_connection_provider_defaults(connection)
        return connection

    provider = default_whatsapp_provider_name()
    connection = WhatsAppConnection(
        org_id=org.id,
        instance_name=build_evolution_instance_name(org.id),
        provider=provider,
        provider_api_url=settings.GREEN_API_BASE_URL if provider == WHATSAPP_PROVIDER_GREEN_API else None,
        status="not_connected",
    )
    db.add(connection)
    db.flush()
    return connection


def get_connection_by_instance_name(
    db: Session,
    *,
    instance_name: str,
) -> WhatsAppConnection | None:
    return (
        db.query(WhatsAppConnection)
        .filter(WhatsAppConnection.instance_name == instance_name)
        .first()
    )


def get_connection_by_provider_instance_id(
    db: Session,
    *,
    provider: str,
    provider_instance_id: str,
) -> WhatsAppConnection | None:
    normalized_instance_id = str(provider_instance_id or "").strip()
    if not normalized_instance_id:
        return None
    return (
        db.query(WhatsAppConnection)
        .filter(
            WhatsAppConnection.provider == provider,
            WhatsAppConnection.provider_instance_id == normalized_instance_id,
        )
        .order_by(WhatsAppConnection.id.desc())
        .first()
    )


def apply_connection_snapshot(
    connection: WhatsAppConnection,
    snapshot: EvolutionConnectionSnapshot,
    *,
    event_time: datetime | None = None,
) -> None:
    effective_qr_code = snapshot.qr_code or connection.qr_code
    next_status = resolve_connection_status(
        snapshot.raw_state,
        has_qr=bool(effective_qr_code),
        last_error=snapshot.last_error,
    )
    connection.status = next_status
    connection.phone_number = snapshot.phone_number or connection.phone_number
    connection.profile_name = snapshot.profile_name or connection.profile_name
    connection.last_error = snapshot.last_error
    connection.last_event_at = event_time or utcnow()

    if next_status == "connected":
        connection.connected_at = connection.connected_at or snapshot.connected_at or utcnow()
        connection.qr_code = None
    elif effective_qr_code:
        connection.qr_code = effective_qr_code
    elif next_status == "not_connected":
        connection.qr_code = None


def serialize_connection(connection: WhatsAppConnection | None) -> dict[str, Any]:
    if connection is None:
        return {
            "status": "not_connected",
            "provider": default_whatsapp_provider_name(),
            "provider_instance_id": None,
            "provider_configured": False,
            "phone_number": None,
            "profile_name": None,
            "has_qr": False,
            "qr_code": None,
            "last_error": None,
            "last_healthcheck_at": None,
            "updated_at": None,
        }
    provider = provider_name_for_connection(connection)
    return {
        "status": connection.status or "not_connected",
        "provider": provider,
        "provider_instance_id": connection.provider_instance_id,
        "provider_configured": bool(
            provider != WHATSAPP_PROVIDER_GREEN_API
            or (connection.provider_instance_id and connection.provider_token_encrypted)
        ),
        "phone_number": connection.phone_number,
        "profile_name": connection.profile_name,
        "has_qr": bool(connection.qr_code),
        "qr_code": connection.qr_code,
        "last_error": connection.last_error,
        "last_healthcheck_at": (
            connection.last_healthcheck_at.isoformat()
            if connection.last_healthcheck_at
            else None
        ),
        "updated_at": connection.updated_at.isoformat() if connection.updated_at else None,
    }


def serialize_chat(chat: WhatsAppChat) -> dict[str, Any]:
    return {
        "id": chat.id,
        "display_name": chat.display_name or normalize_phone(chat.external_chat_id) or chat.external_chat_id,
        "external_chat_id": chat.external_chat_id,
        "last_message_text": chat.last_message_text,
        "last_message_at": chat.last_message_at.isoformat() if chat.last_message_at else None,
        "unread_count": int(chat.unread_count or 0),
    }


def serialize_message(message: WhatsAppMessage) -> dict[str, Any]:
    return {
        "id": message.id,
        "external_message_id": message.external_message_id,
        "direction": message.direction,
        "status": message.status,
        "sender_phone": message.sender_phone,
        "recipient_phone": message.recipient_phone,
        "text_body": message.text_body,
        "send_attempts": int(message.send_attempts or 0),
        "next_retry_at": message.next_retry_at.isoformat() if message.next_retry_at else None,
        "last_error": message.last_error,
        "fallback_email_to": message.fallback_email_to,
        "fallback_email_outbox_id": message.fallback_email_outbox_id,
        "sent_at": message.sent_at.isoformat() if message.sent_at else None,
        "delivered_at": message.delivered_at.isoformat() if message.delivered_at else None,
        "read_at": message.read_at.isoformat() if message.read_at else None,
        "failed_at": message.failed_at.isoformat() if message.failed_at else None,
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "updated_at": message.updated_at.isoformat() if message.updated_at else None,
    }


def list_chats_for_connection(db: Session, *, connection: WhatsAppConnection) -> list[WhatsAppChat]:
    return (
        db.query(WhatsAppChat)
        .filter(WhatsAppChat.connection_id == connection.id)
        .order_by(WhatsAppChat.last_message_at.desc(), WhatsAppChat.id.desc())
        .all()
    )


def get_chat_for_connection(
    db: Session,
    *,
    connection: WhatsAppConnection,
    chat_id: int,
) -> WhatsAppChat | None:
    return (
        db.query(WhatsAppChat)
        .filter(
            WhatsAppChat.id == chat_id,
            WhatsAppChat.connection_id == connection.id,
            WhatsAppChat.org_id == connection.org_id,
        )
        .first()
    )


def build_external_chat_id_for_number(number: str) -> str:
    external_chat_id = canonicalize_whatsapp_chat_id(number)
    if not external_chat_id:
        raise ValueError("Numero WhatsApp non valido.")
    return external_chat_id


def get_or_create_chat_for_number(
    db: Session,
    *,
    connection: WhatsAppConnection,
    number: str,
    display_name: str | None = None,
) -> WhatsAppChat:
    external_chat_id = build_external_chat_id_for_number(number)
    fallback_name = normalize_phone(number) or external_chat_id
    return _get_or_create_chat(
        db,
        connection=connection,
        external_chat_id=external_chat_id,
        display_name=(display_name or "").strip() or fallback_name,
    )


def cleanup_own_profile_chat_names(db: Session, *, connection: WhatsAppConnection) -> int:
    cleaned_count = 0
    chats = (
        db.query(WhatsAppChat)
        .filter(WhatsAppChat.connection_id == connection.id)
        .all()
    )
    for chat in chats:
        if not _is_own_connection_display_name(connection, chat.display_name):
            continue
        chat.display_name = _fallback_chat_display_name(chat.external_chat_id)
        cleaned_count += 1
    return cleaned_count


def sync_contacts_into_chats(
    db: Session,
    *,
    connection: WhatsAppConnection,
    contacts: list[EvolutionContact],
) -> list[WhatsAppChat]:
    synced: list[WhatsAppChat] = []
    for contact in contacts:
        external_chat_id = canonicalize_whatsapp_chat_id(contact.remote_jid)
        if not external_chat_id or is_whatsapp_group_jid(external_chat_id):
            continue
        display_name = _safe_chat_display_name(
            connection,
            contact.display_name or contact.phone_number or external_chat_id,
            external_chat_id,
        )
        chat = _get_or_create_chat(
            db,
            connection=connection,
            external_chat_id=external_chat_id,
            display_name=display_name,
        )
        if _should_replace_display_name(chat.display_name, display_name):
            chat.display_name = display_name
        synced.append(chat)
    return synced


def sync_remote_chats_into_store(
    db: Session,
    *,
    connection: WhatsAppConnection,
    chats: list[EvolutionChat],
) -> list[WhatsAppChat]:
    synced: list[WhatsAppChat] = []
    for remote_chat in chats:
        external_chat_id = canonicalize_whatsapp_chat_id(remote_chat.remote_jid)
        if not external_chat_id or is_whatsapp_group_jid(external_chat_id):
            continue
        display_name = _safe_chat_display_name(
            connection,
            remote_chat.display_name or normalize_phone(external_chat_id) or external_chat_id,
            external_chat_id,
        )
        chat = _get_or_create_chat(
            db,
            connection=connection,
            external_chat_id=external_chat_id,
            display_name=display_name,
        )
        if _should_replace_display_name(chat.display_name, display_name):
            chat.display_name = display_name
        if remote_chat.last_message_text:
            chat.last_message_text = remote_chat.last_message_text
        if remote_chat.last_message_at is not None:
            chat.last_message_at = remote_chat.last_message_at
        synced.append(chat)
    return synced


def sync_remote_messages_into_store(
    db: Session,
    *,
    connection: WhatsAppConnection,
    chat: WhatsAppChat,
    messages: list[EvolutionHistoryMessage],
) -> list[WhatsAppMessage]:
    synced: list[WhatsAppMessage] = []
    for remote_message in messages:
        payload = dict(remote_message.raw)
        key = payload.get("key")
        if not isinstance(key, dict):
            continue
        if not isinstance(key.get("remoteJid"), str) or not key.get("remoteJid"):
            key = {**key, "remoteJid": chat.external_chat_id}
            payload["key"] = key
        message_context = _build_message_context(
            connection=connection,
            payload=payload,
            event_name="messages.upsert",
            fallback_time=remote_message.created_at or utcnow(),
        )
        if message_context is None:
            continue
        message_context["external_chat_id"] = chat.external_chat_id
        existing = _find_existing_message(
            db,
            connection=connection,
            external_message_id=message_context["external_message_id"],
            dedupe_key=message_context["dedupe_key"],
        )
        is_new = existing is None
        message = existing or WhatsAppMessage(
            org_id=connection.org_id,
            connection_id=connection.id,
            chat_id=chat.id,
            dedupe_key=message_context["dedupe_key"],
            direction=message_context["direction"],
            status=message_context["status"],
            created_at=message_context["created_at"],
        )
        if is_new:
            db.add(message)

        message.chat_id = chat.id
        message.external_message_id = message_context["external_message_id"]
        message.sender_phone = message_context["sender_phone"]
        message.recipient_phone = message_context["recipient_phone"]
        message.direction = message_context["direction"]
        message.status = message_context["status"]
        message.text_body = message_context["text_body"]
        message.sent_at = message_context["created_at"]
        if message.status == "delivered":
            message.delivered_at = message.delivered_at or message_context["created_at"]
        if message.status == "read":
            message.delivered_at = message.delivered_at or message_context["created_at"]
            message.read_at = message.read_at or message_context["created_at"]
        if message.status == "failed":
            message.failed_at = message.failed_at or message_context["created_at"]

        _touch_chat(
            chat,
            text_body=message.text_body,
            message_at=message.sent_at or utcnow(),
            increment_unread=False,
        )
        synced.append(message)

    return synced


def get_messages_for_chat(
    db: Session,
    *,
    chat: WhatsAppChat,
    mark_as_read: bool = True,
) -> list[WhatsAppMessage]:
    messages = (
        db.query(WhatsAppMessage)
        .filter(WhatsAppMessage.chat_id == chat.id)
        .order_by(WhatsAppMessage.created_at.asc(), WhatsAppMessage.id.asc())
        .all()
    )
    if mark_as_read and int(chat.unread_count or 0) > 0:
        chat.unread_count = 0
    return messages


def create_pending_outbound_message(
    db: Session,
    *,
    connection: WhatsAppConnection,
    chat: WhatsAppChat,
    text_body: str,
    fallback_email_to: str | None = None,
    fallback_email_subject: str | None = None,
) -> WhatsAppMessage:
    recipient_phone = normalize_phone(chat.external_chat_id)
    message = WhatsAppMessage(
        org_id=connection.org_id,
        connection_id=connection.id,
        chat_id=chat.id,
        dedupe_key=f"pending-send:{uuid.uuid4().hex}",
        direction="outbound",
        status="pending",
        sender_phone=connection.phone_number,
        recipient_phone=recipient_phone,
        text_body=text_body,
        fallback_email_to=(fallback_email_to or "").strip() or None,
        fallback_email_subject=(fallback_email_subject or "").strip() or None,
        sent_at=utcnow(),
    )
    db.add(message)
    db.flush()
    _touch_chat(
        chat,
        text_body=text_body,
        message_at=message.sent_at or utcnow(),
        increment_unread=False,
    )
    return message


def queue_outbound_message(
    db: Session,
    *,
    connection: WhatsAppConnection,
    chat: WhatsAppChat,
    text_body: str,
    fallback_email_to: str | None = None,
    fallback_email_subject: str | None = None,
) -> WhatsAppMessage:
    message = create_pending_outbound_message(
        db,
        connection=connection,
        chat=chat,
        text_body=text_body,
        fallback_email_to=fallback_email_to,
        fallback_email_subject=fallback_email_subject,
    )
    message.status = OUTBOUND_STATUS_QUEUED
    message.sent_at = None
    message.next_retry_at = None
    db.flush()
    return message


def process_queued_outbound_messages(
    db: Session,
    *,
    now: datetime | None = None,
    limit: int | None = None,
) -> dict[str, int]:
    current = _as_naive_utc(now or utcnow())
    batch_size = max(1, int(limit or settings.WHATSAPP_OUTBOUND_BATCH_SIZE or 20))
    min_interval = max(0, int(settings.WHATSAPP_OUTBOUND_MIN_INTERVAL_SECONDS or 0))
    stats = {
        "checked": 0,
        "sent": 0,
        "skipped": 0,
        "failed": 0,
        "retry_scheduled": 0,
        "fallback_email": 0,
    }

    queued_messages = (
        db.query(WhatsAppMessage)
        .options(
            joinedload(WhatsAppMessage.connection),
            joinedload(WhatsAppMessage.chat),
        )
        .filter(
            WhatsAppMessage.direction == "outbound",
            WhatsAppMessage.status == OUTBOUND_STATUS_QUEUED,
            or_(
                WhatsAppMessage.next_retry_at.is_(None),
                WhatsAppMessage.next_retry_at <= current,
            ),
        )
        .order_by(WhatsAppMessage.created_at.asc(), WhatsAppMessage.id.asc())
        .limit(batch_size)
        .all()
    )
    sent_connection_ids: set[int] = set()
    for message in queued_messages:
        stats["checked"] += 1
        connection = message.connection
        if connection is None or connection.status != "connected":
            if _fail_or_fallback_outbound_message(
                db,
                message,
                error_message="connection_not_connected",
                current=current,
                retryable=False,
            ):
                stats["fallback_email"] += 1
            else:
                stats["failed"] += 1
            db.commit()
            continue
        if min_interval > 0:
            if connection.id in sent_connection_ids:
                stats["skipped"] += 1
                continue
            last_sent_at = _last_successful_outbound_at(
                db,
                connection_id=connection.id,
                exclude_message_id=message.id,
            )
            if last_sent_at is not None and (current - last_sent_at).total_seconds() < min_interval:
                stats["skipped"] += 1
                continue
        recipient_phone = normalize_phone(message.recipient_phone or getattr(message.chat, "external_chat_id", None))
        text_body = str(message.text_body or "")
        if not recipient_phone or not text_body.strip():
            mark_outbound_message_failed(message, error_message="missing_recipient_or_text")
            db.commit()
            stats["failed"] += 1
            continue

        message.status = OUTBOUND_STATUS_SENDING
        db.flush()
        try:
            provider = get_provider_for_connection(connection)
            send_result = provider.send_text(
                connection,
                number=recipient_phone,
                text=text_body,
            )
            message.sent_at = current
            finalize_outbound_send(message, send_result)
            message.send_attempts = int(message.send_attempts or 0) + 1
            message.last_error = None
            message.next_retry_at = None
            db.commit()
            sent_connection_ids.add(connection.id)
            stats["sent"] += 1
        except WhatsAppProviderError as exc:
            fallback_sent = _fail_or_fallback_outbound_message(
                db,
                message,
                error_message=str(exc),
                current=current,
                retryable=exc.retryable,
            )
            db.commit()
            if fallback_sent:
                stats["fallback_email"] += 1
            elif message.status == OUTBOUND_STATUS_QUEUED:
                stats["retry_scheduled"] += 1
            else:
                stats["failed"] += 1
            logger.warning(
                "whatsapp_outbound_queue_send_failed message_id=%s connection_id=%s error_type=%s retryable=%s",
                message.id,
                connection.id,
                type(exc).__name__,
                exc.retryable,
            )
        except Exception:
            db.rollback()
            logger.exception(
                "whatsapp_outbound_queue_unexpected_error message_id=%s connection_id=%s",
                getattr(message, "id", None),
                getattr(connection, "id", None),
            )
            stats["failed"] += 1
    return stats


def process_queued_outbound_messages_once(
    *,
    now: datetime | None = None,
    limit: int | None = None,
) -> dict[str, int]:
    from app.db import SessionLocal

    with SessionLocal() as db:
        return process_queued_outbound_messages(db, now=now, limit=limit)


def _last_successful_outbound_at(
    db: Session,
    *,
    connection_id: int,
    exclude_message_id: int,
) -> datetime | None:
    message = (
        db.query(WhatsAppMessage)
        .filter(
            WhatsAppMessage.connection_id == connection_id,
            WhatsAppMessage.id != exclude_message_id,
            WhatsAppMessage.direction == "outbound",
            WhatsAppMessage.sent_at.isnot(None),
            WhatsAppMessage.status.in_(OUTBOUND_SENT_STATUSES),
        )
        .order_by(WhatsAppMessage.sent_at.desc(), WhatsAppMessage.id.desc())
        .first()
    )
    return message.sent_at if message is not None else None


def _as_naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def finalize_outbound_send(
    pending_message: WhatsAppMessage,
    send_result: EvolutionSendTextResult | Any,
) -> None:
    external_message_id = send_result.external_message_id
    if external_message_id:
        connection = getattr(pending_message, "connection", None)
        instance_name = (
            getattr(connection, "instance_name", None)
            or getattr(connection, "provider_instance_id", None)
            or f"connection-{pending_message.connection_id}"
        )
        pending_message.external_message_id = external_message_id
        pending_message.dedupe_key = _build_message_dedupe_key(
            instance_name=instance_name,
            external_message_id=external_message_id,
            payload=None,
        )
    pending_message.status = _normalize_message_status(send_result.status)
    pending_message.failed_at = None
    pending_message.last_error = None
    pending_message.next_retry_at = None


def mark_outbound_message_failed(
    pending_message: WhatsAppMessage,
    *,
    error_message: str,
) -> None:
    pending_message.status = "failed"
    pending_message.failed_at = utcnow()
    pending_message.last_error = (error_message or "").strip()[:4000] or None
    pending_message.next_retry_at = None
    if error_message and not pending_message.text_body:
        pending_message.text_body = ""


def _fail_or_fallback_outbound_message(
    db: Session,
    pending_message: WhatsAppMessage,
    *,
    error_message: str,
    current: datetime,
    retryable: bool,
) -> bool:
    attempts = int(pending_message.send_attempts or 0) + 1
    pending_message.send_attempts = attempts
    pending_message.last_error = (error_message or "").strip()[:4000] or None
    max_attempts = max(1, int(settings.WHATSAPP_OUTBOUND_MAX_ATTEMPTS or 3))
    if retryable and attempts < max_attempts:
        pending_message.status = OUTBOUND_STATUS_QUEUED
        pending_message.failed_at = None
        pending_message.next_retry_at = current + _outbound_retry_delay(attempts)
        return False

    fallback_sent = _enqueue_outbound_fallback_email(
        db,
        pending_message,
        error_message=error_message,
    )
    mark_outbound_message_failed(pending_message, error_message=error_message)
    return fallback_sent


def _outbound_retry_delay(attempts: int) -> timedelta:
    base_seconds = max(5, int(settings.WHATSAPP_OUTBOUND_RETRY_BASE_SECONDS or 60))
    return timedelta(seconds=min(base_seconds * (2 ** max(0, attempts - 1)), 3600))


def _enqueue_outbound_fallback_email(
    db: Session,
    pending_message: WhatsAppMessage,
    *,
    error_message: str,
) -> bool:
    to_email = (pending_message.fallback_email_to or "").strip()
    if not to_email or pending_message.fallback_email_outbox_id:
        return False
    try:
        from app.services.email_outbox import build_email_payload, enqueue_email
        from app.services.email_sender import build_sender_payload

        association = (
            db.query(Organization)
            .filter(Organization.id == pending_message.org_id)
            .first()
        )
        text_body = str(pending_message.text_body or "").strip()
        if not text_body:
            return False
        subject = (
            pending_message.fallback_email_subject
            or f"Messaggio da {getattr(association, 'name', None) or 'associazione'}"
        )
        outbox_id = enqueue_email(
            db,
            email_type="whatsapp_fallback",
            to_email=to_email,
            subject=subject,
            payload=build_email_payload(
                text_body=text_body,
                html_body=f"<p>{html.escape(text_body).replace(chr(10), '<br>')}</p>",
                sender=build_sender_payload(mode="association", association=association),
                meta={
                    "whatsapp_message_id": pending_message.id,
                    "association_id": pending_message.org_id,
                    "whatsapp_error": error_message,
                },
            ),
            priority=4,
            dedupe_key=f"whatsapp-fallback:{pending_message.id}",
        )
        pending_message.fallback_email_outbox_id = outbox_id
        return True
    except Exception:
        logger.exception(
            "whatsapp_outbound_fallback_email_enqueue_failed message_id=%s",
            pending_message.id,
        )
        return False


def ingest_whatsapp_webhook(
    db: Session,
    *,
    payload: dict[str, Any],
) -> None:
    if isinstance(payload, dict) and payload.get("typeWebhook"):
        ingest_green_api_webhook(db, payload=payload)
        return
    ingest_evolution_webhook(db, payload=payload)


def ingest_green_api_webhook(
    db: Session,
    *,
    payload: dict[str, Any],
) -> None:
    event_name = str(payload.get("typeWebhook") or "").strip()
    instance_data = payload.get("instanceData")
    instance_id = ""
    if isinstance(instance_data, dict):
        instance_id = str(instance_data.get("idInstance") or "").strip()
    if not event_name or not instance_id:
        return

    connection = get_connection_by_provider_instance_id(
        db,
        provider=WHATSAPP_PROVIDER_GREEN_API,
        provider_instance_id=instance_id,
    )
    if connection is None:
        logger.warning(
            "whatsapp_green_api_unknown_instance instance_hash=%s event=%s",
            hash_identifier(instance_id),
            event_name,
        )
        return

    event_time = _timestamp_to_datetime(payload.get("timestamp")) or utcnow()
    normalized_event = event_name.strip().lower()
    if normalized_event == "stateinstancechanged":
        state = str(payload.get("stateInstance") or "").strip()
        apply_connection_snapshot(
            connection,
            EvolutionConnectionSnapshot(
                raw_state=state,
                status=resolve_connection_status(
                    state,
                    has_qr=bool(connection.qr_code),
                    last_error=None,
                ),
                qr_code=None,
                phone_number=connection.phone_number,
                profile_name=connection.profile_name,
                last_error=(
                    f"Stato Green API: {state}"
                    if state.lower() in {"blocked", "yellowcard", "suspended"}
                    else None
                ),
                connected_at=event_time if state.lower() == "authorized" else None,
                raw=payload,
            ),
            event_time=event_time,
        )
        return

    if normalized_event in {
        "incomingmessagereceived",
        "outgoingapimessagereceived",
        "outgoingmessagereceived",
    }:
        transformed_message = _transform_green_message_payload(
            payload,
            from_me=normalized_event != "incomingmessagereceived",
        )
        if transformed_message is None:
            return
        _ingest_message_batch(
            db,
            connection=connection,
            event_name="send.message" if transformed_message.get("fromMe") else "messages.upsert",
            data=transformed_message,
            event_time=event_time,
        )


def _transform_green_message_payload(
    payload: dict[str, Any],
    *,
    from_me: bool,
) -> dict[str, Any] | None:
    sender_data = payload.get("senderData")
    if not isinstance(sender_data, dict):
        sender_data = {}
    message_data = payload.get("messageData")
    if not isinstance(message_data, dict):
        message_data = {}

    chat_id = ""
    for candidate in (
        sender_data.get("chatId"),
        sender_data.get("sender"),
        payload.get("chatId"),
    ):
        if isinstance(candidate, str) and candidate.strip():
            chat_id = candidate.strip()
            break
    if not chat_id:
        return None

    text_body = _extract_green_text_body(message_data)
    external_message_id = str(payload.get("idMessage") or "").strip() or None
    return {
        "key": {
            "remoteJid": chat_id,
            "id": external_message_id,
            "fromMe": from_me,
        },
        "id": external_message_id,
        "chatId": chat_id,
        "sender": sender_data.get("sender"),
        "senderName": sender_data.get("senderName") or sender_data.get("senderContactName"),
        "fromMe": from_me,
        "text": text_body,
        "message": {"conversation": text_body or ""},
        "messageTimestamp": payload.get("timestamp"),
        "status": "sent" if from_me else None,
    }


def _extract_green_text_body(message_data: dict[str, Any]) -> str | None:
    for container_key, text_key in (
        ("textMessageData", "textMessage"),
        ("extendedTextMessageData", "text"),
        ("quotedMessage", "textMessage"),
    ):
        container = message_data.get(container_key)
        if isinstance(container, dict):
            value = container.get(text_key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    for candidate in (message_data.get("textMessage"), message_data.get("caption")):
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def ingest_evolution_webhook(
    db: Session,
    *,
    payload: dict[str, Any],
) -> None:
    event_name = str(payload.get("event") or "").strip().lower()
    instance_name = str(payload.get("instance") or "").strip()
    if not event_name or not instance_name:
        return

    connection = get_connection_by_instance_name(db, instance_name=instance_name)
    if connection is None:
        logger.warning("whatsapp_evolution_unknown_instance instance=%s event=%s", instance_name, event_name)
        return

    event_time = _parse_datetime(payload.get("date_time")) or utcnow()
    data = payload.get("data")
    if event_name == "qrcode.updated":
        _apply_qr_update(connection, data, event_time=event_time)
        return
    if event_name == "connection.update":
        _apply_connection_update(connection, data, event_time=event_time)
        return
    if event_name in {"messages.upsert", "send.message"}:
        _ingest_message_batch(
            db,
            connection=connection,
            event_name=event_name,
            data=data,
            event_time=event_time,
        )
        return
    if event_name == "messages.update":
        _apply_message_updates(
            db,
            connection=connection,
            data=data,
            event_time=event_time,
        )
        return
    if event_name in {"contacts.set", "contacts.upsert", "contacts.update"}:
        _ingest_contact_batch(
            db,
            connection=connection,
            data=data,
        )
        return
    if event_name in {"chats.set", "chats.upsert", "chats.update"}:
        _ingest_chat_batch(
            db,
            connection=connection,
            data=data,
        )


def _apply_qr_update(
    connection: WhatsAppConnection,
    data: Any,
    *,
    event_time: datetime,
) -> None:
    qr_code = _extract_qr_code(data)
    connection.qr_code = qr_code
    connection.last_error = None
    connection.last_event_at = event_time
    connection.status = resolve_connection_status("connecting", has_qr=bool(qr_code))


def _apply_connection_update(
    connection: WhatsAppConnection,
    data: Any,
    *,
    event_time: datetime,
) -> None:
    raw_state = _extract_connection_state(data)
    profile_name = _extract_profile_name(data)
    phone_number = _extract_phone_number(data)
    last_error = _extract_connection_error(data)
    next_status = resolve_connection_status(raw_state, has_qr=bool(connection.qr_code), last_error=last_error)
    connection.status = next_status
    connection.profile_name = profile_name or connection.profile_name
    connection.phone_number = phone_number or connection.phone_number
    connection.last_error = last_error
    connection.last_event_at = event_time
    if next_status == "connected":
        connection.connected_at = connection.connected_at or event_time
        connection.qr_code = None
    elif next_status == "not_connected":
        connection.qr_code = None


def _ingest_message_batch(
    db: Session,
    *,
    connection: WhatsAppConnection,
    event_name: str,
    data: Any,
    event_time: datetime,
) -> None:
    for message_payload in _extract_message_envelopes(data):
        message_context = _build_message_context(
            connection=connection,
            payload=message_payload,
            event_name=event_name,
            fallback_time=event_time,
        )
        if message_context is None:
            continue
        chat = _get_or_create_chat(
            db,
            connection=connection,
            external_chat_id=message_context["external_chat_id"],
            display_name=message_context["display_name"],
        )
        existing = _find_existing_message(
            db,
            connection=connection,
            external_message_id=message_context["external_message_id"],
            dedupe_key=message_context["dedupe_key"],
        )
        is_new = existing is None
        message = existing or WhatsAppMessage(
            org_id=connection.org_id,
            connection_id=connection.id,
            chat_id=chat.id,
            dedupe_key=message_context["dedupe_key"],
            direction=message_context["direction"],
            status=message_context["status"],
            created_at=message_context["created_at"],
        )
        if is_new:
            db.add(message)

        message.chat_id = chat.id
        message.external_message_id = message_context["external_message_id"]
        message.sender_phone = message_context["sender_phone"]
        message.recipient_phone = message_context["recipient_phone"]
        message.direction = message_context["direction"]
        message.status = message_context["status"]
        message.text_body = message_context["text_body"]
        message.sent_at = message_context["created_at"]
        if message.status == "delivered":
            message.delivered_at = message.delivered_at or message_context["created_at"]
        if message.status == "read":
            message.read_at = message.read_at or message_context["created_at"]
            message.delivered_at = message.delivered_at or message_context["created_at"]
        if message.status == "failed":
            message.failed_at = message.failed_at or message_context["created_at"]

        _touch_chat(
            chat,
            text_body=message.text_body,
            message_at=message.sent_at or event_time,
            increment_unread=is_new and message.direction == "inbound",
        )
        if is_new and message.direction == "inbound":
            _maybe_apply_booking_reply(
                db,
                connection=connection,
                sender_phone=message.sender_phone,
                text_body=message.text_body,
            )


def _maybe_apply_booking_reply(
    db: Session,
    *,
    connection: WhatsAppConnection,
    sender_phone: str | None,
    text_body: str | None,
) -> None:
    normalized_phone = normalize_phone(sender_phone)
    if not normalized_phone or not (text_body or "").strip():
        return
    candidates = (
        db.query(Booking)
        .join(BookingEvent, BookingEvent.booking_id == Booking.id)
        .filter(
            Booking.association_id == connection.org_id,
            Booking.customer_phone.isnot(None),
            Booking.status == BookingStatus.CONFIRMED.value,
            BookingEvent.event_type == "whatsapp_booking_reminder_sent",
        )
        .order_by(BookingEvent.created_at.desc(), Booking.id.desc())
        .limit(20)
        .all()
    )
    for booking in candidates:
        if normalize_phone(booking.customer_phone) == normalized_phone:
            apply_booking_text_reply(db, booking=booking, message_text=text_body)
            return


def _apply_message_updates(
    db: Session,
    *,
    connection: WhatsAppConnection,
    data: Any,
    event_time: datetime,
) -> None:
    for update_payload in _extract_message_envelopes(data):
        external_message_id = _extract_external_message_id(update_payload)
        if external_message_id is None:
            continue
        message = (
            db.query(WhatsAppMessage)
            .filter(
                WhatsAppMessage.connection_id == connection.id,
                WhatsAppMessage.external_message_id == external_message_id,
            )
            .first()
        )
        if message is None:
            continue
        next_status = _normalize_message_status(_extract_update_status(update_payload))
        message.status = next_status
        if next_status == "delivered":
            message.delivered_at = message.delivered_at or event_time
        elif next_status == "read":
            message.delivered_at = message.delivered_at or event_time
            message.read_at = message.read_at or event_time
        elif next_status == "failed":
            message.failed_at = message.failed_at or event_time


def _ingest_contact_batch(
    db: Session,
    *,
    connection: WhatsAppConnection,
    data: Any,
) -> None:
    contacts: list[EvolutionContact] = []
    for payload in _extract_contact_envelopes(data):
        remote_jid = payload.get("remoteJid")
        if not isinstance(remote_jid, str) or not remote_jid.strip():
            continue
        canonical_chat_id = canonicalize_whatsapp_chat_id(remote_jid) or remote_jid.strip()
        contacts.append(
            EvolutionContact(
                remote_jid=canonical_chat_id,
                display_name=_safe_chat_display_name(
                    connection,
                    _extract_display_name(payload) or normalize_phone(remote_jid) or remote_jid.strip(),
                    canonical_chat_id,
                ),
                phone_number=normalize_phone(remote_jid),
                profile_pic_url=payload.get("profilePicUrl") if isinstance(payload.get("profilePicUrl"), str) else None,
                created_at=_parse_datetime(payload.get("createdAt")),
                updated_at=_parse_datetime(payload.get("updatedAt")),
                raw=payload,
            )
        )
    if contacts:
        sync_contacts_into_chats(db, connection=connection, contacts=contacts)


def _ingest_chat_batch(
    db: Session,
    *,
    connection: WhatsAppConnection,
    data: Any,
) -> None:
    for payload in _extract_chat_envelopes(data):
        external_chat_id = _extract_chat_id(payload)
        if not external_chat_id or is_whatsapp_group_jid(external_chat_id):
            continue
        raw_display_name = _extract_display_name(payload)
        if not raw_display_name:
            name = payload.get("name")
            if isinstance(name, str) and name.strip():
                raw_display_name = name.strip()
        display_name = _safe_chat_display_name(
            connection,
            raw_display_name,
            external_chat_id,
        )
        chat = _get_or_create_chat(
            db,
            connection=connection,
            external_chat_id=external_chat_id,
            display_name=display_name or _fallback_chat_display_name(external_chat_id),
        )
        unread_messages = payload.get("unreadMessages")
        if isinstance(unread_messages, int) and unread_messages >= 0:
            chat.unread_count = unread_messages
        if isinstance(payload.get("updatedAt"), str):
            parsed_updated_at = _parse_datetime(payload.get("updatedAt"))
            if parsed_updated_at is not None:
                chat.updated_at = parsed_updated_at


def _find_existing_message(
    db: Session,
    *,
    connection: WhatsAppConnection,
    external_message_id: str | None,
    dedupe_key: str,
) -> WhatsAppMessage | None:
    if external_message_id:
        message = (
            db.query(WhatsAppMessage)
            .filter(
                WhatsAppMessage.connection_id == connection.id,
                WhatsAppMessage.external_message_id == external_message_id,
            )
            .first()
        )
        if message is not None:
            return message
    return (
        db.query(WhatsAppMessage)
        .filter(WhatsAppMessage.dedupe_key == dedupe_key)
        .first()
    )


def _get_or_create_chat(
    db: Session,
    *,
    connection: WhatsAppConnection,
    external_chat_id: str,
    display_name: str | None,
) -> WhatsAppChat:
    normalized_external_chat_id = (
        canonicalize_whatsapp_chat_id(external_chat_id)
        if not is_whatsapp_group_jid(external_chat_id)
        else (external_chat_id or "").strip() or None
    )
    if normalized_external_chat_id is None:
        raise ValueError("Chat WhatsApp non valida.")
    safe_display_name = _safe_chat_display_name(
        connection,
        display_name,
        normalized_external_chat_id,
    )

    chat_candidates = _find_chat_candidates(
        db,
        connection=connection,
        external_chat_id=normalized_external_chat_id,
    )
    primary_chat = _select_primary_chat(chat_candidates, preferred_external_chat_id=normalized_external_chat_id)
    if primary_chat is not None:
        if primary_chat.external_chat_id != normalized_external_chat_id:
            primary_chat.external_chat_id = normalized_external_chat_id
        alias_chats = [item for item in chat_candidates if item.id != primary_chat.id]
        if alias_chats:
            _merge_chat_aliases(db, connection=connection, primary_chat=primary_chat, alias_chats=alias_chats)
        if _should_replace_display_name(primary_chat.display_name, safe_display_name):
            primary_chat.display_name = safe_display_name
        return primary_chat

    chat = _find_chat_by_external_id(
        db,
        connection=connection,
        external_chat_id=normalized_external_chat_id,
    )
    if chat is None:
        chat = _insert_chat_if_missing(
            db,
            connection=connection,
            external_chat_id=normalized_external_chat_id,
            display_name=safe_display_name,
        )
        if chat is None:
            chat = WhatsAppChat(
                org_id=connection.org_id,
                connection_id=connection.id,
                external_chat_id=normalized_external_chat_id,
                display_name=safe_display_name,
            )
            db.add(chat)
            db.flush()
            return chat
    if _should_replace_display_name(chat.display_name, safe_display_name):
        chat.display_name = safe_display_name
    return chat


def _find_chat_by_external_id(
    db: Session,
    *,
    connection: WhatsAppConnection,
    external_chat_id: str,
) -> WhatsAppChat | None:
    return (
        db.query(WhatsAppChat)
        .filter(
            WhatsAppChat.connection_id == connection.id,
            WhatsAppChat.external_chat_id == external_chat_id,
        )
        .first()
    )


def _insert_chat_if_missing(
    db: Session,
    *,
    connection: WhatsAppConnection,
    external_chat_id: str,
    display_name: str | None,
) -> WhatsAppChat | None:
    bind = db.get_bind()
    dialect_name = bind.dialect.name if bind is not None else ""
    insert_factory = None
    if dialect_name == "postgresql":
        insert_factory = postgresql_insert
    elif dialect_name == "sqlite":
        insert_factory = sqlite_insert
    if insert_factory is None:
        return None

    stmt = (
        insert_factory(WhatsAppChat.__table__)
        .values(
            org_id=connection.org_id,
            connection_id=connection.id,
            external_chat_id=external_chat_id,
            display_name=display_name,
        )
        .on_conflict_do_nothing(
            index_elements=["connection_id", "external_chat_id"],
        )
    )
    db.execute(stmt)
    return _find_chat_by_external_id(
        db,
        connection=connection,
        external_chat_id=external_chat_id,
    )


def _find_chat_candidates(
    db: Session,
    *,
    connection: WhatsAppConnection,
    external_chat_id: str,
) -> list[WhatsAppChat]:
    normalized_phone = normalize_phone(external_chat_id)
    chats = (
        db.query(WhatsAppChat)
        .filter(WhatsAppChat.connection_id == connection.id)
        .all()
    )
    if normalized_phone is None:
        return [chat for chat in chats if chat.external_chat_id == external_chat_id]
    return [
        chat
        for chat in chats
        if normalize_phone(chat.external_chat_id) == normalized_phone
    ]


def _select_primary_chat(
    chats: list[WhatsAppChat],
    *,
    preferred_external_chat_id: str,
) -> WhatsAppChat | None:
    if not chats:
        return None
    return sorted(
        chats,
        key=lambda chat: (
            0 if chat.external_chat_id == preferred_external_chat_id else 1,
            0 if chat.last_message_at is not None else 1,
            -(chat.last_message_at.timestamp()) if chat.last_message_at is not None else 0.0,
            chat.id,
        ),
    )[0]


def _merge_chat_aliases(
    db: Session,
    *,
    connection: WhatsAppConnection,
    primary_chat: WhatsAppChat,
    alias_chats: list[WhatsAppChat],
) -> None:
    for alias_chat in alias_chats:
        (
            db.query(WhatsAppMessage)
            .filter(WhatsAppMessage.chat_id == alias_chat.id)
            .update({WhatsAppMessage.chat_id: primary_chat.id}, synchronize_session=False)
        )
        if not primary_chat.last_message_at or (
            alias_chat.last_message_at is not None and alias_chat.last_message_at > primary_chat.last_message_at
        ):
            primary_chat.last_message_at = alias_chat.last_message_at
            primary_chat.last_message_text = alias_chat.last_message_text
        primary_chat.unread_count = int(primary_chat.unread_count or 0) + int(alias_chat.unread_count or 0)
        alias_display_name = _safe_chat_display_name(connection, alias_chat.display_name, alias_chat.external_chat_id)
        if _should_replace_display_name(primary_chat.display_name, alias_display_name):
            primary_chat.display_name = alias_display_name
        db.delete(alias_chat)
    db.flush()


def _fallback_chat_display_name(external_chat_id: str | None) -> str:
    return normalize_phone(external_chat_id) or (external_chat_id or "").strip() or "Contatto WhatsApp"


def _is_own_connection_display_name(connection: WhatsAppConnection, value: str | None) -> bool:
    cleaned = (value or "").strip()
    if not cleaned:
        return False
    profile_name = (connection.profile_name or "").strip()
    if profile_name and cleaned.casefold() == profile_name.casefold():
        return True
    own_phone = normalize_phone(connection.phone_number)
    candidate_phone = normalize_phone(cleaned)
    return bool(own_phone and candidate_phone and own_phone == candidate_phone)


def _safe_chat_display_name(
    connection: WhatsAppConnection,
    candidate: str | None,
    external_chat_id: str | None,
) -> str:
    cleaned_candidate = (candidate or "").strip()
    if cleaned_candidate and not _is_own_connection_display_name(connection, cleaned_candidate):
        return cleaned_candidate
    return _fallback_chat_display_name(external_chat_id)


def _display_name_quality(value: str | None) -> int:
    cleaned = (value or "").strip()
    if not cleaned:
        return 0
    if "@" in cleaned:
        return 1
    if normalize_phone(cleaned) == cleaned:
        return 1
    if any(ch.isalpha() for ch in cleaned):
        return 4
    if any(ch.isdigit() for ch in cleaned):
        return 2
    return 3


def _should_replace_display_name(current: str | None, candidate: str | None) -> bool:
    cleaned_candidate = (candidate or "").strip()
    if not cleaned_candidate:
        return False
    cleaned_current = (current or "").strip()
    if not cleaned_current:
        return True
    current_quality = _display_name_quality(cleaned_current)
    candidate_quality = _display_name_quality(cleaned_candidate)
    if candidate_quality != current_quality:
        return candidate_quality > current_quality
    if cleaned_candidate.lower() == cleaned_current.lower():
        return False
    return len(cleaned_candidate) > len(cleaned_current)


def _touch_chat(
    chat: WhatsAppChat,
    *,
    text_body: str | None,
    message_at: datetime,
    increment_unread: bool,
) -> None:
    chat.last_message_text = text_body
    chat.last_message_at = message_at
    if increment_unread:
        chat.unread_count = int(chat.unread_count or 0) + 1


def _build_message_context(
    *,
    connection: WhatsAppConnection,
    payload: dict[str, Any],
    event_name: str,
    fallback_time: datetime,
) -> dict[str, Any] | None:
    external_chat_id = _extract_chat_id(payload)
    if not external_chat_id or external_chat_id.endswith("@g.us"):
        return None

    external_message_id = _extract_external_message_id(payload)
    dedupe_key = _build_message_dedupe_key(
        instance_name=connection.instance_name,
        external_message_id=external_message_id,
        payload=payload,
    )
    direction = "outbound" if _is_outbound_message(payload, event_name=event_name) else "inbound"
    remote_phone = normalize_phone(external_chat_id)
    sender_phone = connection.phone_number if direction == "outbound" else _extract_sender_phone(payload) or remote_phone
    recipient_phone = remote_phone if direction == "outbound" else connection.phone_number
    text_body = _extract_text_body(payload)
    created_at = _extract_message_timestamp(payload) or fallback_time
    if direction == "outbound":
        display_name = remote_phone or external_chat_id
    else:
        display_name = _safe_chat_display_name(
            connection,
            _extract_display_name(payload) or remote_phone or external_chat_id,
            external_chat_id,
        )
    status = _normalize_message_status(_extract_update_status(payload))
    if event_name == "send.message" and status == "pending":
        status = "sent"
    return {
        "external_chat_id": external_chat_id,
        "external_message_id": external_message_id,
        "dedupe_key": dedupe_key,
        "direction": direction,
        "sender_phone": sender_phone,
        "recipient_phone": recipient_phone,
        "text_body": text_body,
        "created_at": created_at,
        "display_name": display_name,
        "status": status,
    }


def _extract_message_envelopes(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("messages", "items", "updates"):
        value = data.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    if any(key in data for key in ("key", "message", "id", "messageId", "status")):
        return [data]
    return []


def _extract_contact_envelopes(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("contacts", "items"):
        value = data.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    if "remoteJid" in data:
        return [data]
    return []


def _extract_chat_envelopes(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("chats", "items"):
        value = data.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    if any(key in data for key in ("remoteJid", "jid", "chatId", "name")):
        return [data]
    return []


def _extract_chat_id(payload: dict[str, Any]) -> str | None:
    key = payload.get("key")
    if isinstance(key, dict):
        remote_jid = key.get("remoteJid")
        if isinstance(remote_jid, str) and remote_jid.strip():
            return canonicalize_whatsapp_chat_id(remote_jid) or remote_jid.strip()
    for candidate in (payload.get("remoteJid"), payload.get("jid"), payload.get("chatId")):
        if isinstance(candidate, str) and candidate.strip():
            return canonicalize_whatsapp_chat_id(candidate) or candidate.strip()
    return None


def _extract_external_message_id(payload: dict[str, Any]) -> str | None:
    key = payload.get("key")
    if isinstance(key, dict):
        key_id = key.get("id")
        if isinstance(key_id, str) and key_id.strip():
            return key_id.strip()
    for candidate in (payload.get("id"), payload.get("messageId"), payload.get("message_id")):
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def _extract_sender_phone(payload: dict[str, Any]) -> str | None:
    key = payload.get("key")
    if isinstance(key, dict):
        for candidate in (key.get("participant"), key.get("remoteJid")):
            normalized = normalize_phone(candidate if isinstance(candidate, str) else None)
            if normalized:
                return normalized
    for candidate in (payload.get("participant"), payload.get("sender"), payload.get("from")):
        normalized = normalize_phone(candidate if isinstance(candidate, str) else None)
        if normalized:
            return normalized
    return None


def _extract_display_name(payload: dict[str, Any]) -> str | None:
    for candidate in (
        payload.get("pushName"),
        payload.get("notifyName"),
        payload.get("profileName"),
        payload.get("senderName"),
    ):
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def _extract_text_body(payload: dict[str, Any]) -> str | None:
    for candidate in (payload.get("text"), payload.get("body")):
        if isinstance(candidate, str):
            cleaned = candidate.strip()
            if cleaned:
                return cleaned
    message = payload.get("message")
    if isinstance(message, dict):
        conversation = message.get("conversation")
        if isinstance(conversation, str) and conversation.strip():
            return conversation.strip()
        extended = message.get("extendedTextMessage")
        if isinstance(extended, dict):
            text_value = extended.get("text")
            if isinstance(text_value, str) and text_value.strip():
                return text_value.strip()
    return None


def _extract_message_timestamp(payload: dict[str, Any]) -> datetime | None:
    for candidate in (
        payload.get("messageTimestamp"),
        payload.get("timestamp"),
        payload.get("message_timestamp"),
    ):
        parsed = _timestamp_to_datetime(candidate)
        if parsed is not None:
            return parsed
    return None


def _timestamp_to_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        parsed = _parse_datetime(value)
        if parsed is not None:
            return parsed
        if value.isdigit():
            value = int(value)
    if isinstance(value, (int, float)):
        timestamp = float(value)
        if timestamp > 10_000_000_000:
            timestamp = timestamp / 1000.0
        return datetime.fromtimestamp(timestamp, tz=timezone.utc).replace(tzinfo=None)
    return None


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _is_outbound_message(payload: dict[str, Any], *, event_name: str) -> bool:
    if event_name == "send.message":
        return True
    key = payload.get("key")
    if isinstance(key, dict):
        return bool(key.get("fromMe"))
    return bool(payload.get("fromMe"))


def _extract_qr_code(data: Any) -> str | None:
    if isinstance(data, dict):
        for candidate in (
            data.get("qrcode"),
            data.get("qrCode"),
            data.get("base64"),
            data.get("code"),
            data.get("pairingCode"),
        ):
            if isinstance(candidate, dict):
                nested = _extract_qr_code(candidate)
                if nested:
                    return nested
            elif isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
    elif isinstance(data, str) and data.strip():
        return data.strip()
    return None


def _extract_connection_state(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None
    for candidate in (data.get("state"), data.get("status"), data.get("connection")):
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    instance = data.get("instance")
    if isinstance(instance, dict):
        return _extract_connection_state(instance)
    return None


def _extract_profile_name(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None
    for candidate in (
        data.get("profileName"),
        data.get("pushName"),
        data.get("name"),
    ):
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    instance = data.get("instance")
    if isinstance(instance, dict):
        return _extract_profile_name(instance)
    return None


def _extract_phone_number(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None
    for candidate in (data.get("number"), data.get("wuid"), data.get("ownerJid")):
        normalized = normalize_phone(candidate if isinstance(candidate, str) else None)
        if normalized:
            return normalized
    instance = data.get("instance")
    if isinstance(instance, dict):
        return _extract_phone_number(instance)
    return None


def _extract_connection_error(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None
    for candidate in (data.get("message"), data.get("error")):
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    last_disconnect = data.get("lastDisconnect")
    if isinstance(last_disconnect, dict):
        error = last_disconnect.get("error")
        if isinstance(error, dict):
            output = error.get("output")
            if isinstance(output, dict):
                payload = output.get("payload")
                if isinstance(payload, dict):
                    message = payload.get("message")
                    if isinstance(message, str) and message.strip():
                        return message.strip()
    return None


def _extract_update_status(payload: dict[str, Any]) -> Any:
    update = payload.get("update")
    if isinstance(update, dict):
        if "status" in update:
            return update.get("status")
    if "status" in payload:
        return payload.get("status")
    return None


def _normalize_message_status(value: Any) -> str:
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"pending", "queued"}:
            return "pending"
        if normalized in {"sent", "server_ack", "delivery_ack", "ack"}:
            return "sent"
        if normalized in {"delivered"}:
            return "delivered"
        if normalized in {"read", "played"}:
            return "read"
        if normalized in {"failed", "error"}:
            return "failed"
    if isinstance(value, (int, float)):
        status_code = int(value)
        if status_code <= 0:
            return "pending"
        if status_code in {1, 2}:
            return "sent"
        if status_code == 3:
            return "delivered"
        if status_code >= 4:
            return "read"
    return "pending"


def _build_message_dedupe_key(
    *,
    instance_name: str | None,
    external_message_id: str | None,
    payload: dict[str, Any] | None,
) -> str:
    if external_message_id:
        prefix = instance_name or "instance"
        return f"message:{prefix}:{external_message_id}"
    serialized = json.dumps(payload or {}, sort_keys=True, default=str, ensure_ascii=True)
    # Non-security digest: stable dedupe key for webhook payloads without provider message IDs.
    try:
        digest = hashlib.sha1(  # nosec B324 - non-security webhook dedupe digest.
            serialized.encode("utf-8"), usedforsecurity=False
        ).hexdigest()
    except TypeError:
        digest = hashlib.sha1(  # nosec B324 - compatibility fallback; non-security only.
            serialized.encode("utf-8")
        ).hexdigest()
    prefix = instance_name or "instance"
    return f"message:{prefix}:hash:{digest}"
