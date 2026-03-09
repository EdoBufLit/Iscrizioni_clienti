from __future__ import annotations

from dataclasses import dataclass
from email.utils import formataddr, parseaddr
import re
import unicodedata
from typing import Any

from app.config import settings


@dataclass(frozen=True)
class EmailSenderSelection:
    requested_mode: str
    selected_mode: str
    from_name: str | None
    from_email: str
    from_header: str
    reply_to: str | None
    fallback_used: bool


def _read_value(source: Any, key: str) -> Any:
    if source is None:
        return None
    if isinstance(source, dict):
        return source.get(key)
    return getattr(source, key, None)


def _normalize_mode(mode: str | None) -> str:
    normalized = (mode or "system").strip().lower()
    return normalized if normalized in {"system", "association"} else "system"


def _normalize_text(value: str | None) -> str | None:
    cleaned = str(value or "").strip()
    return cleaned or None


def _normalize_reply_to(value: str | None) -> str | None:
    cleaned = _normalize_text(value)
    if cleaned is None:
        return None
    _name, addr = parseaddr(cleaned)
    return addr or cleaned


def sanitize_email_local_part(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_only = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    lowered = ascii_only.lower().strip()
    lowered = re.sub(r"\s+", "-", lowered)
    lowered = re.sub(r"[^a-z0-9-]+", "-", lowered)
    lowered = re.sub(r"-{2,}", "-", lowered).strip("-")
    lowered = lowered[:48].strip("-")
    lowered = re.sub(r"-{2,}", "-", lowered).strip("-")
    return lowered


def generate_email_local_part_from_name(name: str | None) -> str:
    return sanitize_email_local_part(name)


def build_association_from_name(association: Any) -> str:
    override = _normalize_text(_read_value(association, "email_from_name_override"))
    if override:
        return override
    name = _normalize_text(_read_value(association, "name"))
    if name:
        return name
    return "ASSONAM"


def build_association_from_email(association: Any) -> str | None:
    domain = (settings.MAIL_FROM_DOMAIN or "").strip().lower().strip(".")
    if not domain:
        return None

    configured_local_part = sanitize_email_local_part(
        _read_value(association, "sender_email_local_part")
    )
    generated_local_part = generate_email_local_part_from_name(
        _read_value(association, "name")
    )
    fallback_id = _read_value(association, "id")
    fallback_local_part = sanitize_email_local_part(
        f"org-{fallback_id}" if fallback_id is not None else "org"
    )

    local_part = configured_local_part or generated_local_part or fallback_local_part
    return f"{local_part}@{domain}" if local_part else None


def build_association_from_header(association: Any) -> str | None:
    from_email = build_association_from_email(association)
    if not from_email:
        return None
    from_name = build_association_from_name(association)
    return formataddr((from_name, from_email))


def serialize_association_sender(association: Any) -> dict[str, Any] | None:
    if association is None:
        return None
    return {
        "id": _read_value(association, "id"),
        "name": _normalize_text(_read_value(association, "name")),
        "communications_enabled": bool(_read_value(association, "communications_enabled")),
        "sender_email_local_part": _normalize_text(
            _read_value(association, "sender_email_local_part")
        ),
        "email_from_name_override": _normalize_text(
            _read_value(association, "email_from_name_override")
        ),
        "reply_to_email": _normalize_text(_read_value(association, "reply_to_email")),
    }


def build_sender_payload(
    *,
    mode: str = "system",
    association: Any = None,
    reply_to: str | None = None,
) -> dict[str, Any]:
    return {
        "mode": _normalize_mode(mode),
        "association": serialize_association_sender(association),
        "reply_to": _normalize_reply_to(reply_to),
    }


def _build_system_selection(*, reply_to: str | None = None) -> EmailSenderSelection:
    raw_from = _normalize_text(settings.EMAIL_FROM) or _normalize_text(settings.SMTP_FROM) or "noreply@assonam.it"
    parsed_name, parsed_email = parseaddr(raw_from)
    from_email = parsed_email or raw_from
    from_name = _normalize_text(parsed_name)
    from_header = formataddr((from_name, from_email)) if from_name else from_email
    return EmailSenderSelection(
        requested_mode="system",
        selected_mode="system",
        from_name=from_name,
        from_email=from_email,
        from_header=from_header,
        reply_to=_normalize_reply_to(reply_to),
        fallback_used=False,
    )


def resolve_email_sender(
    *,
    mode: str = "system",
    association: Any = None,
    reply_to: str | None = None,
) -> EmailSenderSelection:
    requested_mode = _normalize_mode(mode)
    fallback_selection = _build_system_selection(reply_to=reply_to)
    if requested_mode != "association":
        return fallback_selection

    association_snapshot = serialize_association_sender(association)
    if not association_snapshot:
        return EmailSenderSelection(
            requested_mode=requested_mode,
            selected_mode=fallback_selection.selected_mode,
            from_name=fallback_selection.from_name,
            from_email=fallback_selection.from_email,
            from_header=fallback_selection.from_header,
            reply_to=fallback_selection.reply_to,
            fallback_used=True,
        )

    if not bool(association_snapshot.get("communications_enabled")):
        return EmailSenderSelection(
            requested_mode=requested_mode,
            selected_mode=fallback_selection.selected_mode,
            from_name=fallback_selection.from_name,
            from_email=fallback_selection.from_email,
            from_header=fallback_selection.from_header,
            reply_to=fallback_selection.reply_to,
            fallback_used=True,
        )

    from_email = build_association_from_email(association_snapshot)
    from_header = build_association_from_header(association_snapshot)
    if not from_email or not from_header:
        return EmailSenderSelection(
            requested_mode=requested_mode,
            selected_mode=fallback_selection.selected_mode,
            from_name=fallback_selection.from_name,
            from_email=fallback_selection.from_email,
            from_header=fallback_selection.from_header,
            reply_to=fallback_selection.reply_to,
            fallback_used=True,
        )

    association_reply_to = _normalize_reply_to(
        reply_to or association_snapshot.get("reply_to_email")
    )
    return EmailSenderSelection(
        requested_mode=requested_mode,
        selected_mode="association",
        from_name=build_association_from_name(association_snapshot),
        from_email=from_email,
        from_header=from_header,
        reply_to=association_reply_to,
        fallback_used=False,
    )
