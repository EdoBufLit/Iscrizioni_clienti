"""Durable, explicitly addressed Twilio notifications for central publications.

Only publication enqueues rows. A replay or enabling a template never backfills
old messages. Ambiguous network outcomes require review rather than a blind
retry: Twilio message creation has no application idempotency key.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import json
import logging
import re

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import AdminRole, AdminUser, AffiliateCommunicationRecipient, AffiliateCommunicationWhatsApp, Organization
from app.services.twilio_notifications import normalize_e164_phone

try:
    from twilio.http.http_client import TwilioHttpClient
    from twilio.rest import Client as TwilioClient
except ImportError:  # pragma: no cover - optional only in unconfigured local installs
    TwilioHttpClient = TwilioClient = None

logger = logging.getLogger(__name__)
_CONTENT_SID = re.compile(r"^HX[0-9a-fA-F]{32}$")
_MESSAGE_SID = re.compile(r"^(?:SM|MM)[0-9a-fA-F]{32}$")
_MAX_ATTEMPTS = 3
_STALE_SECONDS = 300


def _configuration() -> tuple[str, str | None]:
    return (
        str(getattr(settings, "TWILIO_CENTRAL_COMMUNICATION_CONTENT_SID", "") or "").strip(),
        normalize_e164_phone(settings.TWILIO_WHATSAPP_FROM),
    )


def central_whatsapp_is_configured() -> bool:
    content_sid, sender = _configuration()
    return bool(_CONTENT_SID.fullmatch(content_sid) and sender and settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN)


def whatsapp_available(org: Organization, admins: list[AdminUser]) -> bool:
    return bool(central_whatsapp_is_configured() and admins and normalize_e164_phone(org.whatsapp_e164))


def enqueue_central_whatsapp(
    db: Session, *, communication_id: int, org: Organization, admins: list[AdminUser],
) -> AffiliateCommunicationWhatsApp:
    """Participate in the caller's transaction; never commit or call Twilio."""
    existing = db.query(AffiliateCommunicationWhatsApp).filter_by(
        communication_id=communication_id, organization_id=org.id,
    ).first()
    if existing is not None:
        return existing
    content_sid, sender = _configuration()
    phone = normalize_e164_phone(org.whatsapp_e164)
    reason = None
    if not central_whatsapp_is_configured():
        reason = "configuration_missing"
    elif not admins:
        reason = "no_active_admin"
    elif not phone:
        reason = "missing_or_invalid_phone"
    job = AffiliateCommunicationWhatsApp(
        communication_id=communication_id, organization_id=org.id,
        organization_name=" ".join((org.name or "").split())[:500] or "Associazione",
        to_phone=phone, from_phone=sender,
        content_sid=content_sid if _CONTENT_SID.fullmatch(content_sid) else None,
        status="skipped" if reason else "queued", last_error=reason,
    )
    db.add(job)
    db.flush()
    return job


def central_whatsapp_summary(db: Session | None, communication_id: int) -> dict:
    statuses = {} if db is None else dict(db.query(
        AffiliateCommunicationWhatsApp.status, func.count(AffiliateCommunicationWhatsApp.id),
    ).filter(AffiliateCommunicationWhatsApp.communication_id == communication_id).group_by(
        AffiliateCommunicationWhatsApp.status,
    ).all())
    return {
        "whatsapp_count": sum(count for status, count in statuses.items() if status != "skipped"),
        "whatsapp_skipped_count": statuses.get("skipped", 0),
        "whatsapp_status_counts": statuses,
    }


def recover_stale_central_whatsapp(db: Session, *, now: datetime) -> int:
    return int(db.query(AffiliateCommunicationWhatsApp).filter(
        AffiliateCommunicationWhatsApp.status == "sending",
        AffiliateCommunicationWhatsApp.updated_at <= now - timedelta(seconds=_STALE_SECONDS),
    ).update({
        "status": "uncertain", "last_error": "worker_interrupted_delivery_unknown", "updated_at": now,
    }, synchronize_session=False))


def claim_next_central_whatsapp(*, now: datetime | None = None) -> str | None:
    """CAS protects SQLite too, where SELECT FOR UPDATE is ignored."""
    current = now or datetime.utcnow()
    with SessionLocal() as db:
        query = db.query(AffiliateCommunicationWhatsApp.id).filter(
            AffiliateCommunicationWhatsApp.status.in_(("queued", "retry")),
            AffiliateCommunicationWhatsApp.next_attempt_at <= current,
            AffiliateCommunicationWhatsApp.attempts < _MAX_ATTEMPTS,
        ).order_by(AffiliateCommunicationWhatsApp.created_at, AffiliateCommunicationWhatsApp.id)
        if db.get_bind().dialect.name == "postgresql":
            query = query.with_for_update(skip_locked=True)
        row = query.first()
        if row is None:
            return None
        updated = db.query(AffiliateCommunicationWhatsApp).filter(
            AffiliateCommunicationWhatsApp.id == row.id,
            AffiliateCommunicationWhatsApp.status.in_(("queued", "retry")),
            AffiliateCommunicationWhatsApp.next_attempt_at <= current,
            AffiliateCommunicationWhatsApp.attempts < _MAX_ATTEMPTS,
        ).update({
            "status": "sending", "attempts": AffiliateCommunicationWhatsApp.attempts + 1,
            "updated_at": current,
        }, synchronize_session=False)
        db.commit()
        return row.id if updated else None


def _create_twilio_client():
    if not central_whatsapp_is_configured() or TwilioClient is None or TwilioHttpClient is None:
        return None
    # No transport retries: a lost HTTP response does not prove a send failed.
    return TwilioClient(
        settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN,
        http_client=TwilioHttpClient(timeout=10, max_retries=0),
    )


def _validated_payload(db: Session, job: AffiliateCommunicationWhatsApp) -> tuple[dict | None, str | None]:
    if not central_whatsapp_is_configured():
        return None, "configuration_missing"
    content_sid, sender = _configuration()
    if job.content_sid != content_sid or job.from_phone != sender:
        return None, "configuration_changed"
    org = db.get(Organization, job.organization_id)
    if org is None or not org.is_active or org.deleted_at is not None:
        return None, "organization_unavailable"
    if not job.to_phone or normalize_e164_phone(org.whatsapp_e164) != job.to_phone:
        return None, "recipient_phone_changed"
    recipient = db.query(AffiliateCommunicationRecipient.id).filter_by(
        communication_id=job.communication_id, organization_id=job.organization_id,
    ).first()
    admin = db.query(AdminUser.id).filter(
        AdminUser.org_id == job.organization_id, AdminUser.role == AdminRole.ORG_ADMIN,
        AdminUser.is_active.is_(True), AdminUser.deleted_at.is_(None),
    ).first()
    if recipient is None or admin is None:
        return None, "recipient_access_unavailable"
    return {
        "to": f"whatsapp:{job.to_phone}", "from_": f"whatsapp:{job.from_phone}",
        "content_sid": job.content_sid,
        # Always override BOTH samples: the URL variable must be the numeric ID.
        "content_variables": json.dumps({"1": job.organization_name, "2": str(job.communication_id)}, ensure_ascii=False),
    }, None


def _finish(job_id: str, *, status: str, error: str | None = None, provider_id: str | None = None, retry: bool = False) -> None:
    now = datetime.utcnow()
    values = {"status": status, "last_error": error, "updated_at": now}
    if provider_id:
        values["provider_message_id"] = provider_id
    if status == "accepted":
        values["accepted_at"] = now
    if retry:
        values["next_attempt_at"] = now + timedelta(seconds=60)
    with SessionLocal() as db:
        db.query(AffiliateCommunicationWhatsApp).filter(
            AffiliateCommunicationWhatsApp.id == job_id,
            AffiliateCommunicationWhatsApp.status.in_(("sending", "uncertain")),
        ).update(values, synchronize_session=False)
        db.commit()


def _deliver(job_id: str) -> str:
    with SessionLocal() as db:
        job = db.get(AffiliateCommunicationWhatsApp, job_id)
        if job is None or job.status != "sending":
            return "skipped"
        payload, reason = _validated_payload(db, job)
        attempts = job.attempts
    if reason:
        _finish(job_id, status="skipped", error=reason)
        return "skipped"
    client = _create_twilio_client()
    if client is None:
        _finish(job_id, status="skipped", error="twilio_client_unavailable")
        return "skipped"
    try:
        response = client.messages.create(**payload)
        provider_id = str(getattr(response, "sid", "") or "")
        if not _MESSAGE_SID.fullmatch(provider_id):
            _finish(job_id, status="uncertain", error="twilio_response_missing_message_id")
            return "uncertain"
        provider_status = str(getattr(response, "status", "") or "").lower()
        if provider_status in ("failed", "undelivered"):
            _finish(job_id, status="failed", error=f"twilio_message_{provider_status}", provider_id=provider_id)
            return "failed"
        _finish(job_id, status="accepted", provider_id=provider_id)
        return "accepted"
    except Exception as exc:
        # Never persist exception text: providers can echo addresses and content.
        status = getattr(exc, "status", None)
        code = getattr(exc, "code", None)
        error = f"twilio_error_{code}" if isinstance(code, int) else f"twilio_http_{status}" if isinstance(status, int) else "twilio_transport_outcome_unknown"
        if status == 429:
            retry = attempts < _MAX_ATTEMPTS
            result = "retry" if retry else "failed"
            _finish(job_id, status=result, error=error, retry=retry)
        elif isinstance(status, int) and 400 <= status < 500:
            result = "failed"
            _finish(job_id, status=result, error=error)
        else:
            result = "uncertain"
            _finish(job_id, status=result, error=error)
        logger.warning("central_whatsapp_delivery_failed job_id=%s state=%s error=%s", job_id, result, error)
        return result


def process_central_whatsapp_outbox_once(limit: int | None = None) -> dict[str, int]:
    stats = {key: 0 for key in ("claimed", "accepted", "retry", "failed", "uncertain", "skipped")}
    with SessionLocal() as db:
        stats["recovered_uncertain"] = recover_stale_central_whatsapp(db, now=datetime.utcnow())
        db.commit()
    for _ in range(max(0, min(int(limit if limit is not None else 20), 100))):
        job_id = claim_next_central_whatsapp()
        if job_id is None:
            break
        stats["claimed"] += 1
        stats[_deliver(job_id)] += 1
    return stats
