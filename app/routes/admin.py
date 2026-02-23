from fastapi import APIRouter, Depends, HTTPException, Request, Form, status
from fastapi.responses import RedirectResponse, FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db import get_db
from app.models import AdminUser, AdminRole, Member, CardBatch, MemberDocument, DocStatus, MemberStatus, Organization, PaymentMethod
from app.services.card_allocation import allocate_next_card
from app.services.member_card_delivery import maybe_send_member_card_ready_email
from app import audit
from app.config import settings
from app.security import verify_password
from app.services.member_activity import member_active_filters
from app import audit
from datetime import datetime
import logging
import os

router = APIRouter(prefix="/admin")
logger = logging.getLogger(__name__)


def get_current_admin(request: Request, db: Session):
    admin_id = request.session.get("admin_id")
    if not admin_id:
        return None
    return db.query(AdminUser).filter(AdminUser.id == admin_id).first()


# ── Legacy HTML redirects ─────────────────────────────────────────

@router.get("/login")
def admin_login_page(request: Request):
    return RedirectResponse(url="/admin")


@router.post("/login")
def admin_login_submit(request: Request, email: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    admin = db.query(AdminUser).filter(AdminUser.email == email).first()
    if not admin or not verify_password(password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    request.session["admin_id"] = admin.id
    return RedirectResponse(url="/admin", status_code=status.HTTP_302_FOUND)


@router.get("/logout")
def logout(request: Request):
    request.session.pop("admin_id", None)
    return RedirectResponse(url="/admin")


@router.get("/dashboard")
def admin_dashboard(request: Request, db: Session = Depends(get_db)):
    admin = get_current_admin(request, db)
    if not admin:
        return RedirectResponse(url="/admin")

    # Stats for Org
    org_id = admin.org_id

    total_members = db.query(Member).filter(Member.org_id == org_id, Member.deleted_at.is_(None)).count()
    active_members = db.query(Member).filter(Member.org_id == org_id, *member_active_filters(now=datetime.utcnow())).count()
    pending_members = db.query(Member).filter(
        Member.org_id == org_id,
        Member.deleted_at.is_(None),
        Member.status != MemberStatus.ACTIVE,
    ).count()

    # Inventory
    batches = db.query(CardBatch).filter(CardBatch.org_id == org_id).all()
    total_cards = sum([b.end_no - b.start_no + 1 for b in batches])
    remaining_cards = sum([max(0, b.end_no - b.next_no + 1) for b in batches])
    used_cards = total_cards - remaining_cards

    return RedirectResponse(url="/admin")


@router.post("/inventory")
def add_batch(request: Request, quantity: int = Form(...), db: Session = Depends(get_db)):
    admin = get_current_admin(request, db)
    if not admin:
        return RedirectResponse(url="/admin/login")
    if admin.role != AdminRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only super-admin can modify card stock")

    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")

    # Compute start_no based on max end_no
    last_end = db.query(func.max(CardBatch.end_no)).filter(CardBatch.org_id == admin.org_id).scalar() or 0
    start_no = last_end + 1
    end_no = last_end + quantity

    batch = CardBatch(
        org_id=admin.org_id,
        year=datetime.utcnow().year,
        start_no=start_no,
        end_no=end_no,
        next_no=start_no
    )
    db.add(batch)
    db.commit()
    audit.card_batch_added(org_id=admin.org_id, start_no=start_no, end_no=end_no, admin_id=admin.id)
    return RedirectResponse(url="/admin/dashboard", status_code=status.HTTP_302_FOUND)


@router.get("/members")
def list_members(request: Request, status: str = None, db: Session = Depends(get_db)):
    admin = get_current_admin(request, db)
    if not admin:
        return RedirectResponse(url="/admin")

    query = db.query(Member).filter(Member.org_id == admin.org_id, Member.deleted_at.is_(None))
    if status:
        query = query.filter(Member.status == status)

    members = query.all()

    return RedirectResponse(url="/admin/affiliazioni")


@router.get("/members/{member_id}")
def member_detail(request: Request, member_id: int, db: Session = Depends(get_db)):
    admin = get_current_admin(request, db)
    if not admin:
        return RedirectResponse(url="/admin")

    member = db.query(Member).filter(Member.id == member_id, Member.org_id == admin.org_id).first()
    if not member:
        return RedirectResponse(url="/admin/affiliazioni")

    return RedirectResponse(url="/admin")


@router.post("/members/{member_id}/assign_card")
def assign_card_manual(request: Request, member_id: int, db: Session = Depends(get_db)):
    admin = get_current_admin(request, db)
    if not admin:
        return RedirectResponse(url="/admin/login")

    member = db.query(Member).filter(Member.id == member_id).first()
    if member and member.card_no is None:
        try:
            allocation = allocate_next_card(
                db,
                org_id=member.org_id,
                year=datetime.utcnow().year,
            )
            member.card_no = allocation.card_no
            member.batch_id = allocation.batch_id
            member.card_year = allocation.year
            if member.status == MemberStatus.PENDING_CARDS:
                member.status = MemberStatus.ACTIVE
                if not member.joined_at:
                    member.joined_at = datetime.utcnow()
            db.commit()
        except HTTPException:
            # Cards exhausted - leave member in current state
            member.status = MemberStatus.PENDING_CARDS
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
    payment_method: str = Form(None),
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
    if payment_method is None or payment_method.strip() == "":
        member.payment_method = None
    else:
        normalized_payment_method = payment_method.strip().upper()
        if normalized_payment_method not in {PaymentMethod.CASH.value, PaymentMethod.BONIFICO.value}:
            raise HTTPException(status_code=400, detail="Modalita di pagamento non valida. Valori ammessi: CASH, BONIFICO.")
        member.payment_method = normalized_payment_method
    db.commit()

    audit.log_operation(
        db,
        action="member.update",
        entity_type="member",
        entity_id=member.id,
        actor_admin_id=admin.id,
        actor_role=admin.role.value if hasattr(admin.role, "value") else str(admin.role),
        metadata={"fields": ["first_name", "last_name", "email", "phone", "fiscal_code", "payment_method"]},
        ip=request.client.host if request.client else "unknown",
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return RedirectResponse(url=f"/admin/members/{member_id}", status_code=status.HTTP_302_FOUND)


@router.get("/download/{doc_id}")
def admin_download_document(request: Request, doc_id: int, db: Session = Depends(get_db)):
    admin = get_current_admin(request, db)
    if not admin:
        return RedirectResponse(url="/admin")

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
        approved = False
        if action == "approve":
            doc.status = DocStatus.APPROVED
            approved = True
        elif action == "reject":
            doc.status = DocStatus.REJECTED

        doc.review_notes = notes
        doc.reviewed_at = datetime.utcnow()
        doc.reviewed_by = admin.id
        db.commit()

        if approved:
            try:
                maybe_send_member_card_ready_email(db, request, doc.member_id)
            except Exception:
                logger.exception(
                    "Failed post-verification card email hook (legacy admin) for member_id=%s doc_id=%s",
                    doc.member_id,
                    doc.id,
                )

    return RedirectResponse(url=f"/admin/members/{member_id}", status_code=status.HTTP_302_FOUND)
