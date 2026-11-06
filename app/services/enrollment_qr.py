"""Locally generated QR assets for an organization's public enrollment page."""

import base64
from urllib.parse import quote

from fastapi import Request

from app.config import settings
from app.models import Organization
from app.services.org_branding import resolve_club_display_name
from app.services.qr_code import generate_qr_png_bytes


def build_enrollment_qr(org: Organization, request: Request) -> dict[str, str]:
    base = (settings.FRONTEND_URL or settings.BASE_URL or str(request.base_url)).strip().rstrip("/")
    url = f"{base}/associazioni/{quote(org.slug, safe='')}/iscrizione"
    # Keep the full four-module quiet zone, including when used in a printed poster.
    png = generate_qr_png_bytes(url, box_size=12, border=4)
    return {
        "organization_name": resolve_club_display_name(org) or org.name,
        "organization_slug": org.slug,
        "enrollment_url": url,
        "qr_data_uri": f"data:image/png;base64,{base64.b64encode(png).decode('ascii')}",
    }
