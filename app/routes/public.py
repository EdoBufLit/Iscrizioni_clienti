from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Organization

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

def _org_to_dict(org: Organization) -> dict:
    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
    }


@router.get("/api/organizations")
def api_list_organizations(q: str = None, db: Session = Depends(get_db)):
    query = db.query(Organization).order_by(Organization.name)

    if q:
        search = f"%{q}%"
        query = query.filter(Organization.name.ilike(search))

    orgs = query.all()
    return [_org_to_dict(o) for o in orgs]


@router.get("/api/organizations/{slug}")
def api_organization_detail(slug: str, db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.slug == slug).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    return _org_to_dict(org)
