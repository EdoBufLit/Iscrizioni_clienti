import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse, FileResponse, Response
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Member, Organization
from app.config import settings
from app.services.card_verification import parse_card_verification_token, to_card_status

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


@router.get("/api/cards/verify/{token}")
def verify_member_card(token: str, db: Session = Depends(get_db)):
    payload = parse_card_verification_token(token)
    if not payload:
        raise HTTPException(status_code=404, detail="Tessera non valida")

    member = (
        db.query(Member)
        .filter(
            Member.id == payload["member_id"],
            Member.org_id == payload["org_id"],
            Member.deleted_at.is_(None),
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Tessera non valida")

    if (
        member.card_no != payload["card_number"]
        or member.card_year != payload["card_year"]
    ):
        raise HTTPException(status_code=404, detail="Tessera non valida")

    status = to_card_status(member.status, member.card_no)
    is_valid = bool(status == "attiva" and member.card_no is not None and member.card_year is not None)

    return {
        "valid": is_valid,
        "card": {
            "number": member.card_no,
            "status": status,
            "year": member.card_year,
        },
        "member": {
            "first_name": member.first_name,
            "last_name": member.last_name,
        },
        "organization": {
            "name": member.organization.name if member.organization else None,
            "slug": member.organization.slug if member.organization else None,
        },
        "checked_at": datetime.utcnow().isoformat() + "Z",
    }
