from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
import re

from sqlalchemy import func, and_, or_, text

from app.db import get_db
from app.models import AdminUser, AdminRole, Organization, OrgAdminToken, CardBatch, CardMovement
from app.security import verify_password
from app.utils import generate_token, hash_token, send_email, save_upload_file
from app.config import settings
from app.middleware import auth_limiter, get_client_ip
from app import audit

import logging

logger = logging.getLogger(__name__)

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

def check_card_overlap(db: Session, start_no: int, end_no: int, exclude_batch_id: Optional[int] = None):
    """
    Check if the given range [start_no, end_no] overlaps with any existing CardBatch globally.
    Returns the conflicting batch if found, else None.
    Overlap logic: NOT (new_end < old_start OR new_start > old_end)
    Equivalent to: (new_end >= old_start) AND (new_start <= old_end)
    """
    query = db.query(CardBatch).filter(
        CardBatch.start_no <= end_no,
        CardBatch.end_no >= start_no
    )
    if exclude_batch_id is not None:
        query = query.filter(CardBatch.id != exclude_batch_id)

    return query.first()


class CreateOrganization(BaseModel):
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    description_short: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: str = "Italy"
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    is_active: bool = True

class PatchOrganization(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    description_short: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    is_active: Optional[bool] = None


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

    if not admin:
        logger.warning("super_admin_login: no admin found for email (hash=%s)", body.email[:3] + "***")
        audit.super_admin_login_failed(ip=get_client_ip(request))
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not admin.password_hash:
        logger.warning("super_admin_login: admin id=%d has empty password_hash", admin.id)
        audit.super_admin_login_failed(ip=get_client_ip(request))
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(body.password, admin.password_hash):
        logger.warning("super_admin_login: password mismatch for admin id=%d", admin.id)
        audit.super_admin_login_failed(ip=get_client_ip(request))
        raise HTTPException(status_code=401, detail="Invalid credentials")

    request.session["admin_id"] = admin.id
    audit.super_admin_login(admin_id=admin.id, ip=get_client_ip(request))
    logger.info("super_admin_login: success for admin id=%d", admin.id)
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

    email_norm = body.email.strip().lower()
    existing = db.query(AdminUser).filter(
        func.lower(AdminUser.email) == email_norm,
    ).first()

    if existing:
        if existing.deleted_at is not None:
             # Restore
             existing.deleted_at = None
             existing.is_active = True
             existing.password_hash = "" # Reset credentials
             existing.org_id = body.org_id
             db.commit()

             audit.org_admin_restored_on_create(admin_id=existing.id, org_id=existing.org_id, email_hash=audit._hash_email(email_norm))

             return {
                 "id": existing.id,
                 "email": existing.email,
                 "org_id": existing.org_id,
                 "org_name": org.name,
                 "is_active": existing.is_active,
                 "created_at": existing.created_at.isoformat() if existing.created_at else None,
                 "restored": True
             }
        else:
             raise HTTPException(status_code=409, detail="admin_exists")

    admin = AdminUser(
        email=email_norm,
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
    if not send_email(
        to_email=email_norm,
        subject="Invito area amministrazione associazione",
        body=f"Sei stato invitato come amministratore di {org.name}.\nAccedi qui: {link}",
    ):
         logger.warning("Failed to send org admin invite to %s", email_norm)

    audit.org_admin_created(admin_id=admin.id, org_id=admin.org_id, email_hash=audit._hash_email(email_norm))

    return {
        "id": admin.id,
        "email": admin.email,
        "org_id": admin.org_id,
        "org_name": org.name,
        "is_active": admin.is_active,
        "created_at": admin.created_at.isoformat() if admin.created_at else None,
        "created": True
    }


@router.get("/org-admins")
def list_org_admins(
    request: Request,
    org_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)

    query = db.query(AdminUser).filter(AdminUser.role == AdminRole.ORG_ADMIN, AdminUser.deleted_at.is_(None))
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


@router.delete("/org-admins/{admin_id}")
def delete_org_admin(
    request: Request,
    admin_id: int,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)

    target = db.query(AdminUser).filter(
        AdminUser.id == admin_id,
        AdminUser.role == AdminRole.ORG_ADMIN,
    ).first()

    if not target:
        raise HTTPException(status_code=404, detail="Org admin not found")

    if target.deleted_at is not None:
        return {"ok": True, "already_deleted": True}

    # Safety check: do NOT allow deleting the last active org-admin for that admin’s organization
    active_count = db.query(func.count(AdminUser.id)).filter(
        AdminUser.org_id == target.org_id,
        AdminUser.role == AdminRole.ORG_ADMIN,
        AdminUser.deleted_at.is_(None),
        AdminUser.is_active.is_(True)
    ).scalar()

    if active_count <= 1 and target.is_active:
         raise HTTPException(status_code=409, detail="Impossibile eliminare l'ultimo admin attivo dell'organizzazione.")

    target.deleted_at = datetime.utcnow()
    target.is_active = False
    db.commit()

    audit.org_admin_deleted(admin_id=target.id, org_id=target.org_id, super_admin_id=admin.id)
    logger.info("super_admin.org_admin_deleted: admin_id=%d org_id=%d by super_admin=%d", target.id, target.org_id, admin.id)

    return {"ok": True}


@router.post("/org-admins/{admin_id}/restore")
def restore_org_admin(
    request: Request,
    admin_id: int,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)

    target = db.query(AdminUser).filter(
        AdminUser.id == admin_id,
        AdminUser.role == AdminRole.ORG_ADMIN,
    ).first()

    if not target:
        raise HTTPException(status_code=404, detail="Org admin not found")

    if target.deleted_at is None:
        return {"ok": True, "already_active": True}

    target.deleted_at = None
    target.is_active = True
    target.password_hash = "" # Reset credentials
    db.commit()

    audit.org_admin_restored(admin_id=target.id, org_id=target.org_id, super_admin_id=admin.id)
    logger.info("super_admin.org_admin_restored: admin_id=%d org_id=%d by super_admin=%d", target.id, target.org_id, admin.id)

    return {"ok": True}


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


# ── Organization Management ──────────────────────────────────────

@router.post("/organizations")
def create_organization(
    request: Request,
    body: CreateOrganization,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)

    # Slug Logic
    slug = body.slug
    if not slug:
        slug = re.sub(r'[^a-z0-9]+', '-', body.name.lower()).strip('-')

    # Unique check
    if db.query(Organization).filter(Organization.slug == slug).first():
            raise HTTPException(status_code=409, detail="Slug already exists")

    description = body.description
    if not description and body.description_short:
        description = body.description_short

    org = Organization(
        name=body.name,
        slug=slug,
        description=description,
        address_line1=body.address_line1,
        address_line2=body.address_line2,
        city=body.city,
        province=body.province,
        postal_code=body.postal_code,
        country=body.country,
        email=body.email,
        phone=body.phone,
        website=body.website,
        is_active=body.is_active,
        created_by_admin_id=admin.id
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    audit.log_operation(
        db,
        action="org.create",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="super_admin",
        metadata=body.model_dump(exclude_unset=True),
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent")
    )
    db.commit()
    db.refresh(org)

    return org


@router.delete("/organizations/{org_id}")
def delete_organization(
    request: Request,
    org_id: int,
    db: Session = Depends(get_db),
):
    """
    Deactivate (soft-delete) an organization.
    It remains in the database but is_active=False.
    """
    admin = _require_super_admin(request, db)
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if not org.is_active:
        return {"ok": True, "already_inactive": True}

    org.is_active = False
    # If we had deleted_at on Organization, we would set it here.
    # org.deleted_at = datetime.utcnow()

    db.commit()

    audit.log_operation(
        db,
        action="organization.deactivate",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="super_admin",
        metadata={},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent")
    )
    db.commit()

    return {"ok": True}


@router.get("/organizations")
def list_organizations(
    request: Request,
    page: int = 1,
    limit: int = 50,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)

    # Query organizations with aggregated card ranges
    # Use outerjoin to include organizations without cards
    query = db.query(
        Organization,
        func.min(CardBatch.start_no).label("card_min"),
        func.max(CardBatch.end_no).label("card_max")
    ).outerjoin(CardBatch, CardBatch.org_id == Organization.id)

    if q:
        search = f"%{q}%"
        query = query.filter(Organization.name.ilike(search) | Organization.slug.ilike(search))

    query = query.group_by(Organization.id)

    # Note: query.count() might be tricky with group_by, simpler to use subquery or separate count
    # But for now, let's just count all organizations matching filter
    total_query = db.query(func.count(Organization.id))
    if q:
        search = f"%{q}%"
        total_query = total_query.filter(Organization.name.ilike(search) | Organization.slug.ilike(search))
    total = total_query.scalar()

    results = query.order_by(Organization.name).offset((page - 1) * limit).limit(limit).all()

    data = []
    for org, c_min, c_max in results:
        # Pydantic or manual dict construction
        # We need to inject card_min/card_max into the response
        item = {
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "description": org.description,
            "is_active": org.is_active,
            "created_at": org.created_at,
            "city": org.city,
            "province": org.province,
            "card_min": c_min,
            "card_max": c_max
        }
        data.append(item)

    return {
        "data": data,
        "meta": {"page": page, "limit": limit, "total": total}
    }


@router.patch("/organizations/{org_id}")
def update_organization(
    request: Request,
    org_id: int,
    body: PatchOrganization,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

    update_data = body.model_dump(exclude_unset=True)

    # Map description_short -> description if provided
    if "description_short" in update_data:
        short = update_data.pop("description_short")
        if "description" not in update_data:
            update_data["description"] = short

    for key, value in update_data.items():
        setattr(org, key, value)

    db.commit()

    audit.log_operation(
        db,
        action="org.update",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="super_admin",
        metadata=update_data,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent")
    )
    db.commit()
    db.refresh(org)

    return org


@router.post("/organizations/{org_id}/logo")
async def upload_org_logo(
    request: Request,
    org_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

    rel_path, size, sha = await save_upload_file(
        file,
        allowed_types=["image/jpeg", "image/png", "image/svg+xml"],
        max_size=2 * 1024 * 1024
    )

    org.logo_path = rel_path
    db.commit()

    audit.log_operation(
        db,
        action="org.logo.upload",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="super_admin",
        metadata={"filename": file.filename, "size": size, "sha256": sha},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent")
    )
    db.commit()

    return {"logo_path": rel_path}


# ── Card stock management ────────────────────────────────────────

class SetCardRange(BaseModel):
    from_no: int
    to_no: int

class IncreaseCards(BaseModel):
    amount: int
    reason: Optional[str] = None
    paid_ref: Optional[str] = None


@router.post("/organizations/{org_id}/card-range")
def set_initial_card_range(
    request: Request,
    org_id: int,
    body: SetCardRange,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    # Ensure strict serialization for card allocation
    db.commit()
    db.execute(text("BEGIN IMMEDIATE"))

    if body.from_no <= 0 or body.to_no <= 0:
         raise HTTPException(status_code=400, detail="Range must be positive integers")
    if body.from_no > body.to_no:
         raise HTTPException(status_code=400, detail="FROM must be less than or equal to TO")

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Check if org already has batches
    existing_count = db.query(CardBatch).filter(CardBatch.org_id == org_id).count()
    if existing_count > 0:
        raise HTTPException(status_code=400, detail="L'organizzazione ha già delle tessere assegnate. Usa 'Aggiungi tessere'.")

    # Check global overlap
    conflict = check_card_overlap(db, body.from_no, body.to_no)
    if conflict:
        # Fetch conflicting org name
        conflicting_org = db.query(Organization).filter(Organization.id == conflict.org_id).first()
        org_name = conflicting_org.name if conflicting_org else f"Org #{conflict.org_id}"
        raise HTTPException(
            status_code=409,
            detail=f"Intervallo tessere in conflitto con {org_name} ({conflict.start_no}–{conflict.end_no})"
        )

    batch = CardBatch(
        org_id=org_id,
        start_no=body.from_no,
        end_no=body.to_no,
        next_no=body.from_no,
    )
    db.add(batch)
    db.flush()

    movement = CardMovement(
        org_id=org_id,
        admin_id=admin.id,
        delta=(body.to_no - body.from_no + 1),
        reason="initial_allocation",
    )
    db.add(movement)

    audit.log_operation(
        db,
        action="org.cards.range_set",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="super_admin",
        metadata={"from": body.from_no, "to": body.to_no},
        ip=get_client_ip(request)
    )
    db.commit()

    return {"ok": True, "start_no": body.from_no, "end_no": body.to_no}


@router.post("/orgs/{org_id}/cards/increase")
def increase_card_stock(
    request: Request,
    org_id: int,
    body: IncreaseCards,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    # Ensure strict serialization for card allocation
    db.commit()
    db.execute(text("BEGIN IMMEDIATE"))

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
    )

    if last_end is None:
         # No existing batches
         raise HTTPException(status_code=400, detail="Imposta prima un intervallo iniziale")

    start_no = last_end + 1
    end_no = last_end + body.amount

    # Check global overlap
    conflict = check_card_overlap(db, start_no, end_no)
    if conflict:
        conflicting_org = db.query(Organization).filter(Organization.id == conflict.org_id).first()
        org_name = conflicting_org.name if conflicting_org else f"Org #{conflict.org_id}"
        raise HTTPException(
            status_code=409,
            detail=f"Intervallo tessere in conflitto con {org_name} ({conflict.start_no}–{conflict.end_no})"
        )

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
