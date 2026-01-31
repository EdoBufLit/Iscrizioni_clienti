import csv
import io

import os
from fastapi import APIRouter, Depends, HTTPException, Request, Form, Body
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel

from fastapi import UploadFile, File
from app.db import get_db
from app.models import AdminUser, AdminRole, OrgAdminToken, Member, MemberStatus, CardBatch, CardMovement, Organization, MemberDocument, DocStatus
from app.utils import generate_token, hash_token, send_email, save_upload_file
from app.config import settings
from app.middleware import auth_limiter, get_client_ip
from app import audit
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/org-admin")

auth_router = APIRouter(prefix="/auth")


def _get_current_org_admin(request: Request, db: Session):
    """Return the authenticated org admin from the session, or None."""
    admin_id = request.session.get("org_admin_id")
    if not admin_id:
        return None
    admin = db.query(AdminUser).filter(
        AdminUser.id == admin_id,
        AdminUser.role == AdminRole.ORG_ADMIN,
        AdminUser.is_active.is_(True),
        AdminUser.deleted_at.is_(None), # Added deleted_at filter
    ).first()
    return admin


@auth_router.post("/magic-link")
def request_magic_link(
    request: Request,
    email: str = Form(...),
    db: Session = Depends(get_db),
):
    """
    Send a magic-link email to an active org admin.
    Always returns 200 to prevent email enumeration.
    """
    auth_limiter.check(get_client_ip(request))
    admin = db.query(AdminUser).filter(
        AdminUser.email == email,
        AdminUser.role == AdminRole.ORG_ADMIN,
        AdminUser.is_active.is_(True),
        AdminUser.deleted_at.is_(None), # Added deleted_at filter
        AdminUser.org_id.isnot(None),
    ).first()

    if admin:
        token_str = generate_token()
        token = OrgAdminToken(
            admin_id=admin.id,
            token_hash=hash_token(token_str),
            expires_at=datetime.utcnow() + timedelta(minutes=settings.LOGIN_TOKEN_EXPIRE_MINUTES),
        )
        db.add(token)
        db.commit()

        frontend_base = settings.FRONTEND_URL.rstrip("/")
        if not frontend_base:
            # Fallback: use request base url
            frontend_base = str(request.base_url).rstrip("/")

        link = f"{frontend_base}/auth/verify?token={token_str}&role=org_admin"
        logger.info("Generated org-admin magic link: %s", link.replace(token_str, "***"))

        if not send_email(
            to_email=email,
            subject="Accesso area amministrazione associazione",
            body=f"Clicca qui per accedere: {link}",
        ):
             logger.warning("Failed to send org admin magic link to %s", email)

    audit.org_admin_magic_link_requested(email=email, ip=get_client_ip(request))
    return {"ok": True}


@auth_router.get("/verify")
def verify_magic_link(
    request: Request,
    token: str,
    db: Session = Depends(get_db),
):
    """Verify a magic-link token and create an org-admin session."""
    auth_limiter.check(get_client_ip(request))
    token_hash = hash_token(token)
    token_entry = db.query(OrgAdminToken).filter(
        OrgAdminToken.token_hash == token_hash,
        OrgAdminToken.expires_at > datetime.utcnow(),
        OrgAdminToken.used_at.is_(None),
    ).first()

    if not token_entry:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    admin = db.query(AdminUser).filter(
        AdminUser.id == token_entry.admin_id,
        AdminUser.is_active.is_(True),
        AdminUser.deleted_at.is_(None), # Added deleted_at filter
    ).first()

    if not admin:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    # Mark token as used (one-time)
    token_entry.used_at = datetime.utcnow()
    db.commit()

    # Create session
    request.session["org_admin_id"] = admin.id
    audit.org_admin_verified(admin_id=admin.id, org_id=admin.org_id, ip=get_client_ip(request))

    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/org-admin", status_code=302)


@auth_router.post("/logout")
def logout(request: Request):
    """Clear the org-admin session."""
    request.session.pop("org_admin_id", None)
    return {"ok": True}


@auth_router.get("/me")
def me(request: Request, db: Session = Depends(get_db)):
    """Return the authenticated org admin profile."""
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return {
        "id": admin.id,
        "email": admin.email,
        "org_id": admin.org_id,
        "role": AdminRole.ORG_ADMIN.value,
        "organization": {
            "id": admin.organization.id,
            "name": admin.organization.name,
            "slug": admin.organization.slug,
        } if admin.organization else None,
    }


router.include_router(auth_router)


@router.get("/organization")
def get_organization_detail(
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    org = admin.organization
    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "statute_version": org.statute_version,
        "statute_updated_at": org.statute_updated_at,
        "has_statute": bool(org.statute_pdf_path),
    }


@router.post("/organization/statute")
async def upload_statute(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Max 10MB
    rel_path, size, sha = await save_upload_file(
        file,
        allowed_types=["application/pdf"],
        max_size=10 * 1024 * 1024
    )

    org = admin.organization

    # Increment version logic
    new_version = "v1"
    if org.statute_version:
        # Try parsing as vN
        if org.statute_version.startswith("v") and org.statute_version[1:].isdigit():
             ver_num = int(org.statute_version[1:])
             new_version = f"v{ver_num + 1}"
        else:
             # Fallback or manual handling if it was custom
             new_version = f"{org.statute_version}_new"

    org.statute_pdf_path = rel_path
    org.statute_version = new_version
    org.statute_updated_at = datetime.utcnow()

    db.commit()

    audit.log_operation(
        db,
        action="org.statute.upload",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="org_admin",
        metadata={
            "filename": file.filename,
            "size": size,
            "sha256": sha,
            "version": new_version
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent")
    )
    db.commit()

    return {
        "statute_version": new_version,
        "updated_at": org.statute_updated_at,
        "has_statute": True
    }


@router.get("/metrics")
def org_metrics(request: Request, db: Session = Depends(get_db)):
    """Return scoped metrics for the authenticated org admin's organization."""
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    org_id = admin.org_id

    members_count = db.query(func.count(Member.id)).filter(
        Member.org_id == org_id,
    ).scalar()

    pending_requests_count = db.query(func.count(Member.id)).filter(
        Member.org_id == org_id,
        Member.status != MemberStatus.ACTIVE,
    ).scalar()

    # Cards: computed from batches
    batches = db.query(CardBatch).filter(CardBatch.org_id == org_id).all()
    if batches:
        cards_total = sum(b.end_no - b.start_no + 1 for b in batches)
        cards_remaining = sum(max(b.end_no - b.next_no + 1, 0) for b in batches)
        cards_used = cards_total - cards_remaining
    else:
        cards_total = None
        cards_remaining = None
        cards_used = None

    return {
        "members_count": members_count,
        "cards_total": cards_total,
        "cards_used": cards_used,
        "cards_remaining": cards_remaining,
        "pending_requests_count": pending_requests_count,
    }


@router.get("/members")
def list_org_members(
    request: Request,
    q: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Return a paginated list of members scoped to the org admin's organization."""
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    query = db.query(Member).filter(Member.org_id == admin.org_id)

    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(
                Member.first_name.ilike(pattern),
                Member.last_name.ilike(pattern),
                Member.email.ilike(pattern),
            )
        )

    if status:
        query = query.filter(Member.status == status)

    total = query.count()
    members = (
        query.order_by(Member.id.desc())
        .offset(offset)
        .limit(min(limit, 100))
        .all()
    )

    return {
        "items": [
            {
                "id": m.id,
                "name": f"{m.first_name} {m.last_name}",
                "email": m.email,
                "status": m.status.value if m.status else None,
                "card_no": m.card_no,
                "joined_at": m.joined_at.isoformat() if m.joined_at else None,
                "created_at": m.joined_at.isoformat() if m.joined_at else None, # fallback if no created_at
                "docs_count": len(m.documents),
            }
            for m in members
        ],
        "total": total,
    }


@router.get("/members/{member_id}")
def get_member_detail(
    request: Request,
    member_id: int,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    member = db.query(Member).filter(Member.id == member_id, Member.org_id == admin.org_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    return {
        "id": member.id,
        "first_name": member.first_name,
        "last_name": member.last_name,
        "email": member.email,
        "phone": member.phone,
        "fiscal_code": member.fiscal_code,
        "status": member.status.value if member.status else None,
        "card_no": member.card_no,
        "joined_at": member.joined_at.isoformat() if member.joined_at else None,
        "documents": [
            {
                "id": d.id,
                "type": d.doc_type,
                "filename": d.original_filename,
                "uploaded_at": d.uploaded_at.isoformat(),
                "status": d.status,
                "review_notes": d.review_notes,
                "reviewed_at": d.reviewed_at.isoformat() if d.reviewed_at else None,
            }
            for d in member.documents
        ]
    }


@router.get("/documents/{doc_id}")
def download_document(
    request: Request,
    doc_id: int,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    doc = db.query(MemberDocument).filter(MemberDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Check ownership via member
    if doc.member.org_id != admin.org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    full_path = os.path.join(settings.UPLOAD_DIR, doc.rel_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File missing on disk")

    return FileResponse(
        full_path,
        filename=doc.original_filename,
        content_disposition_type="attachment"
    )


class ReviewBody(BaseModel):
    status: str
    notes: Optional[str] = None


@router.post("/documents/{doc_id}/review")
def review_document(
    request: Request,
    doc_id: int,
    body: ReviewBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if body.status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    doc = db.query(MemberDocument).filter(MemberDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.member.org_id != admin.org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    doc.status = body.status
    doc.review_notes = body.notes
    doc.reviewed_at = datetime.utcnow()
    doc.reviewed_by = admin.id

    # Logic to update Member status
    # If ANY doc is rejected -> member status REJECTED (or PENDING_FIX if we had it)
    # If ALL required docs are approved -> member status ACTIVE
    # (Simplified logic: check all docs for this member)

    member = doc.member
    all_docs = db.query(MemberDocument).filter(MemberDocument.member_id == member.id).all()

    any_rejected = any(d.status == DocStatus.REJECTED.value for d in all_docs)
    all_approved = all(d.status == DocStatus.APPROVED.value for d in all_docs)

    if any_rejected:
        member.status = MemberStatus.REJECTED
    elif all_approved:
        # Only if current status is pending verification/docs
        if member.status in [MemberStatus.PENDING_VERIFICATION, MemberStatus.PENDING_DOCS]:
             member.status = MemberStatus.ACTIVE
             # Ideally trigger card assignment here if not done, but usually done at upload or separately
             if not member.joined_at:
                 member.joined_at = datetime.utcnow()

    db.commit()

    audit.log_operation(
        db,
        action="member_doc.review",
        entity_type="member_document",
        entity_id=doc.id,
        actor_admin_id=admin.id,
        actor_role="org_admin",
        metadata={"status": body.status, "notes": body.notes, "member_id": member.id},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent")
    )
    db.commit()

    return {"ok": True, "doc_status": doc.status, "member_status": member.status.value}


@router.get("/members.csv")
def export_members_csv(
    request: Request,
    db: Session = Depends(get_db),
):
    """Export all members as CSV, scoped to the org admin's organization."""
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    members = (
        db.query(Member)
        .filter(Member.org_id == admin.org_id)
        .order_by(Member.last_name, Member.first_name)
        .all()
    )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Nome", "Cognome", "Email", "Codice Fiscale",
        "Telefono", "Stato", "Tessera", "Data iscrizione",
    ])
    for m in members:
        writer.writerow([
            m.first_name or "",
            m.last_name or "",
            m.email or "",
            m.fiscal_code or "",
            m.phone or "",
            m.status.value if m.status else "",
            m.card_no if m.card_no is not None else "",
            m.joined_at.strftime("%Y-%m-%d") if m.joined_at else "",
        ])

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=soci.csv"},
    )


@router.get("/cards")
def card_stock(request: Request, db: Session = Depends(get_db)):
    """Return card stock summary scoped to the org admin's organization."""
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    batches = db.query(CardBatch).filter(CardBatch.org_id == admin.org_id).all()

    if not batches:
        return {"total": 0, "used": 0, "remaining": 0}

    total = sum(b.end_no - b.start_no + 1 for b in batches)
    remaining = sum(max(b.end_no - b.next_no + 1, 0) for b in batches)
    used = total - remaining

    return {"total": total, "used": used, "remaining": remaining}


@router.get("/cards/movements")
def card_movements(
    request: Request,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Return card movements scoped to the org admin's organization."""
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    query = db.query(CardMovement).filter(CardMovement.org_id == admin.org_id)
    total = query.count()
    movements = (
        query.order_by(CardMovement.created_at.desc())
        .offset(offset)
        .limit(min(limit, 100))
        .all()
    )

    items = []
    for mv in movements:
        item = {
            "id": mv.id,
            "card_no": mv.card_no,
            "delta": mv.delta,
            "reason": mv.reason,
            "created_at": mv.created_at.isoformat() if mv.created_at else None,
            "member_name": None,
        }
        if mv.member:
            item["member_name"] = f"{mv.member.first_name} {mv.member.last_name}"
        items.append(item)

    return {"items": items, "total": total}
