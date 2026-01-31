from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func

from app.db import get_db
from app.models import AdminUser, AdminRole, Organization, OrgAdminToken, CardBatch, CardMovement
from app.security import verify_password
from app.utils import generate_token, hash_token, send_email_simulation, send_email
from app.config import settings
from app.middleware import auth_limiter, get_client_ip
from app import audit

router = APIRouter(prefix="/api/super-admin")
auth_router = APIRouter(prefix="/auth")


def _require_super_admin(request: Request, db: Session) -> AdminUser:
    admin_id = request.session.get("admin_id")
    if not admin_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    admin = db.query(AdminUser).filter(
        AdminUser.id == admin_id,
        AdminUser.role == AdminRole.SUPER_ADMIN,
    ).first()
    if not admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return admin


class LoginBody(BaseModel):
    email: str
    password: str


@auth_router.post("/login")
def super_admin_login(
    request: Request,
    body: LoginBody,
    db: Session = Depends(get_db),
):
    auth_limiter.check(get_client_ip(request))
    admin = db.query(AdminUser).filter(
        AdminUser.email == body.email,
        AdminUser.role == AdminRole.SUPER_ADMIN,
    ).first()
    if not admin or not admin.password_hash or not verify_password(body.password, admin.password_hash):
        audit.super_admin_login_failed(ip=get_client_ip(request))
        raise HTTPException(status_code=401, detail="Invalid credentials")

    request.session["admin_id"] = admin.id
    audit.super_admin_login(admin_id=admin.id, ip=get_client_ip(request))
    return {"ok": True}


@auth_router.get("/me")
def super_admin_me(request: Request, db: Session = Depends(get_db)):
    admin = _require_super_admin(request, db)
    return {
        "id": admin.id,
        "email": admin.email,
        "role": AdminRole.SUPER_ADMIN.value,
    }


@auth_router.post("/logout")
def super_admin_logout(request: Request):
    request.session.pop("admin_id", None)
    return {"ok": True}


router.include_router(auth_router)


class CreateOrgAdmin(BaseModel):
    email: EmailStr
    org_id: int


class PatchOrgAdmin(BaseModel):
    is_active: bool


@router.post("/org-admins")
def create_org_admin(
    request: Request,
    body: CreateOrgAdmin,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)

    org = db.query(Organization).filter(Organization.id == body.org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    existing = db.query(AdminUser).filter(
        AdminUser.email == body.email,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    admin = AdminUser(
        email=body.email,
        password_hash="",
        role=AdminRole.ORG_ADMIN,
        org_id=body.org_id,
        is_active=True,
    )
    db.add(admin)
    db.flush()

    # Send first magic-link invite
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
        to_email=body.email,
        subject="Invito area amministrazione associazione",
        body=f"Sei stato invitato come amministratore di {org.name}.\nAccedi qui: {link}",
    )

    return {
        "id": admin.id,
        "email": admin.email,
        "org_id": admin.org_id,
        "org_name": org.name,
        "is_active": admin.is_active,
        "created_at": admin.created_at.isoformat() if admin.created_at else None,
    }


@router.get("/org-admins")
def list_org_admins(
    request: Request,
    org_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)

    query = db.query(AdminUser).filter(AdminUser.role == AdminRole.ORG_ADMIN)
    if org_id is not None:
        query = query.filter(AdminUser.org_id == org_id)

    admins = query.order_by(AdminUser.id).all()

    return [
        {
            "id": a.id,
            "email": a.email,
            "org_id": a.org_id,
            "org_name": a.organization.name if a.organization else None,
            "is_active": a.is_active,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in admins
    ]


@router.patch("/org-admins/{admin_id}")
def patch_org_admin(
    request: Request,
    admin_id: int,
    body: PatchOrgAdmin,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)

    target = db.query(AdminUser).filter(
        AdminUser.id == admin_id,
        AdminUser.role == AdminRole.ORG_ADMIN,
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Org admin not found")

    target.is_active = body.is_active
    db.commit()

    return {
        "id": target.id,
        "email": target.email,
        "org_id": target.org_id,
        "is_active": target.is_active,
    }


# ── Card stock management ────────────────────────────────────────

class IncreaseCards(BaseModel):
    amount: int
    reason: Optional[str] = None
    paid_ref: Optional[str] = None


@router.post("/orgs/{org_id}/cards/increase")
def increase_card_stock(
    request: Request,
    org_id: int,
    body: IncreaseCards,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)

    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Compute next start_no from existing batches for this org
    last_end = (
        db.query(func.max(CardBatch.end_no))
        .filter(CardBatch.org_id == org_id)
        .scalar()
    ) or 0
    start_no = last_end + 1
    end_no = last_end + body.amount

    batch = CardBatch(
        org_id=org_id,
        start_no=start_no,
        end_no=end_no,
        next_no=start_no,
    )
    db.add(batch)
    db.flush()

    movement = CardMovement(
        org_id=org_id,
        admin_id=admin.id,
        delta=body.amount,
        reason=body.reason or "stock_increase",
        paid_ref=body.paid_ref,
    )
    db.add(movement)
    db.commit()

    audit.card_stock_increased(
        org_id=org_id,
        amount=body.amount,
        admin_id=admin.id,
        reason=body.reason,
        paid_ref=body.paid_ref,
    )

    # Return updated stock summary
    batches = db.query(CardBatch).filter(CardBatch.org_id == org_id).all()
    total = sum(b.end_no - b.start_no + 1 for b in batches)
    remaining = sum(max(b.end_no - b.next_no + 1, 0) for b in batches)

    return {
        "batch_id": batch.id,
        "start_no": start_no,
        "end_no": end_no,
        "cards_total": total,
        "cards_remaining": remaining,
    }


# ── Test email ──────────────────────────────────────────────────

class TestEmailBody(BaseModel):
    to: EmailStr


@router.post("/test-email")
def test_email(
    request: Request,
    body: TestEmailBody,
    db: Session = Depends(get_db),
):
    """Send a test email to verify SMTP configuration. Super admin only."""
    _require_super_admin(request, db)
    ok = send_email(
        to_email=body.to,
        subject="ASSO.N.A.M. — Test Email",
        body=(
            "Questa email di test conferma che la configurazione SMTP "
            f"del portale ASSO.N.A.M. funziona correttamente.\n\n"
            f"Server: {settings.BASE_URL}\n"
            f"SMTP Host: {settings.SMTP_HOST or '(simulation)'}"
        ),
    )
    return {
        "ok": ok,
        "smtp_configured": bool(settings.SMTP_HOST and settings.SMTP_USER),
        "to": body.to,
    }
