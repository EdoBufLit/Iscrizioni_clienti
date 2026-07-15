from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import TypedDict

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models import MarketingConsentEvent, Member


MARKETING_NOTICE_VERSION = "2026-07-15"
MARKETING_CHANNEL_EMAIL = "email"
MARKETING_ACTION_GRANTED = "granted"
MARKETING_ACTION_REVOKED = "revoked"

_PROOF_PREFIX = "marketing-consent-proof-v1"  # nosec hardcoded_password_string
_UNSUBSCRIBE_PREFIX = "marketing-unsubscribe-v1"  # nosec hardcoded_password_string


class MarketingUnsubscribePayload(TypedDict):
    member_id: int
    org_id: int


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _keyed_hash(namespace: str, value: object | None) -> str | None:
    normalized = str(value or "").strip().lower()
    if not normalized:
        return None
    key = (settings.SECRET_KEY or "").encode("utf-8")
    message = f"{_PROOF_PREFIX}:{namespace}:{normalized}".encode("utf-8")
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def marketing_subject_reference(*, org_id: int, member_id: int) -> str:
    value = _keyed_hash("member", f"{int(org_id)}:{int(member_id)}")
    if value is None:  # pragma: no cover - positive integer callers guarantee this
        raise ValueError("A valid member reference is required")
    return value


def marketing_email_reference(email: str) -> str:
    value = _keyed_hash("email", email)
    if value is None:
        raise ValueError("A valid email is required")
    return value


def _append_event(
    db: Session,
    *,
    member: Member,
    action: str,
    source: str,
    notice_version: str,
    occurred_at: datetime,
    client_ip: str | None,
    user_agent: str | None,
) -> MarketingConsentEvent:
    if member.id is None or member.org_id is None:
        raise ValueError("The member must be persisted before recording consent")
    event = MarketingConsentEvent(
        association_id=int(member.org_id),
        subject_ref_hash=marketing_subject_reference(
            org_id=int(member.org_id), member_id=int(member.id)
        ),
        email_hash=marketing_email_reference(member.email or ""),
        channel=MARKETING_CHANNEL_EMAIL,
        event_action=action,
        notice_version=notice_version,
        source=str(source or "unknown")[:64],
        ip_hash=_keyed_hash("ip", client_ip),
        user_agent_hash=_keyed_hash("user-agent", user_agent),
        occurred_at=occurred_at,
    )
    db.add(event)
    return event


def grant_email_marketing_consent(
    db: Session,
    *,
    member: Member,
    source: str,
    client_ip: str | None = None,
    user_agent: str | None = None,
    notice_version: str = MARKETING_NOTICE_VERSION,
) -> bool:
    """Record an explicit grant. Callers must establish control/creation first."""

    if bool(getattr(member, "marketing_email_consent", False)):
        return False
    now = _utcnow()
    member.marketing_email_consent = True
    member.marketing_email_consent_at = now
    member.marketing_email_consent_withdrawn_at = None
    member.marketing_email_consent_version = notice_version
    _append_event(
        db,
        member=member,
        action=MARKETING_ACTION_GRANTED,
        source=source,
        notice_version=notice_version,
        occurred_at=now,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    return True


def revoke_email_marketing_consent(
    db: Session,
    *,
    member: Member,
    source: str = "email_unsubscribe",
    client_ip: str | None = None,
    user_agent: str | None = None,
) -> int:
    """Revoke all matching active rows in the same association, idempotently."""

    normalized_email = str(member.email or "").strip().lower()
    if not normalized_email or member.org_id is None:
        return 0
    affected = (
        db.query(Member)
        .filter(
            Member.org_id == member.org_id,
            Member.deleted_at.is_(None),
            func.lower(Member.email) == normalized_email,
            Member.marketing_email_consent.is_(True),
        )
        .all()
    )
    now = _utcnow()
    for affected_member in affected:
        affected_member.marketing_email_consent = False
        affected_member.marketing_email_consent_withdrawn_at = now
        _append_event(
            db,
            member=affected_member,
            action=MARKETING_ACTION_REVOKED,
            source=source,
            notice_version=(
                affected_member.marketing_email_consent_version
                or MARKETING_NOTICE_VERSION
            ),
            occurred_at=now,
            client_ip=client_ip,
            user_agent=user_agent,
        )
    return len(affected)


def _sign_unsubscribe_payload(encoded_payload: str) -> str:
    return hmac.new(
        (settings.SECRET_KEY or "").encode("utf-8"),
        f"{_UNSUBSCRIBE_PREFIX}.{encoded_payload}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def build_marketing_unsubscribe_token(*, member_id: int, org_id: int) -> str:
    payload = {"v": 1, "member_id": int(member_id), "org_id": int(org_id)}
    encoded_payload = _b64url_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    return f"{encoded_payload}.{_sign_unsubscribe_payload(encoded_payload)}"


def parse_marketing_unsubscribe_token(
    token: str,
) -> MarketingUnsubscribePayload | None:
    if not token or len(token) > 1024:
        return None
    try:
        encoded_payload, signature = token.split(".", 1)
    except ValueError:
        return None
    expected = _sign_unsubscribe_payload(encoded_payload)
    if not hmac.compare_digest(signature, expected):
        return None
    try:
        payload = json.loads(_b64url_decode(encoded_payload).decode("utf-8"))
        if payload.get("v") != 1:
            return None
        member_id = int(payload["member_id"])
        org_id = int(payload["org_id"])
    except (KeyError, TypeError, ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if member_id <= 0 or org_id <= 0:
        return None
    return {"member_id": member_id, "org_id": org_id}


def resolve_marketing_unsubscribe_member(
    db: Session,
    *,
    token: str,
) -> Member | None:
    payload = parse_marketing_unsubscribe_token(token)
    if payload is None:
        return None
    return (
        db.query(Member)
        .filter(
            Member.id == payload["member_id"],
            Member.org_id == payload["org_id"],
            Member.deleted_at.is_(None),
        )
        .first()
    )


def build_marketing_unsubscribe_url(member: Member) -> str:
    if member.id is None or member.org_id is None:
        raise ValueError("The member must be persisted before building a link")
    base_url = (settings.BASE_URL or "").strip().rstrip("/")
    token = build_marketing_unsubscribe_token(
        member_id=int(member.id), org_id=int(member.org_id)
    )
    return f"{base_url}/email-preferences/unsubscribe/{token}"
