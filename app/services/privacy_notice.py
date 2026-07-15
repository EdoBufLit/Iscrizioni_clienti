"""Versioned evidence for the privacy notice shown during public signup."""

from __future__ import annotations

from datetime import datetime

from app.models import Member


# This digest is the SHA-256 of Privacy.tsx after normalising line endings to LF.
# The repository test makes any unnoticed text change fail until legal/technical
# reviewers intentionally publish a new version and digest.
PRIVACY_NOTICE_VERSION = "2026-07-15.1"
PRIVACY_NOTICE_SHA256 = (
    "3512b52e445781485c03a9c135607413ce3663dcf99bda610869cb0787f7a647"
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
