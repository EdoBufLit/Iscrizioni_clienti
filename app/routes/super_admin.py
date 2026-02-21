from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Literal, Optional
import secrets
import re

from sqlalchemy import and_, func, text
from sqlalchemy.exc import IntegrityError, OperationalError

from app.db import get_db
from app.models import (
    AdminUser, AdminRole, Organization, OrgAdminToken, CardBatch, CardMovement,
    Member, PaymentMethod, IntegrationApiKey
)
from app.security import hash_api_key, verify_password
from app.utils import generate_token, hash_token, send_email, save_upload_file
from app.config import settings
from app.middleware import auth_limiter, get_client_ip
from app import audit
from app.services.association_delete import delete_association_and_release_range
from app.services.member_activity import get_member_lifecycle_status, is_member_active
from app.services.member_maintenance import expire_and_purge_members

import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/super-admin")
associations_router = APIRouter(prefix="/api/admin")
auth_router = APIRouter(prefix="/auth")

_ALLOWED_MEMBER_PAYMENT_METHODS = {
    PaymentMethod.CASH.value,
    PaymentMethod.BONIFICO.value,
}
_ALLOWED_INTEGRATION_SCOPES = {"issue_member"}


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


def _serialize_member_payment_method(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, PaymentMethod):
        return value.value
    text = str(value).strip()
    if not text:
        return None
    upper = text.upper()
    return upper if upper in _ALLOWED_MEMBER_PAYMENT_METHODS else text


class LoginBody(BaseModel):
    email: str
    password: str

class CreateOrganization(BaseModel):
    name: str
    slug: Optional[str] = None
    club_display_name: Optional[str] = None
    card_email_subject: Optional[str] = None
    card_logo_url: Optional[str] = None
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
    club_display_name: Optional[str] = None
    card_email_subject: Optional[str] = None
    card_logo_url: Optional[str] = None
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


class CreateIntegrationKeyBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = "pienissimo"
    scopes: list[str] = Field(default_factory=lambda: ["issue_member"])


class RunMaintenanceBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    purge_pii: bool = True


def _get_org_or_404(db: Session, org_id: int) -> Organization:
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _normalize_integration_name(raw_value: str | None) -> str:
    normalized = (raw_value or "").strip().lower()
    if not normalized:
        raise HTTPException(status_code=400, detail="Nome integrazione obbligatorio.")
    return normalized


def _normalize_integration_scopes(raw_scopes: list[str] | None) -> list[str]:
    provided_scopes = raw_scopes or ["issue_member"]
    cleaned_scopes = sorted({scope.strip() for scope in provided_scopes if scope and scope.strip()})
    if not cleaned_scopes:
        raise HTTPException(status_code=400, detail="Almeno uno scope e obbligatorio.")

    invalid_scopes = [scope for scope in cleaned_scopes if scope not in _ALLOWED_INTEGRATION_SCOPES]
    if invalid_scopes:
        raise HTTPException(
            status_code=400,
            detail=f"Scope non validi: {', '.join(invalid_scopes)}",
        )
    return cleaned_scopes


def _serialize_integration_key(key: IntegrationApiKey) -> dict:
    return {
        "id": key.id,
        "name": key.name,
        "scopes": key.scopes or [],
        "is_active": bool(key.is_active),
        "created_at": key.created_at.isoformat() if key.created_at else None,
        "last_used_at": key.last_used_at.isoformat() if key.last_used_at else None,
        "last_used_ip": key.last_used_ip,
    }


def _create_integration_key(
    db: Session,
    org_id: int,
    name: str,
    scopes: list[str],
) -> tuple[IntegrationApiKey, str]:
    def _is_org_name_unique_conflict(error: IntegrityError) -> bool:
        message = str(getattr(error, "orig", error)).lower()
        return (
            "unique" in message
            and "integration_api_keys.org_id" in message
            and "integration_api_keys.name" in message
        ) or "uix_integration_api_keys_org_name" in message

    def _is_key_hash_unique_conflict(error: IntegrityError) -> bool:
        message = str(getattr(error, "orig", error)).lower()
        return (
            "unique" in message
            and "integration_api_keys.key_hash" in message
        ) or "uq_integration_api_keys_key_hash" in message

    def _reuse_legacy_unique_row(
        key_hash: str,
    ) -> IntegrationApiKey | None:
        existing = (
            db.query(IntegrationApiKey)
            .filter(
                IntegrationApiKey.org_id == org_id,
                IntegrationApiKey.name == name,
            )
            .order_by(IntegrationApiKey.id.desc())
            .first()
        )
        if not existing:
            return None

        # Legacy DBs may still enforce UNIQUE(org_id, name). In that case we
        # rotate by updating the existing row in place.
        existing.key_hash = key_hash
        existing.scopes = scopes
        existing.is_active = True
        existing.created_at = datetime.utcnow()
        existing.last_used_at = None
        existing.last_used_ip = None
        existing.last_used_user_agent = None
        db.commit()
        db.refresh(existing)
        return existing

    for attempt in range(2):
        raw_key = secrets.token_urlsafe(32)
        key_hash = hash_api_key(raw_key)
        key = IntegrationApiKey(
            org_id=org_id,
            name=name,
            key_hash=key_hash,
            scopes=scopes,
            is_active=True,
        )
        db.add(key)

        try:
            db.commit()
            db.refresh(key)
            return key, raw_key
        except IntegrityError as exc:
            db.rollback()
            if _is_key_hash_unique_conflict(exc) and attempt == 0:
                continue
            if _is_org_name_unique_conflict(exc):
                reused = _reuse_legacy_unique_row(key_hash=key_hash)
                if reused is not None:
                    logger.warning(
                        "integration_api_keys legacy unique(org_id,name) detected for org_id=%s name=%s; reusing key row id=%s",
                        org_id,
                        name,
                        reused.id,
                    )
                    return reused, raw_key
            raise HTTPException(
                status_code=409,
                detail="Impossibile creare la chiave integrazione. Verifica vincoli esistenti o ruota la chiave corrente.",
            ) from exc
        except OperationalError as exc:
            db.rollback()
            logger.exception("Integration key creation failed due to DB schema issue.")
            raise HTTPException(
                status_code=500,
                detail="Schema integrazioni non aggiornato. Esegui 'alembic upgrade head'.",
            ) from exc

    raise HTTPException(
        status_code=500,
        detail="Errore interno durante la generazione della chiave integrazione.",
    )


@router.get("/orgs/{org_id}/integration-keys")
def list_org_integration_keys(
    request: Request,
    org_id: int,
    name: Optional[str] = None,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)
    _get_org_or_404(db, org_id)

    query = db.query(IntegrationApiKey).filter(IntegrationApiKey.org_id == org_id)
    if name is not None:
        query = query.filter(IntegrationApiKey.name == _normalize_integration_name(name))

    keys = query.order_by(IntegrationApiKey.created_at.desc(), IntegrationApiKey.id.desc()).all()
    return {"items": [_serialize_integration_key(key) for key in keys]}


@router.post("/orgs/{org_id}/integration-keys")
def create_org_integration_key(
    request: Request,
    org_id: int,
    body: CreateIntegrationKeyBody,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    _get_org_or_404(db, org_id)

    normalized_name = _normalize_integration_name(body.name)
    normalized_scopes = _normalize_integration_scopes(body.scopes)
    key, raw_key = _create_integration_key(
        db=db,
        org_id=org_id,
        name=normalized_name,
        scopes=normalized_scopes,
    )

    audit.log_operation(
        db,
        action="integration_key_created",
        entity_type="integration_api_key",
        entity_id=key.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.SUPER_ADMIN.value,
        metadata={
            "org_id": org_id,
            "name": key.name,
            "scopes": key.scopes,
            "is_active": bool(key.is_active),
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "id": key.id,
        "created_at": key.created_at.isoformat() if key.created_at else None,
        "raw_key": raw_key,
    }


@router.post("/orgs/{org_id}/integration-keys/{key_id}/rotate")
def rotate_org_integration_key(
    request: Request,
    org_id: int,
    key_id: int,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    _get_org_or_404(db, org_id)

    current_key = (
        db.query(IntegrationApiKey)
        .filter(IntegrationApiKey.id == key_id, IntegrationApiKey.org_id == org_id)
        .first()
    )
    if not current_key:
        raise HTTPException(status_code=404, detail="Integration key not found")

    current_key.is_active = False
    db.commit()

    new_key, raw_key = _create_integration_key(
        db=db,
        org_id=org_id,
        name=current_key.name,
        scopes=_normalize_integration_scopes(current_key.scopes or ["issue_member"]),
    )

    audit.log_operation(
        db,
        action="integration_key_rotated",
        entity_type="integration_api_key",
        entity_id=new_key.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.SUPER_ADMIN.value,
        metadata={
            "org_id": org_id,
            "previous_key_id": current_key.id,
            "name": new_key.name,
            "scopes": new_key.scopes,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "id": new_key.id,
        "created_at": new_key.created_at.isoformat() if new_key.created_at else None,
        "raw_key": raw_key,
        "replaced_key_id": current_key.id,
    }


@router.delete("/orgs/{org_id}/integration-keys/{key_id}")
def disable_org_integration_key(
    request: Request,
    org_id: int,
    key_id: int,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    _get_org_or_404(db, org_id)

    key = (
        db.query(IntegrationApiKey)
        .filter(IntegrationApiKey.id == key_id, IntegrationApiKey.org_id == org_id)
        .first()
    )
    if not key:
        raise HTTPException(status_code=404, detail="Integration key not found")

    key.is_active = False
    db.commit()

    audit.log_operation(
        db,
        action="integration_key_disabled",
        entity_type="integration_api_key",
        entity_id=key.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.SUPER_ADMIN.value,
        metadata={"org_id": org_id, "name": key.name, "is_active": bool(key.is_active)},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {"ok": True, **_serialize_integration_key(key)}


@router.post("/maintenance/run")
def run_maintenance(
    request: Request,
    body: RunMaintenanceBody | None = None,
    db: Session = Depends(get_db),
):
    admin = _require_super_admin(request, db)
    now = datetime.utcnow()
    payload = body or RunMaintenanceBody()

    result = expire_and_purge_members(
        db=db,
        now=now,
        purge_pii=payload.purge_pii,
    )

    audit.log_operation(
        db,
        action="auto_expire_members",
        entity_type="member",
        actor_admin_id=admin.id,
        actor_role=AdminRole.SUPER_ADMIN.value,
        metadata={
            "expired_count": result["expired_count"],
            "purged_count": result["purged_count"],
            "current_year": result["current_year"],
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "ok": True,
        "ran_at": now.isoformat() + "Z",
        **result,
    }


@router.get("/members/{member_id}")
def super_admin_member_detail(
    request: Request,
    member_id: int,
    db: Session = Depends(get_db),
):
    _require_super_admin(request, db)

    member = db.query(Member).filter(
        Member.id == member_id,
        Member.deleted_at.is_(None),
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    return {
        "id": member.id,
        "first_name": member.first_name,
        "last_name": member.last_name,
        "email": member.email,
        "phone": member.phone,
        "fiscal_code": member.fiscal_code,
        "payment_method": _serialize_member_payment_method(member.payment_method),
        "status": get_member_lifecycle_status(member, now=datetime.utcnow()),
        "workflow_status": member.status.value if hasattr(member.status, "value") else str(member.status),
        "is_active": is_member_active(member, now=datetime.utcnow()),
        "deleted_at": member.deleted_at.isoformat() if member.deleted_at else None,
        "card_no": member.card_no,
        "card_number": member.card_no,
        "card_year": member.card_year,
        "joined_at": member.joined_at.isoformat() if member.joined_at else None,
        "member_type": member.member_type,
        "internal_notes": member.internal_notes,
        "is_manual": bool(member.is_manual),
        "organization": {
            "id": member.organization.id,
            "name": member.organization.name,
            "slug": member.organization.slug,
        } if member.organization else None,
    }


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
        club_display_name=body.club_display_name,
        card_email_subject=body.card_email_subject,
        card_logo_url=body.card_logo_url,
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


def _delete_association_handler(
    request: Request,
    association_id: int,
    mode: Literal["archive", "purge"],
    release_range: bool,
    force: bool,
    db: Session,
):
    admin = _require_super_admin(request, db)
    return delete_association_and_release_range(
        db,
        request=request,
        association_id=association_id,
        mode=mode,
        release_range=release_range,
        force=force,
        actor_admin_id=admin.id,
    )


@associations_router.delete("/associations/{association_id}")
def delete_association(
    request: Request,
    association_id: int,
    mode: Literal["archive", "purge"] = "archive",
    release_range: bool = True,
    force: bool = False,
    db: Session = Depends(get_db),
):
    return _delete_association_handler(
        request=request,
        association_id=association_id,
        mode=mode,
        release_range=release_range,
        force=force,
        db=db,
    )


@router.delete("/organizations/{org_id}")
def delete_organization(
    request: Request,
    org_id: int,
    db: Session = Depends(get_db),
):
    # Legacy endpoint compatibility: preserve hard-delete behavior.
    return _delete_association_handler(
        request=request,
        association_id=org_id,
        mode="purge",
        release_range=True,
        force=True,
        db=db,
    )


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
    ).outerjoin(
        CardBatch,
        and_(
            CardBatch.org_id == Organization.id,
            CardBatch.released_at.is_(None),
        ),
    )

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
            "club_display_name": org.club_display_name,
            "card_email_subject": org.card_email_subject,
            "card_logo_url": org.card_logo_url,
            "description": org.description,
            "is_active": org.is_active,
            "is_archived": org.deleted_at is not None,
            "deleted_at": org.deleted_at,
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
    year: Optional[int] = None

class AddCardBatch(BaseModel):
    from_no: int
    to_no: int
    year: Optional[int] = None

def check_card_overlap(db: Session, start_no: int, end_no: int, exclude_batch_id: Optional[int] = None):
    """
    Check if the given range [start_no, end_no] overlaps with any existing CardBatch globally.
    Returns the conflicting batch if found, else None.
    Overlap logic: NOT (new_end < old_start OR new_start > old_end)
    Equivalent to: (new_end >= old_start) AND (new_start <= old_end)
    """
    query = db.query(CardBatch).filter(
        CardBatch.released_at.is_(None),
        CardBatch.start_no <= end_no,
        CardBatch.end_no >= start_no
    )
    if exclude_batch_id is not None:
        query = query.filter(CardBatch.id != exclude_batch_id)

    return query.first()


def _resolve_batch_year(raw_year: Optional[int]) -> int:
    default_year = datetime.utcnow().year
    if raw_year is None:
        return default_year
    if raw_year < 2000 or raw_year > default_year + 20:
        raise HTTPException(status_code=400, detail="Anno lotto non valido")
    return raw_year


def _count_assigned_cards_for_batch(db: Session, batch: CardBatch) -> int:
    return int(
        db.query(func.count(func.distinct(Member.card_no))).filter(
            Member.org_id == batch.org_id,
            Member.deleted_at.is_(None),
            Member.card_year == batch.year,
            Member.card_no.isnot(None),
            Member.card_no >= batch.start_no,
            Member.card_no <= batch.end_no,
        ).scalar()
        or 0
    )


def _serialize_batch_usage(db: Session, batch: CardBatch) -> dict[str, int | bool | None]:
    total = int(batch.end_no - batch.start_no + 1)
    assigned = _count_assigned_cards_for_batch(db, batch)
    remaining = max(total - assigned, 0)
    batch_next_no = batch.next_no if batch.next_no is not None else batch.start_no
    return {
        "id": batch.id,
        "start_no": batch.start_no,
        "end_no": batch.end_no,
        "next_no": batch.next_no,
        "year": batch.year,
        "is_active": bool(batch.released_at is None and batch_next_no <= batch.end_no),
        "total": total,
        "assigned": assigned,
        "remaining": remaining,
    }


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
    batch_year = _resolve_batch_year(body.year)

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Check if org already has batches
    existing_count = db.query(CardBatch).filter(
        CardBatch.org_id == org_id,
        CardBatch.released_at.is_(None),
    ).count()
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
        year=batch_year,
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

    return {"ok": True, "year": batch_year, "start_no": body.from_no, "end_no": body.to_no}


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
    batch_year = _resolve_batch_year(body.year)

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
        year=batch_year,
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
    batches = db.query(CardBatch).filter(
        CardBatch.org_id == org_id,
        CardBatch.year == batch_year,
        CardBatch.released_at.is_(None),
    ).order_by(CardBatch.start_no).all()
    serialized_batches = [_serialize_batch_usage(db, b) for b in batches]
    total = int(sum(int(item["total"]) for item in serialized_batches))
    remaining = int(sum(int(item["remaining"]) for item in serialized_batches))

    return {
        "ok": True,
        "batch_id": batch.id,
        "year": batch_year,
        "start_no": body.from_no,
        "end_no": body.to_no,
        "cards_total": total,
        "cards_remaining": remaining,
    }


@router.get("/organizations/{org_id}/batches")
def get_org_batches(
    request: Request,
    org_id: int,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Get all card batches for an organization."""
    _require_super_admin(request, db)

    now = datetime.utcnow()
    target_year = _resolve_batch_year(year if year is not None else now.year)
    next_reset = datetime(target_year + 1, 1, 1)

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    batches = db.query(CardBatch).filter(
        CardBatch.org_id == org_id,
        CardBatch.year == target_year,
        CardBatch.released_at.is_(None),
    ).order_by(CardBatch.start_no).all()
    serialized_batches = [_serialize_batch_usage(db, b) for b in batches]
    summary_total = int(sum(int(item["total"]) for item in serialized_batches))
    summary_assigned = int(sum(int(item["assigned"]) for item in serialized_batches))
    summary_remaining = int(sum(int(item["remaining"]) for item in serialized_batches))

    return {
        "batches": serialized_batches,
        "current_year": target_year,
        "next_reset_at": next_reset.isoformat() + "Z",
        "summary": {
            "total": summary_total,
            "assigned": summary_assigned,
            "remaining": summary_remaining,
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
    _require_super_admin(request, db)
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
