from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Organization

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

@router.get("/associazioni", response_class=HTMLResponse)
def list_associazioni(request: Request, q: str = None, db: Session = Depends(get_db)):
    query = db.query(Organization).order_by(Organization.name)

    if q:
        # Simple case-insensitive search
        search = f"%{q}%"
        query = query.filter(Organization.name.ilike(search))

    orgs = query.all()

    return templates.TemplateResponse("associazioni.html", {
        "request": request,
        "orgs": orgs,
        "q": q
    })

@router.get("/associazioni/{slug}", response_class=HTMLResponse)
def associazioni_detail(request: Request, slug: str, db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.slug == slug).first()
    if not org:
        return HTMLResponse("Organization not found", status_code=404)

    return templates.TemplateResponse("associazione_detail.html", {
        "request": request,
        "org": org
    })
