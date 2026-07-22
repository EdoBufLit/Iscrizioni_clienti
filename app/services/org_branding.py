from __future__ import annotations

import logging
import re

from app.models import Organization

logger = logging.getLogger(__name__)

_SUBJECT_FALLBACK_TEMPLATE = "La tua tessera {org_name}"
_EMAIL_LIKE_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_CLUB_DISPLAY_NAME_BY_SLUG_OVERRIDE = {
    # Customer-facing naming override requested for card rendering.
    "oasi-2": "Golden Age Club - Speakeasy",
    "t-a-g-culture": "TAG CULTURE",
}
_CARD_LOGO_BY_SLUG_FALLBACK = {
    # Requested by customer branding: dedicated Golden Age logo for oasi-2 cards.
    "oasi-2": "/static/card-logos/oasi-2.png",
}
_WALLET_BRANDING_BY_SLUG_FALLBACK = {
    "oasi-2": {
        "bg_color": "#0B3C75",
        "logo_url": "/static/card-logos/oasi-2.png",
        "hero_image_url": "/static/wallet-heroes/oasi-2-hero.png",
        "title_override": "Golden Age Club - Speakeasy",
    }
}
_DEFAULT_WALLET_BG_COLOR = "#0B3C75"
_DEFAULT_WALLET_HERO_IMAGE_URL = "/static/wallet-heroes/assonam-default-hero.png"


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None


def _normalize_tag_culture_name(value: str | None) -> str | None:
    cleaned = _normalize_text(value)
    if not cleaned:
        return cleaned
    return cleaned.replace("T.A.G.", "TAG")


def _looks_like_email_address(value: str | None) -> bool:
    cleaned = _normalize_text(value)
    if not cleaned:
        return False
    return _EMAIL_LIKE_PATTERN.fullmatch(cleaned) is not None


def sanitize_card_email_subject_template(value: str | None) -> str | None:
    cleaned = _normalize_text(value)
    if not cleaned:
        return None
    if _looks_like_email_address(cleaned):
        return None
    return cleaned


def _is_absolute_url(value: str) -> bool:
    lowered = value.lower()
    return lowered.startswith("http://") or lowered.startswith("https://")


def _to_absolute_url(value: str, base_url: str | None = None) -> str:
    cleaned = value.strip()
    if _is_absolute_url(cleaned):
        return cleaned

    normalized_base = (base_url or "").strip().rstrip("/")
    if not normalized_base:
        return cleaned
    return f"{normalized_base}/{cleaned.lstrip('/')}"


def resolve_club_display_name(org: Organization | None) -> str:
    if org is None:
        return ""
    explicit = _normalize_tag_culture_name(getattr(org, "club_display_name", None))
    if explicit:
        return explicit

    slug = _normalize_text(getattr(org, "slug", None))
    if slug:
        slug_override = _CLUB_DISPLAY_NAME_BY_SLUG_OVERRIDE.get(slug)
        if slug_override:
            return slug_override

    return _normalize_tag_culture_name(getattr(org, "name", None)) or ""


def resolve_card_email_subject(org: Organization | None) -> str:
    club_name = resolve_club_display_name(org)
    org_name = _normalize_text(getattr(org, "name", None) if org else None) or club_name
    template = sanitize_card_email_subject_template(
        getattr(org, "card_email_subject", None) if org else None
    ) or _SUBJECT_FALLBACK_TEMPLATE
    values = {
        "club_display_name": club_name or org_name,
        "org_name": org_name,
        "org": org_name,
    }
    if template == _SUBJECT_FALLBACK_TEMPLATE and _looks_like_email_address(
        getattr(org, "card_email_subject", None) if org else None
    ):
        logger.warning(
            "Ignoring invalid card email subject that looks like an email address for org_id=%s",
            getattr(org, "id", None) if org else None,
        )
    try:
        rendered = template.format(**values)
    except Exception:
        rendered = ""
    rendered = rendered.strip()
    if rendered and "{" not in rendered and "}" not in rendered and not _looks_like_email_address(rendered):
        return rendered
    return _SUBJECT_FALLBACK_TEMPLATE.format(**values)


def resolve_card_logo_url(
    org: Organization | None, *, base_url: str | None = None
) -> str | None:
    if org is None:
        return None

    explicit = _normalize_text(getattr(org, "card_logo_url", None))
    if explicit:
        return _to_absolute_url(explicit, base_url=base_url)

    slug = _normalize_text(getattr(org, "slug", None))
    if slug:
        slug_fallback = _CARD_LOGO_BY_SLUG_FALLBACK.get(slug)
        if slug_fallback:
            return _to_absolute_url(slug_fallback, base_url=base_url)

    logo_path = _normalize_text(getattr(org, "logo_path", None))
    if logo_path and slug:
        return _to_absolute_url(f"/api/organizations/{slug}/logo", base_url=base_url)

    return None


def resolve_assonam_logo_url(
    *, frontend_base_url: str | None = None, backend_base_url: str | None = None
) -> str:
    if _normalize_text(frontend_base_url):
        return _to_absolute_url("/logo-transparent.png", base_url=frontend_base_url)
    if _normalize_text(backend_base_url):
        return _to_absolute_url("/logo-transparent.png", base_url=backend_base_url)
    return "/logo-transparent.png"


def _wallet_branding_defaults_for_org(org: Organization | None) -> dict[str, str]:
    slug = _normalize_text(getattr(org, "slug", None) if org else None)
    if not slug:
        return {}
    return dict(_WALLET_BRANDING_BY_SLUG_FALLBACK.get(slug, {}))


def _is_hex_color(value: str | None) -> bool:
    cleaned = _normalize_text(value)
    if not cleaned:
        return False
    if len(cleaned) != 7 or not cleaned.startswith("#"):
        return False
    return all(ch in "0123456789abcdefABCDEF" for ch in cleaned[1:])


def resolve_wallet_bg_color(org: Organization | None) -> str:
    explicit = _normalize_text(getattr(org, "wallet_bg_color", None) if org else None)
    if _is_hex_color(explicit):
        return str(explicit).upper()
    defaults = _wallet_branding_defaults_for_org(org)
    fallback = _normalize_text(defaults.get("bg_color"))
    if _is_hex_color(fallback):
        return str(fallback).upper()
    return _DEFAULT_WALLET_BG_COLOR


def resolve_wallet_logo_url(
    org: Organization | None, *, base_url: str | None = None
) -> str | None:
    explicit = _normalize_text(getattr(org, "wallet_logo_url", None) if org else None)
    if explicit:
        return _to_absolute_url(explicit, base_url=base_url)
    defaults = _wallet_branding_defaults_for_org(org)
    fallback = _normalize_text(defaults.get("logo_url"))
    if fallback:
        return _to_absolute_url(fallback, base_url=base_url)
    return None


def resolve_wallet_hero_image_url(
    org: Organization | None, *, base_url: str | None = None
) -> str | None:
    explicit = _normalize_text(
        getattr(org, "wallet_hero_image_url", None) if org else None
    )
    if explicit:
        return _to_absolute_url(explicit, base_url=base_url)
    defaults = _wallet_branding_defaults_for_org(org)
    fallback = _normalize_text(defaults.get("hero_image_url"))
    if fallback:
        return _to_absolute_url(fallback, base_url=base_url)
    return _to_absolute_url(_DEFAULT_WALLET_HERO_IMAGE_URL, base_url=base_url)


def resolve_wallet_title_override(org: Organization | None) -> str | None:
    explicit = _normalize_text(
        getattr(org, "wallet_title_override", None) if org else None
    )
    if explicit:
        return explicit
    defaults = _wallet_branding_defaults_for_org(org)
    fallback = _normalize_text(defaults.get("title_override"))
    return fallback


def wallet_branding_defaults(
    org: Organization | None, *, base_url: str | None = None
) -> dict[str, object]:
    return {
        "wallet_bg_color": resolve_wallet_bg_color(org),
        "wallet_logo_url": resolve_wallet_logo_url(org, base_url=base_url),
        "wallet_hero_image_url": resolve_wallet_hero_image_url(org, base_url=base_url),
        "wallet_title_override": resolve_wallet_title_override(org),
        "wallet_is_test_prefix": bool(
            getattr(org, "wallet_is_test_prefix", False) if org else False
        ),
    }
