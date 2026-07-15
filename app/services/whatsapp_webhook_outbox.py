from __future__ import annotations

import copy
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
import random
import re
import uuid
from typing import Any

from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.log_redaction import hash_identifier
from app.models import WhatsAppWebhookEvent, WhatsAppWebhookEventStatus
from app.services.whatsapp_sync import ingest_whatsapp_webhook as ingest_evolution_webhook

logger = logging.getLogger(__name__)

SKIPPED_WEBHOOK_EVENTS = {
    "chats.set",
    "chats.upsert",
    "chats.update",
    "contacts.set",
    "contacts.update",
}
_RETRY_SCHEDULE_SECONDS = [15, 30, 60, 120, 300, 600, 1200]
_EVENT_NAME_RE = re.compile(r"^[a-z0-9._-]{1,100}$")
_TERMINAL_PAYLOAD = {"redacted": True}


@dataclass(frozen=True)
class ClaimedWhatsAppWebhookJob:
    id: str
    event_name: str
    instance_name: str
    payload_json: dict[str, Any]
    attempts: int


def utcnow_aware() -> datetime:
    return datetime.now(timezone.utc)


def normalize_event_name(value: Any) -> str:
    return str(value or "").strip().lower()


def normalize_instance_name(value: Any) -> str:
    return str(value or "").strip()


def build_whatsapp_webhook_dedupe_key(payload: dict[str, Any]) -> str:
    serialized = json.dumps(payload or {}, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def enqueue_whatsapp_webhook_event(db: Session, *, payload: dict[str, Any]) -> WhatsAppWebhookEvent:
    event_name = normalize_event_name(payload.get("event") or payload.get("typeWebhook"))
    instance_name = normalize_instance_name(payload.get("instance"))
    if not instance_name:
        instance_data = payload.get("instanceData")
        if isinstance(instance_data, dict):
            instance_name = normalize_instance_name(instance_data.get("idInstance"))
    if not event_name:
        raise ValueError("Webhook WhatsApp senza event.")
    if not _EVENT_NAME_RE.fullmatch(event_name):
        raise ValueError("Webhook WhatsApp con event non valido.")
    if not instance_name:
        raise ValueError("Webhook WhatsApp senza instance.")

    dedupe_key = build_whatsapp_webhook_dedupe_key(payload)
    existing = (
        db.query(WhatsAppWebhookEvent)
        .filter(WhatsAppWebhookEvent.dedupe_key == dedupe_key)
        .first()
    )
    if existing is not None:
        return existing

    event_id = str(uuid.uuid4())
    bind = db.get_bind()
    dialect_name = bind.dialect.name if bind is not None else ""
    insert_factory = None
    if dialect_name == "postgresql":
        insert_factory = postgresql_insert
    elif dialect_name == "sqlite":
        insert_factory = sqlite_insert

    if insert_factory is not None:
        stmt = (
            insert_factory(WhatsAppWebhookEvent.__table__)
            .values(
                id=event_id,
                event_name=event_name,
                instance_name=instance_name,
                payload_json=copy.deepcopy(payload),
                status=WhatsAppWebhookEventStatus.QUEUED.value,
                priority=_event_priority(event_name),
                attempts=0,
                next_retry_at=utcnow_aware(),
                dedupe_key=dedupe_key,
            )
            .on_conflict_do_nothing(
                index_elements=["dedupe_key"],
            )
        )
        db.execute(stmt)
        event = (
            db.query(WhatsAppWebhookEvent)
            .filter(WhatsAppWebhookEvent.dedupe_key == dedupe_key)
            .first()
        )
        if event is not None:
            return event

    event = WhatsAppWebhookEvent(
        id=event_id,
        event_name=event_name,
        instance_name=instance_name,
        payload_json=copy.deepcopy(payload),
        status=WhatsAppWebhookEventStatus.QUEUED.value,
        priority=_event_priority(event_name),
        attempts=0,
        next_retry_at=utcnow_aware(),
        dedupe_key=dedupe_key,
    )
    db.add(event)
    db.flush()
    return event


def recover_stale_processing(db: Session) -> int:
    cutoff = utcnow_aware() - timedelta(seconds=settings.WHATSAPP_WEBHOOK_STALE_AFTER_SECONDS)
    recovered = (
        db.query(WhatsAppWebhookEvent)
        .filter(
            WhatsAppWebhookEvent.status == WhatsAppWebhookEventStatus.PROCESSING.value,
            WhatsAppWebhookEvent.updated_at <= cutoff,
        )
        .update(
            {
                WhatsAppWebhookEvent.status: WhatsAppWebhookEventStatus.FAILED.value,
                WhatsAppWebhookEvent.last_error: "worker_recovered_stale_processing",
                WhatsAppWebhookEvent.next_retry_at: utcnow_aware(),
                WhatsAppWebhookEvent.updated_at: utcnow_aware(),
            },
            synchronize_session=False,
        )
    )
    return int(recovered or 0)


def fetch_due_webhook_batch(db: Session, limit: int) -> list[WhatsAppWebhookEvent]:
    now = utcnow_aware()
    query = (
        db.query(WhatsAppWebhookEvent)
        .filter(
            WhatsAppWebhookEvent.status.in_(
                [
                    WhatsAppWebhookEventStatus.QUEUED.value,
                    WhatsAppWebhookEventStatus.FAILED.value,
                ]
            ),
            WhatsAppWebhookEvent.next_retry_at <= now,
        )
        .order_by(
            WhatsAppWebhookEvent.priority.asc(),
            WhatsAppWebhookEvent.next_retry_at.asc(),
            WhatsAppWebhookEvent.created_at.asc(),
        )
    )
    try:
        query = query.with_for_update(skip_locked=True)
    except (TypeError, NotImplementedError):
        pass
    except OperationalError:
        pass
    return query.limit(limit).all()


def claim_due_webhook_batch(limit: int | None = None) -> list[ClaimedWhatsAppWebhookJob]:
    batch_limit = int(limit or settings.WHATSAPP_WEBHOOK_BATCH_SIZE)
    if batch_limit <= 0:
        return []

    with SessionLocal() as db:
        recovered = recover_stale_processing(db)
        rows = fetch_due_webhook_batch(db, batch_limit)
        claimed: list[ClaimedWhatsAppWebhookJob] = []
        now = utcnow_aware()
        for row in rows:
            row.status = WhatsAppWebhookEventStatus.PROCESSING.value
            row.attempts = int(row.attempts or 0) + 1
            row.last_error = None
            row.updated_at = now
            claimed.append(
                ClaimedWhatsAppWebhookJob(
                    id=row.id,
                    event_name=row.event_name,
                    instance_name=row.instance_name,
                    payload_json=copy.deepcopy(row.payload_json or {}),
                    attempts=int(row.attempts or 1),
                )
            )
        db.commit()
        if recovered:
            logger.warning("whatsapp_webhook_outbox_recovered_stale count=%s", recovered)
        return claimed


def mark_processed(db: Session, event_id: str) -> None:
    event = _get_event(db, event_id)
    now = utcnow_aware()
    event.status = WhatsAppWebhookEventStatus.PROCESSED.value
    event.processed_at = now
    event.next_retry_at = now
    event.last_error = None
    event.payload_json = dict(_TERMINAL_PAYLOAD)
    event.updated_at = now
    db.flush()


def mark_skipped(db: Session, event_id: str, reason: str) -> None:
    event = _get_event(db, event_id)
    now = utcnow_aware()
    event.status = WhatsAppWebhookEventStatus.SKIPPED.value
    event.processed_at = now
    event.next_retry_at = now
    event.last_error = reason
    event.payload_json = dict(_TERMINAL_PAYLOAD)
    event.updated_at = now
    db.flush()


def mark_failed(db: Session, event_id: str, error: str, next_retry_at: datetime) -> None:
    event = _get_event(db, event_id)
    event.status = WhatsAppWebhookEventStatus.FAILED.value
    event.last_error = (error or "").strip()[:255] or "whatsapp_webhook_processing_failed"
    event.next_retry_at = next_retry_at
    event.updated_at = utcnow_aware()
    db.flush()


def compute_backoff(attempts: int) -> datetime:
    normalized_attempts = max(1, int(attempts or 1))
    base_seconds = _RETRY_SCHEDULE_SECONDS[
        min(normalized_attempts - 1, len(_RETRY_SCHEDULE_SECONDS) - 1)
    ]
    # Non-security jitter to avoid synchronized webhook retries.
    jitter_multiplier = random.uniform(0.85, 1.15)  # nosec B311
    delay_seconds = max(5, int(round(base_seconds * jitter_multiplier)))
    return utcnow_aware() + timedelta(seconds=delay_seconds)


def process_webhook_outbox_once(limit: int | None = None) -> dict[str, int]:
    jobs = claim_due_webhook_batch(limit=limit)
    stats = {
        "claimed": len(jobs),
        "processed": 0,
        "skipped": 0,
        "retry_scheduled": 0,
    }
    for job in jobs:
        if job.event_name in SKIPPED_WEBHOOK_EVENTS:
            with SessionLocal() as db:
                mark_skipped(db, job.id, "high_volume_event")
                db.commit()
            stats["skipped"] += 1
            logger.info(
                "whatsapp_webhook_worker_result event_id=%s event=%s instance_hash=%s attempts=%s result=skipped",
                job.id,
                job.event_name,
                hash_identifier(job.instance_name),
                job.attempts,
            )
            continue

        try:
            with SessionLocal() as db:
                ingest_evolution_webhook(db, payload=job.payload_json)
                mark_processed(db, job.id)
                db.commit()
            stats["processed"] += 1
            logger.info(
                "whatsapp_webhook_worker_result event_id=%s event=%s instance_hash=%s attempts=%s result=processed",
                job.id,
                job.event_name,
                hash_identifier(job.instance_name),
                job.attempts,
            )
        except (IntegrityError, OperationalError) as exc:
            next_retry_at = compute_backoff(job.attempts)
            safe_error = f"{type(exc).__name__}: database_processing_failed"
            with SessionLocal() as db:
                mark_failed(db, job.id, safe_error, next_retry_at)
                db.commit()
            stats["retry_scheduled"] += 1
            logger.warning(
                "whatsapp_webhook_worker_result event_id=%s event=%s "
                "instance_hash=%s attempts=%s result=retry_db "
                "next_retry_at=%s error_type=%s",
                job.id,
                job.event_name,
                hash_identifier(job.instance_name),
                job.attempts,
                next_retry_at.isoformat(),
                type(exc).__name__,
            )
        except Exception as exc:
            next_retry_at = compute_backoff(job.attempts)
            safe_error = f"{type(exc).__name__}: webhook_processing_failed"
            with SessionLocal() as db:
                mark_failed(db, job.id, safe_error, next_retry_at)
                db.commit()
            stats["retry_scheduled"] += 1
            logger.error(
                "whatsapp_webhook_worker_result event_id=%s event=%s "
                "instance_hash=%s attempts=%s result=retry_unexpected "
                "next_retry_at=%s error_type=%s",
                job.id,
                job.event_name,
                hash_identifier(job.instance_name),
                job.attempts,
                next_retry_at.isoformat(),
                type(exc).__name__,
            )
    return stats


def drain_webhook_outbox_for_tests(*, max_loops: int = 20, limit: int | None = None) -> dict[str, int]:
    aggregated = {
        "claimed": 0,
        "processed": 0,
        "skipped": 0,
        "retry_scheduled": 0,
    }
    for _ in range(max_loops):
        stats = process_webhook_outbox_once(limit=limit)
        for key in aggregated:
            aggregated[key] += stats.get(key, 0)
        if stats["claimed"] == 0:
            break
    return aggregated


def _event_priority(event_name: str) -> int:
    if event_name in {"qrcode.updated", "connection.update", "stateinstancechanged"}:
        return 1
    if event_name in {
        "messages.upsert",
        "send.message",
        "incomingmessagereceived",
        "outgoingapimessagereceived",
        "outgoingmessagereceived",
    }:
        return 2
    if event_name == "messages.update":
        return 3
    return 8


def _get_event(db: Session, event_id: str) -> WhatsAppWebhookEvent:
    event = db.query(WhatsAppWebhookEvent).filter(WhatsAppWebhookEvent.id == event_id).first()
    if event is None:
        raise ValueError(f"WhatsApp webhook event not found: {event_id}")
    return event
