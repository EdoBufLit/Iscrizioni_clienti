from fastapi import APIRouter, Depends, HTTPException, Request, Form, status
from fastapi.responses import HTMLResponse, RedirectResponse, FileResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db import get_db
from app.models import AdminUser, Member, CardBatch, MemberDocument, DocStatus, MemberStatus, Organization
from app.services.card import assign_next_card
from app.config import settings
from datetime import datetime
import os

router = APIRouter(prefix="/admin")
templates = Jinja2Templates(directory="app/templates")

def get_current_admin(request: Request, db: Session):
    admin_id = request.session.get("admin_id")
    if not admin_id:
        return None
    return db.query(AdminUser).filter(AdminUser.id == admin_id).first()

@router.get("/login", response_class=HTMLResponse)
def admin_login_page(request: Request):
    return templates.TemplateResponse("admin/login.html", {"request": request})

@router.post("/login", response_class=HTMLResponse)
def admin_login_submit(request: Request, email: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    # Simple auth for MVP (plain password or simple hash comparison)
    # In real app, verify hash. Assuming seeded admin has plain "admin" or similar for now.
    # Let's assume seeded admin uses simple string comparison or we implement proper hashing.
    # For this task, "minimal", let's match what we seed.

    admin = db.query(AdminUser).filter(AdminUser.email == email).first()
    if not admin or admin.password_hash != password: # Using plain match for MVP simplicity as per "minimal"
        return templates.TemplateResponse("admin/login.html", {"request": request, "error": "Invalid credentials"})

    request.session["admin_id"] = admin.id
    return RedirectResponse(url="/admin/dashboard", status_code=status.HTTP_302_FOUND)

@router.get("/logout")
def logout(request: Request):
    request.session.pop("admin_id", None)
    return RedirectResponse(url="/admin/login")

@router.get("/dashboard", response_class=HTMLResponse)
def admin_dashboard(request: Request, db: Session = Depends(get_db)):
    admin = get_current_admin(request, db)
    if not admin:
        return RedirectResponse(url="/admin/login")

    # Stats for Org
    # Assuming Org Admin for now
    org_id = admin.org_id

    total_members = db.query(Member).filter(Member.org_id == org_id).count()
    active_members = db.query(Member).filter(Member.org_id == org_id, Member.status == MemberStatus.ACTIVE).count()
    pending_members = db.query(Member).filter(Member.org_id == org_id, Member.status != MemberStatus.ACTIVE).count()

    # Inventory
    batches = db.query(CardBatch).filter(CardBatch.org_id == org_id).all()
    total_cards = sum([b.end_no - b.start_no + 1 for b in batches])
    remaining_cards = sum([max(0, b.end_no - b.next_no + 1) for b in batches])
    used_cards = total_cards - remaining_cards

    return templates.TemplateResponse("admin/dashboard.html", {
        "request": request,
        "admin": admin,
        "total_members": total_members,
        "active_members": active_members,
        "pending_members": pending_members,
        "total_cards": total_cards,
        "used_cards": used_cards,
        "remaining_cards": remaining_cards,
        "batches": batches
    })

@router.post("/inventory")
def add_batch(request: Request, start_no: int = Form(...), end_no: int = Form(...), db: Session = Depends(get_db)):
    admin = get_current_admin(request, db)
    if not admin:
        return RedirectResponse(url="/admin/login")

    batch = CardBatch(
        org_id=admin.org_id,
        start_no=start_no,
        end_no=end_no,
        next_no=start_no
    )
    db.add(batch)
    db.commit()
    return RedirectResponse(url="/admin/dashboard", status_code=status.HTTP_302_FOUND)

@router.get("/members", response_class=HTMLResponse)
def list_members(request: Request, status: str = None, db: Session = Depends(get_db)):
    admin = get_current_admin(request, db)
    if not admin:
        return RedirectResponse(url="/admin/login")

    query = db.query(Member).filter(Member.org_id == admin.org_id)
    if status:
        query = query.filter(Member.status == status)

    members = query.all()

    return templates.TemplateResponse("admin/members.html", {
        "request": request,
        "admin": admin,
        "members": members,
        "filter_status": status
    })

@router.get("/members/{member_id}", response_class=HTMLResponse)
def member_detail(request: Request, member_id: int, db: Session = Depends(get_db)):
    admin = get_current_admin(request, db)
    if not admin:
        return RedirectResponse(url="/admin/login")

    member = db.query(Member).filter(Member.id == member_id, Member.org_id == admin.org_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    return templates.TemplateResponse("admin/member_detail.html", {
        "request": request,
        "admin": admin,
        "member": member
    })

@router.post("/members/{member_id}/assign_card")
def assign_card_manual(request: Request, member_id: int, db: Session = Depends(get_db)):
    admin = get_current_admin(request, db)
    if not admin:
        return RedirectResponse(url="/admin/login")

    if assign_next_card(db, member_id, admin.org_id):
        db.commit()

    return RedirectResponse(url=f"/admin/members/{member_id}", status_code=status.HTTP_302_FOUND)

@router.post("/members/{member_id}/edit")
def edit_member(
    request: Request,
    member_id: int,
    first_name: str = Form(...),
    last_name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(None),
    fiscal_code: str = Form(None),
    db: Session = Depends(get_db)
):
    admin = get_current_admin(request, db)
    if not admin:
        return RedirectResponse(url="/admin/login")

    member = db.query(Member).filter(Member.id == member_id, Member.org_id == admin.org_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    member.first_name = first_name
    member.last_name = last_name
    member.email = email
    member.phone = phone
    member.fiscal_code = fiscal_code
    db.commit()

    return RedirectResponse(url=f"/admin/members/{member_id}", status_code=status.HTTP_302_FOUND)

@router.get("/download/{doc_id}")
def admin_download_document(request: Request, doc_id: int, db: Session = Depends(get_db)):
    admin = get_current_admin(request, db)
    if not admin:
        return RedirectResponse(url="/admin/login")

    doc = db.query(MemberDocument).filter(MemberDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Check org access
    member = db.query(Member).filter(Member.id == doc.member_id).first()
    if not member or member.org_id != admin.org_id:
        raise HTTPException(status_code=403, detail="Access denied")

    file_path = os.path.join(settings.UPLOAD_DIR, doc.rel_path)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")

    return FileResponse(file_path, filename=doc.original_filename, media_type=doc.mime_type)

@router.post("/members/{member_id}/docs/{doc_id}/review")
def review_doc(request: Request, member_id: int, doc_id: int, action: str = Form(...), notes: str = Form(None), db: Session = Depends(get_db)):
    admin = get_current_admin(request, db)
    if not admin:
        return RedirectResponse(url="/admin/login")

    doc = db.query(MemberDocument).filter(MemberDocument.id == doc_id, MemberDocument.member_id == member_id).first()
    if doc:
        if action == "approve":
            doc.status = DocStatus.APPROVED
        elif action == "reject":
            doc.status = DocStatus.REJECTED

        doc.review_notes = notes
        doc.reviewed_at = datetime.utcnow()
        doc.reviewed_by = admin.id
        db.commit()

    return RedirectResponse(url=f"/admin/members/{member_id}", status_code=status.HTTP_302_FOUND)
