from __future__ import annotations

import base64
import copy
import logging
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import EmailOutbox, EmailOutboxStatus, Member
from app.services.email_sender import build_sender_payload
from app.utils import (
    PermanentEmailDeliveryError,
    RetryableEmailDeliveryError,
    send_email_via_transport_low_level,
)

logger = logging.getLogger(__name__)

_RETRY_SCHEDULE_SECONDS = [30, 60, 120, 300, 600, 1200, 1800]
_PERMANENT_FAILURE_DELAY = timedelta(days=3650)


@dataclass(frozen=True)
class ClaimedEmailOutboxJob:
    id: str
    to_email: str
    subject: str
    email_type: str
    payload_json: dict[str, Any]
    attempts: int
    priority: int


def utcnow_aware() -> datetime:
    return datetime.now(timezone.utc)


def _to_naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _normalize_email(value: str) -> str:
    return (value or "").strip()


def _serialize_inline_images(inline_images: list[dict] | None) -> list[dict]:
    serialized = []
    for item in inline_images or []:
        data = item.get("data")
        if not isinstance(data, (bytes, bytearray)) or not data:
            continue
        serialized.append(
            {
                "cid": str(item.get("cid") or "").strip(),
                "content_type": str(item.get("content_type") or "image/png").strip(),
                "filename": str(item.get("filename") or "").strip() or None,
                "data_b64": base64.b64encode(bytes(data)).decode("ascii"),
            }
        )
    return serialized


def _deserialize_inline_images(inline_images: list[dict] | None) -> list[dict]:
    decoded = []
    for item in inline_images or []:
        data_b64 = str(item.get("data_b64") or "").strip()
        if not data_b64:
            continue
        decoded.append(
            {
                "cid": str(item.get("cid") or "").strip(),
                "content_type": str(item.get("content_type") or "image/png").strip(),
                "filename": str(item.get("filename") or "").strip() or None,
                "data": base64.b64decode(data_b64),
            }
        )
    return decoded


def build_email_payload(
    *,
    text_body: str,
    html_body: str | None = None,
    inline_images: list[dict] | None = None,
    meta: dict[str, Any] | None = None,
    sender: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "text_body": text_body,
        "html_body": html_body,
        "inline_images": _serialize_inline_images(inline_images),
        "meta": meta or {},
        "sender": copy.deepcopy(sender) if sender is not None else build_sender_payload(),
    }
    return payload


def enqueue_email(
    db: Session,
    email_type: str,
    to_email: str,
    subject: str,
    payload: dict[str, Any],
    priority: int,
    *,
    dedupe_key: str | None = None,
) -> str:
    normalized_email = _normalize_email(to_email)
    if not normalized_email:
        raise ValueError("to_email is required")
    if not subject.strip():
        raise ValueError("subject is required")

    normalized_payload = copy.deepcopy(payload or {})
    if dedupe_key:
        existing = (
            db.query(EmailOutbox)
            .filter(EmailOutbox.dedupe_key == dedupe_key)
            .order_by(EmailOutbox.created_at.desc(), EmailOutbox.id.desc())
            .first()
        )
        if existing is not None:
            if existing.status != EmailOutboxStatus.SENT.value:
                existing.to_email = normalized_email
                existing.subject = subject.strip()
                existing.email_type = email_type.strip()
                existing.payload_json = normalized_payload
                existing.priority = priority
                existing.last_error = None
                existing.next_retry_at = utcnow_aware()
                existing.updated_at = utcnow_aware()
                db.flush()
            return existing.id

    outbox = EmailOutbox(
        to_email=normalized_email,
        subject=subject.strip(),
        email_type=email_type.strip(),
        payload_json=normalized_payload,
        status=EmailOutboxStatus.QUEUED.value,
        priority=priority,
        attempts=0,
        next_retry_at=utcnow_aware(),
        dedupe_key=dedupe_key,
    )
    db.add(outbox)
    db.flush()
    return outbox.id


def recover_stale_sending(db: Session) -> int:
    cutoff = utcnow_aware() - timedelta(seconds=settings.EMAIL_OUTBOX_STALE_AFTER_SECONDS)
    recovered = (
        db.query(EmailOutbox)
        .filter(
            EmailOutbox.status == EmailOutboxStatus.SENDING.value,
            EmailOutbox.updated_at <= cutoff,
        )
        .update(
            {
                EmailOutbox.status: EmailOutboxStatus.FAILED.value,
                EmailOutbox.last_error: "worker_recovered_stale_sending",
                EmailOutbox.next_retry_at: utcnow_aware(),
                EmailOutbox.updated_at: utcnow_aware(),
            },
            synchronize_session=False,
        )
    )
    return int(recovered or 0)


def fetch_batch_for_sending(db: Session, limit: int) -> list[EmailOutbox]:
    now = utcnow_aware()
    query = (
        db.query(EmailOutbox)
        .filter(
            EmailOutbox.status.in_(
                [EmailOutboxStatus.QUEUED.value, EmailOutboxStatus.FAILED.value]
            ),
            EmailOutbox.next_retry_at <= now,
        )
        .order_by(
            EmailOutbox.priority.asc(),
            EmailOutbox.next_retry_at.asc(),
            EmailOutbox.created_at.asc(),
        )
    )
    try:
        query = query.with_for_update(skip_locked=True)
    except (TypeError, NotImplementedError):
        pass
    except OperationalError:
        pass
    return query.limit(limit).all()


def mark_sending(db: Session, outbox_id: str) -> int:
    outbox = db.query(EmailOutbox).filter(EmailOutbox.id == outbox_id).first()
    if outbox is None:
        raise ValueError(f"Outbox record not found: {outbox_id}")
    outbox.status = EmailOutboxStatus.SENDING.value
    outbox.attempts = int(outbox.attempts or 0) + 1
    outbox.last_error = None
    outbox.updated_at = utcnow_aware()
    _apply_post_processing_effects(db, outbox)
    db.flush()
    return int(outbox.attempts)


def mark_sent(db: Session, outbox_id: str, provider_message_id: str | None) -> None:
    outbox = db.query(EmailOutbox).filter(EmailOutbox.id == outbox_id).first()
    if outbox is None:
        raise ValueError(f"Outbox record not found: {outbox_id}")
    sent_at = utcnow_aware()
    outbox.status = EmailOutboxStatus.SENT.value
    outbox.provider_message_id = provider_message_id
    outbox.sent_at = sent_at
    outbox.next_retry_at = sent_at
    outbox.last_error = None
    outbox.updated_at = sent_at
    _apply_post_send_effects(db, outbox, sent_at)
    db.flush()


def mark_failed(
    db: Session,
    outbox_id: str,
    error: str,
    next_retry_at: datetime,
    *,
    final_failure: bool = False,
) -> None:
    outbox = db.query(EmailOutbox).filter(EmailOutbox.id == outbox_id).first()
    if outbox is None:
        raise ValueError(f"Outbox record not found: {outbox_id}")
    outbox.status = EmailOutboxStatus.FAILED.value
    outbox.last_error = (error or "").strip() or "smtp_delivery_failed"
    outbox.next_retry_at = next_retry_at
    outbox.updated_at = utcnow_aware()
    if final_failure:
        _apply_post_failure_effects(db, outbox, outbox.last_error)
    db.flush()


def compute_backoff(attempts: int) -> datetime:
    normalized_attempts = max(1, int(attempts or 1))
    base_seconds = _RETRY_SCHEDULE_SECONDS[
        min(normalized_attempts - 1, len(_RETRY_SCHEDULE_SECONDS) - 1)
    ]
    jitter_multiplier = random.uniform(0.85, 1.15)
    delay_seconds = max(5, int(round(base_seconds * jitter_multiplier)))
    return utcnow_aware() + timedelta(seconds=delay_seconds)


def compute_permanent_failure_next_retry() -> datetime:
    return utcnow_aware() + _PERMANENT_FAILURE_DELAY


def claim_due_email_batch(limit: int | None = None) -> list[ClaimedEmailOutboxJob]:
    batch_limit = int(limit or settings.EMAIL_OUTBOX_BATCH_SIZE)
    if batch_limit <= 0:
        return []

    with SessionLocal() as db:
        recovered = recover_stale_sending(db)
        rows = fetch_batch_for_sending(db, batch_limit)
        claimed: list[ClaimedEmailOutboxJob] = []
        for row in rows:
            attempts = mark_sending(db, row.id)
            claimed.append(
                ClaimedEmailOutboxJob(
                    id=row.id,
                    to_email=row.to_email,
                    subject=row.subject,
                    email_type=row.email_type,
                    payload_json=copy.deepcopy(row.payload_json or {}),
                    attempts=attempts,
                    priority=row.priority,
                )
            )
        db.commit()
        if recovered:
            logger.warning("email_outbox_recovered_stale count=%s", recovered)
        return claimed


def _apply_post_send_effects(
    db: Session,
    outbox: EmailOutbox,
    sent_at: datetime,
) -> None:
    payload = outbox.payload_json or {}
    meta = payload.get("meta") if isinstance(payload, dict) else {}
    if not isinstance(meta, dict):
        return

    member_id = meta.get("member_id")
    if member_id and meta.get("mark_member_card_delivered"):
        member = db.query(Member).filter(Member.id == int(member_id)).first()
        if member is not None:
            delivered_at = _to_naive_utc(sent_at)
            member.card_email_sent_at = delivered_at
            member.card_delivered_at = delivered_at

    campaign_recipient_id = meta.get("campaign_recipient_id")
    if campaign_recipient_id is not None:
        from app.services.email_campaigns import mark_campaign_recipient_sent

        mark_campaign_recipient_sent(
            db,
            recipient_id=int(campaign_recipient_id),
            provider_message_id=outbox.provider_message_id,
            sent_at=_to_naive_utc(sent_at),
        )


def _apply_post_processing_effects(
    db: Session,
    outbox: EmailOutbox,
) -> None:
    payload = outbox.payload_json or {}
    meta = payload.get("meta") if isinstance(payload, dict) else {}
    if not isinstance(meta, dict):
        return

    campaign_recipient_id = meta.get("campaign_recipient_id")
    if campaign_recipient_id is None:
        return

    from app.services.email_campaigns import mark_campaign_recipient_processing

    mark_campaign_recipient_processing(
        db,
        recipient_id=int(campaign_recipient_id),
    )


def _apply_post_failure_effects(
    db: Session,
    outbox: EmailOutbox,
    error: str,
) -> None:
    payload = outbox.payload_json or {}
    meta = payload.get("meta") if isinstance(payload, dict) else {}
    if not isinstance(meta, dict):
        return

    campaign_recipient_id = meta.get("campaign_recipient_id")
    if campaign_recipient_id is None:
        return

    from app.services.email_campaigns import mark_campaign_recipient_failed

    mark_campaign_recipient_failed(
        db,
        recipient_id=int(campaign_recipient_id),
        error_message=error,
    )


def _send_claimed_job(job: ClaimedEmailOutboxJob) -> str:
    payload = job.payload_json or {}
    text_body = str(payload.get("text_body") or "").strip()
    html_body = payload.get("html_body")
    inline_images = _deserialize_inline_images(payload.get("inline_images"))
    sender = payload.get("sender") if isinstance(payload, dict) else None
    sender_mode = "system"
    association = None
    reply_to = None
    if isinstance(sender, dict):
        sender_mode = str(sender.get("mode") or "system")
        association = sender.get("association")
        reply_to = sender.get("reply_to")
    if not text_body:
        raise PermanentEmailDeliveryError("Email payload missing text_body")
    return send_email_via_transport_low_level(
        to_email=job.to_email,
        subject=job.subject,
        text_body=text_body,
        html_body=str(html_body) if html_body is not None else None,
        inline_images=inline_images or None,
        mode=sender_mode,
        association=association,
        reply_to=reply_to,
    )


def process_outbox_once(limit: int | None = None) -> dict[str, int]:
    jobs = claim_due_email_batch(limit=limit)
    stats = {
        "claimed": len(jobs),
        "sent": 0,
        "retry_scheduled": 0,
        "permanent_failed": 0,
    }
    for job in jobs:
        try:
            provider_message_id = _send_claimed_job(job)
            with SessionLocal() as db:
                mark_sent(db, job.id, provider_message_id)
                db.commit()
            stats["sent"] += 1
            logger.info(
                "email_worker_result outbox_id=%s type=%s attempts=%s result=sent provider_message_id=%s",
                job.id,
                job.email_type,
                job.attempts,
                provider_message_id,
            )
        except RetryableEmailDeliveryError as exc:
            next_retry_at = compute_backoff(job.attempts)
            with SessionLocal() as db:
                mark_failed(db, job.id, str(exc), next_retry_at)
                db.commit()
            stats["retry_scheduled"] += 1
            logger.warning(
                "email_worker_result outbox_id=%s type=%s attempts=%s result=retry next_retry_at=%s error=%s",
                job.id,
                job.email_type,
                job.attempts,
                next_retry_at.isoformat(),
                exc,
            )
        except PermanentEmailDeliveryError as exc:
            next_retry_at = compute_permanent_failure_next_retry()
            with SessionLocal() as db:
                mark_failed(db, job.id, str(exc), next_retry_at, final_failure=True)
                db.commit()
            stats["permanent_failed"] += 1
            logger.error(
                "email_worker_result outbox_id=%s type=%s attempts=%s result=permanent_failed next_retry_at=%s error=%s",
                job.id,
                job.email_type,
                job.attempts,
                next_retry_at.isoformat(),
                exc,
            )
        except Exception as exc:
            next_retry_at = compute_backoff(job.attempts)
            with SessionLocal() as db:
                mark_failed(db, job.id, str(exc), next_retry_at)
                db.commit()
            stats["retry_scheduled"] += 1
            logger.exception(
                "email_worker_result outbox_id=%s type=%s attempts=%s result=retry_unexpected next_retry_at=%s",
                job.id,
                job.email_type,
                job.attempts,
                next_retry_at.isoformat(),
            )
    return stats


def drain_outbox_for_tests(*, max_loops: int = 20, limit: int | None = None) -> dict[str, int]:
    aggregated = {
        "claimed": 0,
        "sent": 0,
        "retry_scheduled": 0,
        "permanent_failed": 0,
    }
    for _ in range(max_loops):
        stats = process_outbox_once(limit=limit)
        for key in aggregated:
            aggregated[key] += stats.get(key, 0)
        if stats["claimed"] == 0:
            break
    return aggregated
