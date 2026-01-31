import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Request, Form
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional

from app.db import get_db
from app.models import AdminUser, AdminRole, OrgAdminToken, Member, MemberStatus, CardBatch, CardMovement
from app.utils import generate_token, hash_token, send_email_simulation
from app.config import settings
from app.middleware import auth_limiter, get_client_ip
from app import audit

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

        link = f"{settings.BASE_URL}/api/org-admin/auth/verify?token={token_str}"
        send_email_simulation(
            to_email=email,
            subject="Accesso area amministrazione associazione",
            body=f"Clicca qui per accedere: {link}",
        )

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
    return RedirectResponse(url="/app/org-admin", status_code=302)


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
            }
            for m in members
        ],
        "total": total,
    }


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
