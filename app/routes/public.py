import html
import os
from datetime import datetime
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
