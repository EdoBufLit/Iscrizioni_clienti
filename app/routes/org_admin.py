from fastapi import APIRouter, Depends, HTTPException, Request, Form
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.db import get_db
from app.models import AdminUser, AdminRole, OrgAdminToken
from app.utils import generate_token, hash_token, send_email_simulation
from app.config import settings

router = APIRouter(prefix="/api/org-admin/auth")


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


@router.post("/magic-link")
def request_magic_link(
    request: Request,
    email: str = Form(...),
    db: Session = Depends(get_db),
):
    """
    Send a magic-link email to an active org admin.
    Always returns 200 to prevent email enumeration.
    """
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

    return {"ok": True}


@router.get("/verify")
def verify_magic_link(
    request: Request,
    token: str,
    db: Session = Depends(get_db),
):
    """Verify a magic-link token and create an org-admin session."""
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

    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/app/org-admin", status_code=302)


@router.post("/logout")
def logout(request: Request):
    """Clear the org-admin session."""
    request.session.pop("org_admin_id", None)
    return {"ok": True}


@router.get("/me")
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
