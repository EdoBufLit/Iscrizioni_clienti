from __future__ import annotations

import hashlib
from pathlib import Path

from app.services.privacy_notice import (
    PRIVACY_NOTICE_SHA256,
    PRIVACY_NOTICE_VERSION,
)


def test_published_privacy_notice_matches_versioned_digest():
    source_path = (
        Path(__file__).resolve().parents[1]
        / "frontend"
        / "src"
        / "pages"
        / "Privacy.tsx"
    )
    normalized_source = source_path.read_text(encoding="utf-8").replace(
        "\r\n", "\n"
    ).replace("\r", "\n")
    actual_digest = hashlib.sha256(normalized_source.encode("utf-8")).hexdigest()

    assert PRIVACY_NOTICE_VERSION == "2026-07-15.2"
    assert actual_digest == PRIVACY_NOTICE_SHA256
