from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Any

from app.config import settings
from app.utils import hash_token


AFFILIATION_PUBLIC_TOKEN_VERSION = 1
AFFILIATION_PUBLIC_TOKEN_TTL_DAYS = 30


class AffiliationCapabilityIntegrityError(RuntimeError):
    """Raised when persisted capability metadata cannot reproduce its token."""


def derive_affiliation_public_token(*, application_id: int, version: int) -> str:
    """Derive the public bearer without ever persisting it.

    Twenty-four digest bytes encoded as URL-safe base64 preserve the existing
    32-character token shape produced by ``secrets.token_urlsafe(24)``.
    """

    message = f"affiliation-public-token:v{int(version)}:{int(application_id)}".encode()
    digest = hmac.new(
        settings.SECRET_KEY.encode(),
        message,
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest[:24]).rstrip(b"=").decode("ascii")


def affiliation_public_token(application: Any) -> str:
    """Return the raw capability for a new record or the legacy plaintext token."""

    version = getattr(application, "public_token_version", None)
    stored_hash = getattr(application, "public_token_hash", None)
    if version is None and stored_hash is None:
        # Compatibility path for links issued before capability hardening.
        return str(application.public_token)
    if version is None or not stored_hash or not getattr(application, "id", None):
        raise AffiliationCapabilityIntegrityError(
            "Incomplete affiliation capability metadata"
        )

    raw_token = derive_affiliation_public_token(
        application_id=int(application.id),
        version=int(version),
    )
    if not hmac.compare_digest(hash_token(raw_token), str(stored_hash)):
        raise AffiliationCapabilityIntegrityError(
            "Affiliation capability hash does not match its derivation"
        )
    return raw_token


def initialize_affiliation_capability(application: Any) -> str:
    """Populate hash-only capability metadata after the row has received an id."""

    if not getattr(application, "id", None):
        raise ValueError("The affiliation application must be flushed before token setup")

    version = AFFILIATION_PUBLIC_TOKEN_VERSION
    raw_token = derive_affiliation_public_token(
        application_id=int(application.id),
        version=version,
    )
    token_hash = hash_token(raw_token)
    application.public_token_version = version
    application.public_token_hash = token_hash
    application.public_token_expires_at = datetime.now(timezone.utc) + timedelta(
        days=AFFILIATION_PUBLIC_TOKEN_TTL_DAYS
    )
    # The legacy NOT NULL/unique column remains usable during rolling deploys,
    # but stores no bearer secret for newly created records.
    application.public_token = token_hash
    return raw_token


def affiliation_capability_is_expired(
    application: Any,
    *,
    now: datetime | None = None,
) -> bool:
    """Legacy capabilities do not get a retroactive expiry; new ones fail closed."""

    version = getattr(application, "public_token_version", None)
    stored_hash = getattr(application, "public_token_hash", None)
    if version is None and stored_hash is None:
        return False

    expires_at = getattr(application, "public_token_expires_at", None)
    if expires_at is None:
        return True
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    reference = now or datetime.now(timezone.utc)
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=timezone.utc)
    return expires_at <= reference


def affiliation_public_token_hash(raw_token: str) -> str:
    return hash_token(raw_token)
