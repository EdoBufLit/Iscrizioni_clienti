"""Structured audit logging for security-relevant events.

Emits one JSON line per event to the ``audit`` logger at INFO level.
No PII (emails) in plaintext — use truncated SHA-256 hashes instead.
"""

import hashlib
import json
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import OperationLog

_logger = logging.getLogger("audit")
if not _logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(_handler)
    _logger.setLevel(logging.INFO)


def _emit(event: str, **kwargs):
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event,
        **kwargs,
    }
    _logger.info(json.dumps(record, default=str))


def _hash_email(email: str) -> str:
    return hashlib.sha256(email.lower().strip().encode()).hexdigest()[:16]


# ── Auth events ───────────────────────────────────────────────────

def member_magic_link_requested(email: str, ip: str):
    _emit("member.magic_link_requested", email_hash=_hash_email(email), ip=ip)


def member_verified(member_id: int, ip: str):
    _emit("member.verified", member_id=member_id, ip=ip)


def org_admin_magic_link_requested(email: str, ip: str):
    _emit("org_admin.magic_link_requested", email_hash=_hash_email(email), ip=ip)


def org_admin_verified(admin_id: int, org_id: int, ip: str):
    _emit("org_admin.verified", admin_id=admin_id, org_id=org_id, ip=ip)


def super_admin_login(admin_id: int, ip: str):
    _emit("super_admin.login", admin_id=admin_id, ip=ip)


def super_admin_login_failed(ip: str):
    _emit("super_admin.login_failed", ip=ip)


def org_admin_deleted(admin_id: int, org_id: int, super_admin_id: int):
    _emit("super_admin.org_admin_deleted", admin_id=admin_id, org_id=org_id, super_admin_id=super_admin_id)


def org_admin_restored(admin_id: int, org_id: int, super_admin_id: int):
    _emit("super_admin.org_admin_restored", admin_id=admin_id, org_id=org_id, super_admin_id=super_admin_id)

def org_admin_restored_on_create(admin_id: int, org_id: int, email_hash: str):
    _emit("super_admin.org_admin_restored_on_create", admin_id=admin_id, org_id=org_id, email_hash=email_hash)

def org_admin_created(admin_id: int, org_id: int, email_hash: str):
    _emit("super_admin.org_admin_created", admin_id=admin_id, org_id=org_id, email_hash=email_hash)


# ── Join events ───────────────────────────────────────────────────

def join_submitted(org_slug: str, org_id: int, ip: str):
    _emit("join.submitted", org_slug=org_slug, org_id=org_id, ip=ip)


def join_completed(member_id: int, org_id: int, card_assigned: bool):
    _emit("join.completed", member_id=member_id, org_id=org_id, card_assigned=card_assigned)


# ── Card events ───────────────────────────────────────────────────

def card_assigned(member_id: int, org_id: int, card_no: int):
    _emit("card.assigned", member_id=member_id, org_id=org_id, card_no=card_no)


def card_batch_added(org_id: int, start_no: int, end_no: int, admin_id: int):
    _emit("card.batch_added", org_id=org_id, start_no=start_no, end_no=end_no, admin_id=admin_id)


def card_stock_increased(org_id: int, amount: int, admin_id: int, reason: str | None = None, paid_ref: str | None = None):
    _emit(
        "card.stock_increased",
        org_id=org_id,
        amount=amount,
        admin_id=admin_id,
        reason=reason,
        paid_ref=paid_ref,
    )


def log_operation(
    db: Session,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    actor_admin_id: int | None = None,
    actor_role: str | None = None,
    metadata: dict | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
):
    """
    Writes an audit entry to the database and emits to logger.
    """
    # 1. DB Log
    op_log = OperationLog(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_admin_id=actor_admin_id,
        actor_role=actor_role,
        metadata_json=metadata,
        ip=ip,
        user_agent=user_agent,
    )
    db.add(op_log)

    # 2. File Log (redundancy)
    _emit(
        action,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_id=actor_admin_id,
        ip=ip,
        metadata=metadata
    )
