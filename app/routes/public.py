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

@router.get("/associazioni/{slug}")
def associazioni_detail(slug: str):
    # For now, redirect to the join page as the "public profile"
    return RedirectResponse(url=f"/join/{slug}")
