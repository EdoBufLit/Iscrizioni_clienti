from __future__ import annotations

from app.models import Organization

_SUBJECT_FALLBACK_TEMPLATE = "La tua tessera {club_display_name}"
_CLUB_DISPLAY_NAME_BY_SLUG_OVERRIDE = {
    # Customer-facing naming override requested for card rendering.
    "oasi-2": "Golden Age - Speakeasy",
}
_CARD_LOGO_BY_SLUG_FALLBACK = {
    # Requested by customer branding: dedicated Golden Age logo for oasi-2 cards.
    "oasi-2": "/static/card-logos/oasi-2.png",
}


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None


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
    slug = _normalize_text(getattr(org, "slug", None))
    if slug:
        slug_override = _CLUB_DISPLAY_NAME_BY_SLUG_OVERRIDE.get(slug)
        if slug_override:
            return slug_override
    explicit = _normalize_text(getattr(org, "club_display_name", None))
    if explicit:
        return explicit
    return _normalize_text(getattr(org, "name", None)) or ""


def resolve_card_email_subject(org: Organization | None) -> str:
    club_name = resolve_club_display_name(org)
    org_name = _normalize_text(getattr(org, "name", None) if org else None) or club_name
    template = _normalize_text(getattr(org, "card_email_subject", None) if org else None) or _SUBJECT_FALLBACK_TEMPLATE
    values = {
        "club_display_name": club_name or org_name,
        "org_name": org_name,
        "org": org_name,
    }
    try:
        rendered = template.format(**values)
    except Exception:
        rendered = template
    rendered = rendered.strip()
    if rendered:
        return rendered
    return _SUBJECT_FALLBACK_TEMPLATE.format(**values)


def resolve_card_logo_url(org: Organization | None, *, base_url: str | None = None) -> str | None:
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


def resolve_assonam_logo_url(*, frontend_base_url: str | None = None, backend_base_url: str | None = None) -> str:
    if _normalize_text(frontend_base_url):
        return _to_absolute_url("/logo-transparent.png", base_url=frontend_base_url)
    if _normalize_text(backend_base_url):
        return _to_absolute_url("/logo-transparent.png", base_url=backend_base_url)
    return "/logo-transparent.png"
