from __future__ import annotations

import hashlib
import re
from collections.abc import Mapping, Sequence
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

_REDACTED = "[REDACTED]"
_MAX_STRING_LENGTH = 240

_SENSITIVE_KEY_PARTS = (
    "authorization",
    "body_html",
    "codice_fiscale",
    "content",
    "document",
    "email",
    "file",
    "filename",
    "fiscal",
    "html",
    "iban",
    "logo",
    "message",
    "mime",
    "password",
    "path",
    "payment",
    "payload",
    "phone",
    "secret",
    "signed",
    "subject",
    "template",
    "token",
    "url",
    "wallet",
    "whatsapp",
)

_SENSITIVE_QUERY_KEYS = {
    "authorization",
    "code",
    "email",
    "expires",
    "key",
    "payment",
    "phone",
    "signature",
    "signed",
    "token",
}

_EMAIL_RE = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
_FISCAL_CODE_RE = re.compile(r"\b[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]\b", re.I)
_BEARER_RE = re.compile(r"(?i)\b(bearer|token|secret|password|api[_-]?key)\s*[:=]\s*[A-Za-z0-9._~+/=-]{8,}")
_PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)")


def hash_identifier(value: object | None) -> str:
    normalized = str(value or "").strip().lower()
    if not normalized:
        return "unknown"
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def redact_url(value: object | None) -> str | None:
    if value is None:
        return None
    raw = str(value)
    try:
        parts = urlsplit(raw)
    except ValueError:
        return redact_for_log(raw)
    if not parts.scheme and not parts.netloc:
        return redact_for_log(raw)
    safe_query = []
    for key, query_value in parse_qsl(parts.query, keep_blank_values=True):
        if _is_sensitive_key(key):
            safe_query.append((key, _REDACTED))
        else:
            safe_query.append((key, redact_for_log(query_value)))
    return urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            parts.path,
            urlencode(safe_query, doseq=True),
            _REDACTED if parts.fragment else "",
        )
    )


def redact_mapping(data: Mapping[object, object] | None) -> dict[str, object] | None:
    if data is None:
        return None
    return {
        str(key): (_REDACTED if _is_sensitive_key(str(key)) else redact_for_log(value))
        for key, value in data.items()
    }


def redact_for_log(value: object | None) -> object:
    if value is None or isinstance(value, bool | int | float):
        return value
    if isinstance(value, Mapping):
        return redact_mapping(value)
    if isinstance(value, Sequence) and not isinstance(value, str | bytes | bytearray):
        return [redact_for_log(item) for item in value]
    if isinstance(value, bytes | bytearray):
        return f"<{len(value)} bytes redacted>"

    text = str(value)
    if "://" in text:
        redacted_url = redact_url(text)
        if redacted_url is not None:
            return redacted_url

    text = _EMAIL_RE.sub(lambda match: f"email_hash:{hash_identifier(match.group(0))}", text)
    text = _FISCAL_CODE_RE.sub(_REDACTED, text)
    text = _BEARER_RE.sub(lambda match: f"{match.group(1)}={_REDACTED}", text)
    text = _PHONE_RE.sub(_REDACTED, text)
    if len(text) > _MAX_STRING_LENGTH:
        return f"{text[:_MAX_STRING_LENGTH]}..."
    return text


def _is_sensitive_key(key: str) -> bool:
    normalized = key.strip().lower().replace("-", "_")
    return normalized in _SENSITIVE_QUERY_KEYS or any(part in normalized for part in _SENSITIVE_KEY_PARTS)
