from __future__ import annotations

import base64
import hashlib
import hmac
from typing import Any

from app.config import settings
from app.utils import hash_token


ACCOUNTING_SHARE_TOKEN_VERSION = 1


class AccountingCapabilityIntegrityError(RuntimeError):
    """Raised when stored metadata cannot reproduce a public capability."""


def derive_accounting_share_token(*, share_link_id: int, version: int) -> str:
    """Derive the public bearer without storing it in the database.

    Twenty-four digest bytes preserve the 32-character URL-safe token shape
    previously produced by ``secrets.token_urlsafe(24)``.
    """

    message = (
        f"accounting-share-token:v{int(version)}:{int(share_link_id)}"
    ).encode("utf-8")
    digest = hmac.new(
        (settings.SECRET_KEY or "").encode("utf-8"),
        message,
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest[:24]).rstrip(b"=").decode("ascii")


def accounting_share_token(link: Any) -> str:
    """Return a reconstructed bearer, or the plaintext token for a legacy row."""

    version = getattr(link, "token_version", None)
    stored_hash = getattr(link, "token_hash", None)
    if version is None and stored_hash is None:
        return str(link.token)
    if version is None or not stored_hash or not getattr(link, "id", None):
        raise AccountingCapabilityIntegrityError(
            "Incomplete accounting share capability metadata"
        )

    raw_token = derive_accounting_share_token(
        share_link_id=int(link.id),
        version=int(version),
    )
    if not hmac.compare_digest(hash_token(raw_token), str(stored_hash)):
        raise AccountingCapabilityIntegrityError(
            "Accounting share capability hash does not match its derivation"
        )
    return raw_token


def initialize_accounting_share_capability(link: Any) -> str:
    """Populate hash-only capability metadata after the link receives its id."""

    if not getattr(link, "id", None):
        raise ValueError("The accounting share link must be flushed before setup")

    version = ACCOUNTING_SHARE_TOKEN_VERSION
    raw_token = derive_accounting_share_token(
        share_link_id=int(link.id),
        version=version,
    )
    token_hash = hash_token(raw_token)
    link.token_version = version
    link.token_hash = token_hash
    # The legacy NOT NULL/unique column remains usable during rolling deploys,
    # but stores a verifier rather than the public bearer for every new link.
    link.token = token_hash
    return raw_token


def accounting_share_token_hash(raw_token: str) -> str:
    return hash_token(raw_token)
