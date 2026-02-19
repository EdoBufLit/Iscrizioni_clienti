import html
import os
from datetime import datetime
from urllib.parse import quote_plus
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse, FileResponse, Response, HTMLResponse
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Member, Organization
from app.config import settings
from app.services.card_verification import parse_card_verification_token
from app.services.member_activity import (
    MEMBER_INACTIVE_REASON_DELETED,
    MEMBER_INACTIVE_REASON_NOT_APPROVED,
    get_member_inactive_reason,
    member_inactive_reason_label,
)
from app.services.org_branding import resolve_assonam_logo_url, resolve_card_logo_url, resolve_club_display_name
from app.services.card_pdf import generate_card_pdf_bytes
from app.services.card_image import generate_card_image_bytes

router = APIRouter()


# ── Legacy HTML redirects ─────────────────────────────────────────

@router.get("/associazioni")
def list_associazioni(request: Request, q: str = None, db: Session = Depends(get_db)):
    query = db.query(Organization).order_by(Organization.name)

    if q:
        # Simple case-insensitive search
        search = f"%{q}%"
        query = query.filter(Organization.name.ilike(search))

    orgs = query.all()

    return RedirectResponse(url="/associazioni")


@router.get("/associazioni/{slug}")
def associazioni_detail(request: Request, slug: str, db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.slug == slug).first()
    if not org:
        return RedirectResponse(url="/associazioni")

    return RedirectResponse(url=f"/associazioni/{slug}")


# ── Public JSON API ───────────────────────────────────────────────

def _org_to_dict_summary(org: Organization) -> dict:
    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "city": org.city,
        "province": org.province,
        "description_short": (org.description or "")[:100] + "..." if org.description and len(org.description) > 100 else org.description,
        "logo_url": f"/api/organizations/{org.slug}/logo" if org.logo_path else None
    }

def _org_to_dict_detail(org: Organization) -> dict:
    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "description": org.description,
        "address_line1": org.address_line1,
        "address_line2": org.address_line2,
        "city": org.city,
        "province": org.province,
        "postal_code": org.postal_code,
        "country": org.country,
        "email": org.email,
        "phone": org.phone,
        "website": org.website,
        "logo_url": f"/api/organizations/{org.slug}/logo" if org.logo_path else None,
        "is_active": org.is_active,
        "statute_version": org.statute_version,
        "statute_url": f"/api/organizations/{org.slug}/statute" if org.statute_pdf_path else None,
        "has_statute": bool(org.statute_pdf_path),
    }


def _get_backend_base_url(request: Request) -> str:
    configured_base = (settings.BASE_URL or "").strip().rstrip("/")
    if configured_base:
        return configured_base
    return str(request.base_url).rstrip("/")


@router.get("/api/organizations")
def api_list_organizations(q: str = None, db: Session = Depends(get_db)):
    # Only active organizations
    query = db.query(Organization).filter(Organization.is_active == True).order_by(Organization.name)

    if q:
        search = f"%{q}%"
        query = query.filter(Organization.name.ilike(search))

    orgs = query.all()
    return [_org_to_dict_summary(o) for o in orgs]


@router.get("/api/organizations/{slug}")
def api_organization_detail(slug: str, db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.slug == slug).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    return _org_to_dict_detail(org)


@router.get("/api/public/orgs/{org_slug}")
def api_public_org_info(org_slug: str, request: Request, db: Session = Depends(get_db)):
    org = (
        db.query(Organization)
        .filter(
            Organization.slug == org_slug,
            Organization.deleted_at.is_(None),
            Organization.is_active.is_(True),
        )
        .first()
    )
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    backend_base = _get_backend_base_url(request)
    club_display_name = resolve_club_display_name(org) or org.name
    card_logo_url = resolve_card_logo_url(org, base_url=backend_base)

    return {
        "slug": org.slug,
        "name": org.name,
        "club_display_name": club_display_name,
        "card_logo_url": card_logo_url,
        "wallet_enabled": False,
    }


@router.get("/api/organizations/{slug}/logo")
def get_organization_logo(slug: str, db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.slug == slug).first()
    if not org or not org.logo_path:
        raise HTTPException(status_code=404, detail="Logo not found")

    # logo_path is relative to UPLOAD_DIR
    full_path = os.path.join(settings.UPLOAD_DIR, org.logo_path)
    if not os.path.exists(full_path):
         raise HTTPException(status_code=404, detail="File missing on disk")

    return FileResponse(full_path)


@router.get("/api/organizations/{slug}/statute")
def get_organization_statute(slug: str, db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.slug == slug).first()
    if not org or not org.statute_pdf_path:
        raise HTTPException(status_code=404, detail="Statute not found")

    # statute_pdf_path is relative to UPLOAD_DIR
    full_path = os.path.join(settings.UPLOAD_DIR, org.statute_pdf_path)
    if not os.path.exists(full_path):
         raise HTTPException(status_code=404, detail="File missing on disk")

    return FileResponse(full_path, media_type="application/pdf", filename=f"statuto_{org.slug}.pdf")


# ── SEO: Sitemap ─────────────────────────────────────────────────

_STATIC_PAGES = [
    ("/", "1.0", "weekly"),
    ("/lo-studio", "0.8", "monthly"),
    ("/servizi", "0.8", "monthly"),
    ("/associazioni", "0.9", "weekly"),
    ("/contatti", "0.7", "monthly"),
    ("/privacy", "0.3", "yearly"),
]


@router.get("/sitemap.xml")
def sitemap_xml(db: Session = Depends(get_db)):
    base = settings.BASE_URL.rstrip("/")
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for path, priority, freq in _STATIC_PAGES:
        lines.append(
            f"  <url><loc>{base}{path}</loc>"
            f"<priority>{priority}</priority>"
            f"<changefreq>{freq}</changefreq></url>"
        )
    orgs = (
        db.query(Organization.slug)
        .filter(Organization.is_active == True)
        .order_by(Organization.name)
        .all()
    )
    for (slug,) in orgs:
        lines.append(
            f"  <url><loc>{base}/associazioni/{slug}</loc>"
            f"<priority>0.7</priority>"
            f"<changefreq>weekly</changefreq></url>"
        )
    lines.append("</urlset>")
    return Response(content="\n".join(lines), media_type="application/xml")


def _prefers_json_response(request: Request) -> bool:
    requested_format = (request.query_params.get("format") or "").strip().lower()
    if requested_format == "json":
        return True
    if requested_format == "html":
        return False

    accept = (request.headers.get("accept") or "").lower()
    if "text/html" in accept:
        return False
    if "application/json" in accept:
        return True

    user_agent = (request.headers.get("user-agent") or "").lower()
    if "mozilla" in user_agent and accept in {"", "*/*"}:
        return False
    return True


def _member_initials(first_name: str | None, last_name: str | None) -> str:
    first = (first_name or "").strip()
    last = (last_name or "").strip()
    initials = f"{first[:1]}{last[:1]}".upper()
    return initials or "N/D"


def _render_card_status_html(
    *,
    token: str,
    is_valid: bool,
    reason: str,
    organization_name: str | None,
    member_first_name: str | None,
    member_last_name: str | None,
    card_number: int | None,
    card_year: int | None,
    checked_at: datetime,
) -> str:
    status_title = "TESSERA ATTIVA" if is_valid else "TESSERA NON ATTIVA"
    status_color = "#0b9f55" if is_valid else "#c81e1e"
    reason_label = member_inactive_reason_label(reason)
    checked_at_label = checked_at.strftime("%d/%m/%Y %H:%M UTC")
    safe_org = html.escape((organization_name or "N/D").strip() or "N/D")
    safe_member = html.escape(_member_initials(member_first_name, member_last_name))
    safe_card_number = html.escape(str(card_number)) if card_number is not None else "N/D"
    safe_card_year = html.escape(str(card_year)) if card_year is not None else "N/D"
    safe_reason = html.escape(reason_label)
    json_link = f"/api/cards/verify/{token}?format=json"

    reason_block = ""
    if not is_valid:
        reason_block = f"""
          <p style="margin:16px 0 0 0;font-size:16px;color:#8b1a1a;font-weight:700;">
            Motivo: {safe_reason}
          </p>
        """

    return f"""<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Verifica Tessera</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#10253f;">
    <main style="max-width:560px;margin:0 auto;padding:24px 16px 42px;">
      <section style="background:#ffffff;border:1px solid #d8e0ea;border-radius:18px;padding:22px 20px;box-shadow:0 10px 28px rgba(16,37,63,0.08);">
        <h1 style="margin:0;font-size:31px;line-height:1.1;color:{status_color};">{status_title}</h1>
        <p style="margin:18px 0 0 0;font-size:15px;"><strong>Associazione:</strong> {safe_org}</p>
        <p style="margin:8px 0 0 0;font-size:15px;"><strong>Socio:</strong> {safe_member}</p>
        <p style="margin:8px 0 0 0;font-size:15px;"><strong>Tessera:</strong> {safe_card_number} / {safe_card_year}</p>
        <p style="margin:8px 0 0 0;font-size:13px;color:#41566f;"><strong>Ultimo aggiornamento:</strong> {checked_at_label}</p>
        {reason_block}
      </section>
      <p style="margin:14px 4px 0;font-size:13px;">
        <a href="{json_link}" style="color:#1f4f96;text-decoration:underline;">Mostra dati tecnici (JSON)</a>
      </p>
    </main>
  </body>
</html>"""


def _member_display_name(first_name: str | None, last_name: str | None) -> str:
    full_name = f"{(first_name or '').strip()} {(last_name or '').strip()}".strip()
    return full_name or "Socio"


def _render_card_download_html(
    *,
    token: str,
    is_valid: bool,
    inactive_reason: str,
    checked_at: datetime,
    organization_slug: str | None,
    organization_name: str | None,
    club_display_name: str | None,
    member_first_name: str | None,
    member_last_name: str | None,
    card_number: int | None,
    card_year: int | None,
    verification_url: str,
    download_url: str,
    assonam_logo_url: str,
    organization_logo_url: str | None,
    requested_pdf_format: bool,
) -> str:
    normalized_org_slug = (organization_slug or "").strip().lower()
    is_oasi2_card = normalized_org_slug == "oasi-2"
    safe_club = html.escape((club_display_name or organization_name or "Associazione").strip())
    association_label = club_display_name if is_oasi2_card else organization_name
    safe_association = html.escape((association_label or "N/D").strip() or "N/D")
    safe_member = html.escape(_member_display_name(member_first_name, member_last_name))
    safe_card_number = html.escape(str(card_number)) if card_number is not None else "N/D"
    safe_card_year = html.escape(str(card_year)) if card_year is not None else "N/D"
    safe_checked_at = html.escape(checked_at.strftime("%d/%m/%Y %H:%M UTC"))
    safe_verify_url = html.escape(verification_url)
    safe_download_url = html.escape(download_url)
    safe_assonam_logo = html.escape(assonam_logo_url)
    safe_org_logo = html.escape(organization_logo_url) if organization_logo_url else ""
    safe_reason = html.escape(member_inactive_reason_label(inactive_reason))

    qr_url = (
        "https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=0&data="
        f"{quote_plus(verification_url)}"
    )
    safe_qr_url = html.escape(qr_url)

    status_title = "TESSERA ATTIVA" if is_valid else "TESSERA NON ATTIVA"
    status_tone = "#0b9f55" if is_valid else "#c81e1e"
    non_active_block = ""
    if not is_valid:
        non_active_block = f"""
          <div style="margin-top:16px;border-radius:12px;padding:12px 14px;background:#fff1f1;border:1px solid #f2c8c8;color:#8b1a1a;font-weight:700;">
            Stato: {status_title}<br />Motivo: {safe_reason}
          </div>
        """

    card_section_style = (
        "background:linear-gradient(135deg,#0b2e2c 0%,#143f3c 45%,#0f3a37 100%);"
        "border-radius:20px;overflow:hidden;border:1px solid #0f4b46;"
        "box-shadow:0 14px 28px rgba(12,42,39,0.25);"
    )
    if safe_org_logo and is_oasi2_card:
        card_section_style = (
            "background-color:#0f3a37;"
            f"background-image:linear-gradient(135deg,rgba(11,46,44,0.94) 0%,rgba(20,63,60,0.92) 45%,rgba(15,58,55,0.94) 100%),url('{safe_org_logo}');"
            "background-repeat:no-repeat,no-repeat;"
            "background-position:center center,center center;"
            "background-size:cover,58% auto;"
            "border-radius:20px;overflow:hidden;border:1px solid #0f4b46;"
            "box-shadow:0 14px 28px rgba(12,42,39,0.25);"
        )

    org_logo_header_block = ""
    if safe_org_logo and not is_oasi2_card:
        org_logo_header_block = f"""
        <div style="padding:14px 22px 0 22px;text-align:center;">
          <img src="{safe_org_logo}" alt="Logo associazione" style="height:44px;max-width:220px;object-fit:contain;" />
        </div>
        """

    org_logo_header_inline = ""
    if safe_org_logo and is_oasi2_card:
        org_logo_header_inline = (
            f'<img src="{safe_org_logo}" alt="Logo associazione" '
            'style="height:30px;max-width:110px;object-fit:contain;opacity:0.92;" />'
        )

    pdf_hint = ""
    if requested_pdf_format:
        pdf_hint = """
        <p style="margin:10px 0 0;font-size:13px;color:#5b706d;">
          PDF server-side non configurato: usa "Scarica tessera (PDF)" o Stampa e seleziona "Salva come PDF".
        </p>
        """

    return f"""<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Download Tessera</title>
  </head>
  <body style="margin:0;padding:0;background:#eef4f3;font-family:Arial,sans-serif;color:#123330;">
    <main style="max-width:760px;margin:0 auto;padding:24px 16px 40px;">
      <header style="text-align:center;margin-bottom:16px;">
        <h1 style="margin:0;font-size:28px;color:#123330;">{safe_club}</h1>
        <p style="margin:8px 0 0;font-size:14px;color:#506865;">Conferma tessera aggiornata al {safe_checked_at}</p>
      </header>

      <section style="{card_section_style}">
        {org_logo_header_block}
        <div style="padding:20px 22px;border-top:3px solid #c6a04f;border-bottom:1px solid rgba(198,160,79,0.25);display:flex;align-items:flex-start;justify-content:space-between;gap:14px;">
          <div>
            <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c6a04f;">Tessera socio</p>
            <p style="margin:4px 0 0;font-size:32px;font-weight:700;color:#d4b45c;">{safe_card_year}</p>
            <p style="margin:8px 0 0;font-size:13px;color:{status_tone};font-weight:700;">{status_title}</p>
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-left:auto;">
            {org_logo_header_inline}
            <img src="{safe_assonam_logo}" alt="Logo ASSONAM" style="height:46px;max-width:170px;object-fit:contain;" />
          </div>
        </div>
        <div style="padding:20px 22px;">
          <p style="margin:0;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#8aaba8;">Nome e cognome</p>
          <p style="margin:7px 0 0;font-size:30px;line-height:1.12;color:#ffffff;font-weight:700;">{safe_member}</p>
          <p style="margin:16px 0 0;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#8aaba8;">Associazione</p>
          <p style="margin:6px 0 0;font-size:16px;color:#d0e2df;">{safe_association}</p>
        </div>
        <div style="padding:14px 22px 22px;border-top:1px solid rgba(198,160,79,0.25);display:flex;justify-content:space-between;align-items:flex-end;gap:14px;">
          <div>
            <p style="margin:0;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#8aaba8;">N. tessera</p>
            <p style="margin:7px 0 0;font-size:24px;font-family:Courier New,monospace;font-weight:700;letter-spacing:2px;color:#d4b45c;">{safe_card_number}</p>
          </div>
          <span style="display:inline-block;width:56px;height:38px;border-radius:8px;background:linear-gradient(145deg,#d4b45c 0%,#a8883a 50%,#d4b45c 100%);"></span>
        </div>
      </section>

      {non_active_block}

      <section style="margin-top:18px;background:#ffffff;border:1px solid #dce5e3;border-radius:18px;padding:16px 16px 20px;text-align:center;">
        <img src="{safe_qr_url}" alt="QR verifica tessera" style="width:184px;height:184px;border-radius:14px;background:#ffffff;padding:8px;border:1px solid #dbe3e1;" />
        <p style="margin:10px 0 0;font-size:13px;color:#526a67;">Scansiona il QR per verificare lo stato della tessera.</p>
        <div style="margin-top:14px;display:flex;flex-wrap:wrap;justify-content:center;gap:10px;">
          <button type="button" onclick="window.print()" style="cursor:pointer;border:0;border-radius:10px;padding:12px 18px;background:#0f5b53;color:#ffffff;font-size:14px;font-weight:700;">
            Scarica tessera (PDF)
          </button>
          <a href="{safe_verify_url}" style="display:inline-block;border-radius:10px;padding:12px 18px;background:#f2f6f5;border:1px solid #ccd9d7;color:#123330;text-decoration:none;font-size:14px;font-weight:700;">
            Verifica tessera
          </a>
        </div>
        {pdf_hint}
      </section>

      <p style="margin:14px 4px 0;font-size:12px;color:#566f6c;">
        Link diretto download: <a href="{safe_download_url}" style="color:#1f4f96;text-decoration:underline;">{safe_download_url}</a>
      </p>
    </main>
  </body>
</html>"""


@router.get("/api/cards/verify/{token}")
def verify_member_card(request: Request, token: str, db: Session = Depends(get_db)):
    prefers_json = _prefers_json_response(request)
    checked_at = datetime.utcnow()
    payload = parse_card_verification_token(token)
    if not payload:
        if prefers_json:
            raise HTTPException(status_code=404, detail="Tessera non valida")
        return HTMLResponse(
            content=_render_card_status_html(
                token=token,
                is_valid=False,
                reason=MEMBER_INACTIVE_REASON_NOT_APPROVED,
                organization_name=None,
                member_first_name=None,
                member_last_name=None,
                card_number=None,
                card_year=None,
                checked_at=checked_at,
            ),
            status_code=200,
        )

    member = (
        db.query(Member)
        .filter(
            Member.id == payload["member_id"],
            Member.org_id == payload["org_id"],
        )
        .first()
    )
    organization = (
        member.organization
        if member and member.organization
        else db.query(Organization).filter(Organization.id == payload["org_id"]).first()
    )

    inactive_reason = ""
    if not member:
        inactive_reason = MEMBER_INACTIVE_REASON_DELETED
    else:
        inactive_reason = get_member_inactive_reason(member, now=checked_at)
        if inactive_reason == "" and (
            member.card_no != payload["card_number"] or member.card_year != payload["card_year"]
        ):
            inactive_reason = MEMBER_INACTIVE_REASON_NOT_APPROVED

    is_valid = inactive_reason == ""
    card_status = "attiva" if is_valid else "non_attiva"
    card_number = member.card_no if member and member.card_no is not None else payload["card_number"]
    card_year = member.card_year if member and member.card_year is not None else payload["card_year"]

    response_payload = {
        "valid": is_valid,
        "card": {
            "number": card_number,
            "status": card_status,
            "year": card_year,
        },
        "member": {
            "first_name": member.first_name if member else None,
            "last_name": member.last_name if member else None,
        },
        "organization": {
            "name": organization.name if organization else None,
            "slug": organization.slug if organization else None,
        },
        "checked_at": checked_at.isoformat() + "Z",
    }
    if not is_valid:
        response_payload["reason"] = inactive_reason

    if prefers_json:
        return response_payload

    return HTMLResponse(
        content=_render_card_status_html(
            token=token,
            is_valid=is_valid,
            reason=inactive_reason,
            organization_name=organization.name if organization else None,
            member_first_name=member.first_name if member else None,
            member_last_name=member.last_name if member else None,
            card_number=card_number,
            card_year=card_year,
            checked_at=checked_at,
        ),
        status_code=200,
    )


@router.get("/api/cards/{token}/download")
def download_member_card(token: str, request: Request, db: Session = Depends(get_db)):
    checked_at = datetime.utcnow()
    requested_format = (request.query_params.get("format") or "").strip().lower()
    wants_pdf = requested_format == "pdf"

    payload = parse_card_verification_token(token)
    member = None
    organization = None
    inactive_reason = MEMBER_INACTIVE_REASON_NOT_APPROVED
    card_number = None
    card_year = None

    if payload:
        member = (
            db.query(Member)
            .filter(
                Member.id == payload["member_id"],
                Member.org_id == payload["org_id"],
            )
            .first()
        )
        organization = (
            member.organization
            if member and member.organization
            else db.query(Organization).filter(Organization.id == payload["org_id"]).first()
        )
        card_number = payload["card_number"]
        card_year = payload["card_year"]

    if member is None:
        inactive_reason = MEMBER_INACTIVE_REASON_DELETED
    else:
        inactive_reason = get_member_inactive_reason(member, now=checked_at)
        if inactive_reason == "" and (
            member.card_no != payload["card_number"] or member.card_year != payload["card_year"]
        ):
            inactive_reason = MEMBER_INACTIVE_REASON_NOT_APPROVED
        if member.card_no is not None:
            card_number = member.card_no
        if member.card_year is not None:
            card_year = member.card_year

    is_valid = bool(payload) and inactive_reason == ""
    backend_base = _get_backend_base_url(request)
    frontend_base = (settings.FRONTEND_URL or "").strip().rstrip("/") or backend_base
    verification_url = f"{backend_base}/api/cards/verify/{token}"
    download_url = f"{backend_base}/api/cards/{token}/download"

    assonam_logo_url = resolve_assonam_logo_url(
        frontend_base_url=frontend_base,
        backend_base_url=backend_base,
    )
    card_logo_url = resolve_card_logo_url(organization, base_url=backend_base)
    club_display_name = resolve_club_display_name(organization)

    html_content = _render_card_download_html(
        token=token,
        is_valid=is_valid,
        inactive_reason=inactive_reason,
        checked_at=checked_at,
        organization_slug=organization.slug if organization else None,
        organization_name=organization.name if organization else None,
        club_display_name=club_display_name,
        member_first_name=member.first_name if member else None,
        member_last_name=member.last_name if member else None,
        card_number=card_number,
        card_year=card_year,
        verification_url=verification_url,
        download_url=download_url,
        assonam_logo_url=assonam_logo_url,
        organization_logo_url=card_logo_url,
        requested_pdf_format=wants_pdf,
    )
    return HTMLResponse(content=html_content, status_code=200)


@router.get("/api/cards/{token}/wallet/apple")
def card_wallet_apple(token: str):
    _ = parse_card_verification_token(token)
    raise HTTPException(status_code=404, detail="Wallet non configurato")


@router.get("/api/cards/{token}/wallet/google")
def card_wallet_google(token: str):
    _ = parse_card_verification_token(token)
    raise HTTPException(status_code=404, detail="Wallet non configurato")


# ── Disk-path helpers (used by PDF and PNG endpoints) ─────────────────────────

def _resolve_logo_disk_path(org: Organization | None) -> str | None:
    """Return the absolute disk path for the org logo, or None if unavailable."""
    if org is None:
        return None
    if org.logo_path:
        p = os.path.join(settings.UPLOAD_DIR, org.logo_path)
        return p if os.path.exists(p) else None
    slug = (getattr(org, "slug", None) or "").strip().lower()
    if slug:
        static_p = os.path.normpath(
            os.path.join(os.path.dirname(__file__), "..", "static", "card-logos", f"{slug}.png")
        )
        return static_p if os.path.exists(static_p) else None
    return None


def _resolve_assonam_disk_path() -> str | None:
    """Return the absolute disk path for the ASSONAM logo PNG."""
    static_dir = (settings.FRONTEND_STATIC_DIR or "").strip()
    if static_dir:
        p = os.path.join(static_dir, "logo-transparent.png")
        return p if os.path.exists(p) else None
    rel = os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public", "logo-transparent.png")
    )
    return rel if os.path.exists(rel) else None


# ── PDF direct download ────────────────────────────────────────────────────────

@router.get("/api/cards/{token}/download.pdf")
def download_card_pdf(token: str, request: Request, db: Session = Depends(get_db)):
    """Return a 2-page PDF (front + back) as a direct download — no print dialog."""
    checked_at = datetime.utcnow()
    payload = parse_card_verification_token(token)
    if not payload:
        raise HTTPException(status_code=404, detail="Tessera non valida")

    member = (
        db.query(Member)
        .filter(Member.id == payload["member_id"], Member.org_id == payload["org_id"])
        .first()
    )
    organization = (
        member.organization
        if member and member.organization
        else db.query(Organization).filter(Organization.id == payload["org_id"]).first()
    )

    inactive_reason = ""
    if not member:
        inactive_reason = MEMBER_INACTIVE_REASON_DELETED
    else:
        inactive_reason = get_member_inactive_reason(member, now=checked_at)
        if inactive_reason == "" and (
            member.card_no != payload["card_number"] or member.card_year != payload["card_year"]
        ):
            inactive_reason = MEMBER_INACTIVE_REASON_NOT_APPROVED

    is_valid = inactive_reason == ""
    card_status = "attiva" if is_valid else "non_attiva"
    card_number = (member.card_no if member and member.card_no is not None else payload["card_number"])
    card_year = (member.card_year if member and member.card_year is not None else payload["card_year"])

    backend_base = _get_backend_base_url(request)
    verification_url = f"{backend_base}/api/cards/verify/{token}"
    club_display_name = resolve_club_display_name(organization) or (organization.name if organization else "")
    org_logo_path = _resolve_logo_disk_path(organization)
    assonam_logo_path = _resolve_assonam_disk_path()

    try:
        pdf_bytes = generate_card_pdf_bytes(
            member_full_name=_member_display_name(
                member.first_name if member else None,
                member.last_name if member else None,
            ),
            organization_name=organization.name if organization else "N/D",
            club_display_name=club_display_name or (organization.name if organization else "N/D"),
            organization_slug=organization.slug if organization else None,
            card_number=card_number or 0,
            card_year=card_year or 0,
            card_status=card_status,
            verification_url=verification_url,
            org_logo_path=org_logo_path,
            assonam_logo_path=assonam_logo_path,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Errore generazione PDF: {exc}") from exc

    slug = (organization.slug if organization else "card").replace("/", "_")
    filename = f"tessera_{slug}_{card_year}_{card_number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Card image PNG ─────────────────────────────────────────────────────────────

@router.get("/api/cards/{token}/image.png")
def card_image_png(token: str, request: Request, db: Session = Depends(get_db)):
    """Return a PNG image of the card front in bordeaux theme."""
    checked_at = datetime.utcnow()
    payload = parse_card_verification_token(token)
    if not payload:
        raise HTTPException(status_code=404, detail="Tessera non valida")

    member = (
        db.query(Member)
        .filter(Member.id == payload["member_id"], Member.org_id == payload["org_id"])
        .first()
    )
    organization = (
        member.organization
        if member and member.organization
        else db.query(Organization).filter(Organization.id == payload["org_id"]).first()
    )

    inactive_reason = ""
    if not member:
        inactive_reason = MEMBER_INACTIVE_REASON_DELETED
    else:
        inactive_reason = get_member_inactive_reason(member, now=checked_at)
        if inactive_reason == "" and (
            member.card_no != payload["card_number"] or member.card_year != payload["card_year"]
        ):
            inactive_reason = MEMBER_INACTIVE_REASON_NOT_APPROVED

    is_valid = inactive_reason == ""
    card_status = "attiva" if is_valid else "non_attiva"
    card_number = (member.card_no if member and member.card_no is not None else payload["card_number"])
    card_year = (member.card_year if member and member.card_year is not None else payload["card_year"])
    club_display_name = resolve_club_display_name(organization) or (organization.name if organization else "")
    org_logo_path = _resolve_logo_disk_path(organization)
    assonam_logo_path = _resolve_assonam_disk_path()

    try:
        png_bytes = generate_card_image_bytes(
            member_full_name=_member_display_name(
                member.first_name if member else None,
                member.last_name if member else None,
            ),
            organization_name=organization.name if organization else "N/D",
            club_display_name=club_display_name or (organization.name if organization else "N/D"),
            card_number=card_number or 0,
            card_year=card_year or 0,
            card_status=card_status,
            org_logo_path=org_logo_path,
            assonam_logo_path=assonam_logo_path,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Errore generazione immagine: {exc}") from exc

    return Response(content=png_bytes, media_type="image/png")
