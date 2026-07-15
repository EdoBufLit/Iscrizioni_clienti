"""Versioned evidence for the privacy notice shown during public signup."""

from __future__ import annotations

from datetime import datetime

from app.models import Member


# This digest is the SHA-256 of Privacy.tsx after normalising line endings to LF.
# The repository test makes any unnoticed text change fail until legal/technical
# reviewers intentionally publish a new version and digest.
PRIVACY_NOTICE_VERSION = "2026-07-15.2"
PRIVACY_NOTICE_SHA256 = (
    "a003fa011da6c0a13adc3a52e1eed1444c9f5d3b613234db43c2ed25a057a553"
)


def record_privacy_notice_acknowledgement(
    member: Member,
    *,
    association_privacy_version: str | None,
    accepted_at: datetime | None = None,
) -> None:
    """Record association and platform notice evidence without conflating consent."""

    member.accepted_privacy_at = accepted_at or datetime.utcnow()
    member.accepted_privacy_version = association_privacy_version
    member.accepted_privacy_notice_version = PRIVACY_NOTICE_VERSION
    member.accepted_privacy_notice_sha256 = PRIVACY_NOTICE_SHA256
