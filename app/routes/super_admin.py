from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
import re

from sqlalchemy import func, text

from app.db import get_db
from app.models import (
    AdminUser, AdminRole, Organization, OrgAdminToken, CardBatch, CardMovement,
    Member, MemberDocument, MemberPayment, Token
)
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
    Hard delete an organization and all related data.
    This action is irreversible.
    """
    admin = _require_super_admin(request, db)
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org_name = org.name
    org_slug = org.slug

    # Get all members of this organization
    member_ids = [m.id for m in db.query(Member.id).filter(Member.org_id == org_id).all()]

    # Get all org admins of this organization
    admin_ids = [a.id for a in db.query(AdminUser.id).filter(
        AdminUser.org_id == org_id,
        AdminUser.role == AdminRole.ORG_ADMIN
    ).all()]

    # Delete in correct order to respect FK constraints:

    # 1. Delete tokens for members
    if member_ids:
        db.query(Token).filter(Token.member_id.in_(member_ids)).delete(synchronize_session=False)

    # 2. Delete member documents
    if member_ids:
        db.query(MemberDocument).filter(MemberDocument.member_id.in_(member_ids)).delete(synchronize_session=False)

    # 3. Delete member payments
    db.query(MemberPayment).filter(MemberPayment.org_id == org_id).delete(synchronize_session=False)

    # 4. Delete members
    db.query(Member).filter(Member.org_id == org_id).delete(synchronize_session=False)

    # 5. Delete org admin tokens
    if admin_ids:
        db.query(OrgAdminToken).filter(OrgAdminToken.admin_id.in_(admin_ids)).delete(synchronize_session=False)

    # 6. Delete org admins
    db.query(AdminUser).filter(
        AdminUser.org_id == org_id,
        AdminUser.role == AdminRole.ORG_ADMIN
    ).delete(synchronize_session=False)

    # 7. Delete card movements
    db.query(CardMovement).filter(CardMovement.org_id == org_id).delete(synchronize_session=False)

    # 8. Delete card batches
    db.query(CardBatch).filter(CardBatch.org_id == org_id).delete(synchronize_session=False)

    # 9. Delete the organization itself
    db.delete(org)

    db.commit()

    # Log after commit (org no longer exists, use metadata)
    audit.log_operation(
        db,
        action="organization.hard_delete",
        entity_type="organization",
        entity_id=None,
        actor_admin_id=admin.id,
        actor_role="super_admin",
        metadata={
            "deleted_org_id": org_id,
            "deleted_org_name": org_name,
            "deleted_org_slug": org_slug,
            "deleted_members_count": len(member_ids),
            "deleted_admins_count": len(admin_ids),
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent")
    )
    db.commit()

    logger.info(
        "organization.hard_delete: org_id=%d slug=%s by super_admin=%d (members=%d, admins=%d)",
        org_id, org_slug, admin.id, len(member_ids), len(admin_ids)
    )

    return {"ok": True, "deleted_slug": org_slug}


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

    total_query = db.query(func.count(Organization.id))
    if q:
        search = f"%{q}%"
        total_query = total_query.filter(Organization.name.ilike(search) | Organization.slug.ilike(search))
    total = total_query.scalar()

    results = query.order_by(Organization.name).offset((page - 1) * limit).limit(limit).all()

    data = []
    for org, c_min, c_max in results:
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


@router.post("/organizations/{org_id}/statute")
async def upload_org_statute(
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
        allowed_types=["application/pdf"],
        max_size=10 * 1024 * 1024,
    )

    new_version = "v1"
    if org.statute_version:
        if org.statute_version.startswith("v") and org.statute_version[1:].isdigit():
            ver_num = int(org.statute_version[1:])
            new_version = f"v{ver_num + 1}"
        else:
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
        actor_role="super_admin",
        metadata={"filename": file.filename, "size": size, "sha256": sha, "version": new_version},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "statute_version": new_version,
        "updated_at": org.statute_updated_at,
        "has_statute": True,
    }


# ── Card stock management ────────────────────────────────────────

class SetCardRange(BaseModel):
    from_no: int
    to_no: int

class AddCardBatch(BaseModel):
    from_no: int
    to_no: int

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


@router.post("/orgs/{org_id}/cards/add-batch")
def add_card_batch(
    request: Request,
    org_id: int,
    body: AddCardBatch,
    db: Session = Depends(get_db),
):
    """Add a new card batch with explicit from/to range."""
    admin = _require_super_admin(request, db)
    # Ensure strict serialization for card allocation
    db.commit()
    db.execute(text("BEGIN IMMEDIATE"))

    if body.from_no <= 0 or body.to_no <= 0:
        raise HTTPException(status_code=400, detail="I numeri devono essere interi positivi")
    if body.from_no > body.to_no:
        raise HTTPException(status_code=400, detail="Il numero iniziale deve essere minore o uguale al finale")

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Check global overlap (across all organizations)
    conflict = check_card_overlap(db, body.from_no, body.to_no)
    if conflict:
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

    amount = body.to_no - body.from_no + 1
    movement = CardMovement(
        org_id=org_id,
        admin_id=admin.id,
        delta=amount,
        reason="batch_added",
    )
    db.add(movement)
    db.commit()

    audit.log_operation(
        db,
        action="org.cards.batch_added",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="super_admin",
        metadata={"from": body.from_no, "to": body.to_no, "batch_id": batch.id},
        ip=get_client_ip(request),
    )
    db.commit()

    # Return updated stock summary
    batches = db.query(CardBatch).filter(CardBatch.org_id == org_id).order_by(CardBatch.start_no).all()
    total = sum(b.end_no - b.start_no + 1 for b in batches)
    remaining = sum(max(b.end_no - b.next_no + 1, 0) for b in batches)

    return {
        "ok": True,
        "batch_id": batch.id,
        "start_no": body.from_no,
        "end_no": body.to_no,
        "cards_total": total,
        "cards_remaining": remaining,
    }


@router.get("/organizations/{org_id}/batches")
def get_org_batches(
    request: Request,
    org_id: int,
    db: Session = Depends(get_db),
):
    """Get all card batches for an organization."""
    _require_super_admin(request, db)

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    batches = db.query(CardBatch).filter(CardBatch.org_id == org_id).order_by(CardBatch.start_no).all()

    return {
        "batches": [
            {
                "id": b.id,
                "start_no": b.start_no,
                "end_no": b.end_no,
                "next_no": b.next_no,
                "total": b.end_no - b.start_no + 1,
                "assigned": b.next_no - b.start_no,
                "remaining": max(b.end_no - b.next_no + 1, 0),
            }
            for b in batches
        ],
        "summary": {
            "total": sum(b.end_no - b.start_no + 1 for b in batches),
            "assigned": sum(b.next_no - b.start_no for b in batches),
            "remaining": sum(max(b.end_no - b.next_no + 1, 0) for b in batches),
        }
    }


# Legacy endpoint redirect (deprecated)
@router.post("/orgs/{org_id}/cards/increase")
def increase_card_stock_legacy(
    request: Request,
    org_id: int,
    db: Session = Depends(get_db),
):
    """Deprecated: use /orgs/{org_id}/cards/add-batch instead."""
    raise HTTPException(
        status_code=400,
        detail="Endpoint deprecato. Usa il nuovo formato con range dalla/alla."
    )


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
