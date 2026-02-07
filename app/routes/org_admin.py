import csv
import io

import os
from fastapi import APIRouter, Depends, HTTPException, Request, Form, Body
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy import func, or_, case, and_, select
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, date
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict

from fastapi import UploadFile, File
from app.db import get_db
from app.models import (
    AdminUser,
    AdminRole,
    OrgAdminToken,
    Member,
    MemberStatus,
    PaymentMethod,
    CardBatch,
    CardMovement,
    Organization,
    MemberDocument,
    DocStatus,
    MemberPayment,
    OperationLog,
    Token,
    TokenType,
)
from app.utils import generate_token, hash_token, send_email, save_upload_file
from app.services.card import assign_next_card
from app.config import settings
from app.middleware import auth_limiter, get_client_ip
from app import audit
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/org-admin")

auth_router = APIRouter(prefix="/auth")


def _get_current_org_admin(request: Request, db: Session):
    """Return the authenticated org admin from the session, or None.

    Note: We only check for org_admin_id. If someone is also logged in as
    super admin (admin_id), they can still use org_admin endpoints if they
    have a valid org_admin session. This prevents confusing authorization
    failures when both sessions coexist.
    """
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


ACCESS_EMAIL_THROTTLE_MINUTES = 10
_ALLOWED_MEMBER_PAYMENT_METHODS = {
    PaymentMethod.CASH.value,
    PaymentMethod.BONIFICO.value,
}


def _normalize_member_payment_method(raw_value: Optional[str], required: bool = False) -> Optional[str]:
    if raw_value is None:
        if required:
            raise HTTPException(
                status_code=400,
                detail="Modalita di pagamento obbligatoria. Seleziona CASH o BONIFICO.",
            )
        return None

    normalized = raw_value.strip().upper()
    if normalized == "":
        if required:
            raise HTTPException(
                status_code=400,
                detail="Modalita di pagamento obbligatoria. Seleziona CASH o BONIFICO.",
            )
        return None

    if normalized not in _ALLOWED_MEMBER_PAYMENT_METHODS:
        raise HTTPException(
            status_code=400,
            detail="Modalita di pagamento non valida. Valori ammessi: CASH, BONIFICO.",
        )
    return normalized


def _serialize_member_payment_method(value: Optional[object]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, PaymentMethod):
        return value.value
    text = str(value).strip()
    if text == "":
        return None
    upper = text.upper()
    return upper if upper in _ALLOWED_MEMBER_PAYMENT_METHODS else text


def _get_last_access_email_token(db: Session, member_id: int) -> Optional[Token]:
    return (
        db.query(Token)
        .filter(
            Token.member_id == member_id,
            Token.purpose == TokenType.LOGIN_MAGIC_LINK,
        )
        .order_by(Token.created_at.desc())
        .first()
    )


def _document_status_from_statuses(statuses: list[Optional[str]]) -> str:
    normalized = [s for s in statuses if s]
    if not normalized:
        return "not_provided"
    if DocStatus.REJECTED.value in normalized:
        return DocStatus.REJECTED.value
    if any(s in {DocStatus.PENDING.value, DocStatus.UPLOADED.value} for s in normalized):
        return DocStatus.PENDING.value
    if all(s == DocStatus.APPROVED.value for s in normalized):
        return DocStatus.APPROVED.value
    return DocStatus.PENDING.value


def _send_member_magic_link(
    db: Session,
    request: Request,
    member: Member,
) -> tuple[bool, datetime]:
    token_str = generate_token()
    token = Token(
        member_id=member.id,
        purpose=TokenType.LOGIN_MAGIC_LINK,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=settings.LOGIN_TOKEN_EXPIRE_MINUTES),
    )
    db.add(token)
    db.commit()
    db.refresh(token)

    frontend_base = settings.FRONTEND_URL.rstrip("/")
    if not frontend_base:
        frontend_base = str(request.base_url).rstrip("/")

    link = f"{frontend_base}/auth/verify?token={token_str}&role=member"
    logger.info("Generated member magic link: %s", link.replace(token_str, "***"))

    email_sent = send_email(
        to_email=member.email,
        subject="Accesso Area Riservata - ASSO.N.A.M.",
        body=(
            "Sei stato registrato come socio. "
            f"Clicca qui per accedere alla tua area riservata: {link}\n\n"
            f"Il link scade tra {settings.LOGIN_TOKEN_EXPIRE_MINUTES} minuti."
        ),
    )
    if not email_sent:
        logger.warning("Failed to send magic link email to %s", member.email)

    return email_sent, token.created_at or datetime.utcnow()


class CreateMemberBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    first_name: str = Field(..., min_length=1)
    last_name: str = Field(..., min_length=1)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    fiscal_code: Optional[str] = None
    payment_method: Optional[str] = None
    joined_at: Optional[date] = None
    member_type: Optional[str] = None
    internal_notes: Optional[str] = None
    is_manual: bool = True
    send_access_email: bool = False


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


class PatchOrgOrganization(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None


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
        "description": org.description,
        "address_line1": org.address_line1,
        "address_line2": org.address_line2,
        "city": org.city,
        "province": org.province,
        "postal_code": org.postal_code,
        "country": org.country,
        "email": org.email,
        "phone": org.phone,
        "website": org.website,
        "logo_url": f"/api/organizations/{org.slug}/logo" if org.logo_path else None,
        "statute_version": org.statute_version,
        "statute_updated_at": org.statute_updated_at,
        "statute_url": f"/api/organizations/{org.slug}/statute" if org.statute_pdf_path else None,
        "has_statute": bool(org.statute_pdf_path),
    }


@router.patch("/organization")
def patch_organization(
    request: Request,
    body: PatchOrgOrganization,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    org = admin.organization
    update_data = body.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(org, key, value)

    db.commit()

    audit.log_operation(
        db,
        action="org.update",
        entity_type="organization",
        entity_id=org.id,
        actor_admin_id=admin.id,
        actor_role="org_admin",
        metadata=update_data,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {"ok": True}


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
    """Return scoped metrics for the authenticated org admin's organization.

    PERFORMANCE: Uses combined queries with conditional aggregation to minimize
    database round-trips (was 4+ queries, now 3).
    """
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    org_id = admin.org_id

    # Query 1: Member counts with conditional aggregation (combines 2 queries into 1)
    member_stats = db.query(
        func.count(Member.id).label("total"),
        func.sum(
            case(
                (and_(
                    Member.status != MemberStatus.ACTIVE,
                    Member.status != MemberStatus.REJECTED,
                ), 1),
                else_=0
            )
        ).label("pending"),
    ).filter(
        Member.org_id == org_id,
        Member.deleted_at.is_(None),
    ).first()

    members_count = member_stats.total or 0
    pending_requests_count = member_stats.pending or 0

    # Query 2: Document counts with conditional aggregation (combines 2 queries into 1)
    doc_stats = db.query(
        func.sum(
            case(
                (MemberDocument.status.in_([DocStatus.PENDING.value, DocStatus.UPLOADED.value]), 1),
                else_=0
            )
        ).label("pending"),
        func.sum(
            case(
                (MemberDocument.status == DocStatus.REJECTED.value, 1),
                else_=0
            )
        ).label("rejected"),
    ).join(
        Member, MemberDocument.member_id == Member.id
    ).filter(
        Member.org_id == org_id,
        Member.deleted_at.is_(None),
        Member.status != MemberStatus.REJECTED,
    ).first()

    documents_pending_review = doc_stats.pending or 0
    documents_rejected = doc_stats.rejected or 0

    # Query 3: Card batch aggregation in SQL (avoids Python loops)
    card_stats = db.query(
        func.sum(CardBatch.end_no - CardBatch.start_no + 1).label("total"),
        func.sum(
            func.max(CardBatch.end_no - CardBatch.next_no + 1, 0)
        ).label("remaining"),
    ).filter(CardBatch.org_id == org_id).first()

    if card_stats.total:
        cards_total = int(card_stats.total)
        cards_remaining = int(card_stats.remaining or 0)
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
        "documents_pending_review": documents_pending_review,
        "documents_rejected": documents_rejected,
    }


@router.get("/members")
def list_org_members(
    request: Request,
    q: Optional[str] = None,
    status: Optional[str] = None,
    access: Optional[str] = None,
    source: Optional[str] = None,
    docs: Optional[str] = None,
    order: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Return a paginated list of members scoped to the org admin's organization."""
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    query = db.query(Member).filter(
        Member.org_id == admin.org_id,
        Member.deleted_at.is_(None),  # Exclude deleted
    )

    exclude_rejected = True
    if status in {"suspended", "rejected"}:
        exclude_rejected = False
    if exclude_rejected:
        query = query.filter(Member.status != MemberStatus.REJECTED)

    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(
                Member.first_name.ilike(pattern),
                Member.last_name.ilike(pattern),
                Member.email.ilike(pattern),
                Member.fiscal_code.ilike(pattern),
            )
        )

    if status:
        if status == "active":
            query = query.filter(Member.status == MemberStatus.ACTIVE)
        elif status == "pending":
            query = query.filter(
                Member.status.in_([
                    MemberStatus.PENDING_VERIFICATION,
                    MemberStatus.PENDING_DOCS,
                    MemberStatus.PENDING_CARDS,
                ])
            )
        elif status in {"suspended", "rejected"}:
            query = query.filter(Member.status == MemberStatus.REJECTED)
        else:
            query = query.filter(Member.status == status)

    if access in {"with", "without"}:
        if access == "with":
            query = query.filter(Member.password_hash.isnot(None))
        else:
            query = query.filter(Member.password_hash.is_(None))

    if source in {"manual", "online"}:
        if source == "manual":
            query = query.filter(Member.is_manual.is_(True))
        else:
            query = query.filter(or_(Member.is_manual.is_(False), Member.is_manual.is_(None)))

    if docs in {"pending", "rejected", "approved"}:
        pending_statuses = [DocStatus.PENDING.value, DocStatus.UPLOADED.value]
        if docs == "pending":
            query = query.filter(
                db.query(MemberDocument.id)
                .filter(
                    MemberDocument.member_id == Member.id,
                    MemberDocument.status.in_(pending_statuses),
                )
                .exists()
            )
        elif docs == "rejected":
            query = query.filter(
                db.query(MemberDocument.id)
                .filter(
                    MemberDocument.member_id == Member.id,
                    MemberDocument.status == DocStatus.REJECTED.value,
                )
                .exists()
            )
        else:
            has_docs = db.query(MemberDocument.id).filter(
                MemberDocument.member_id == Member.id
            ).exists()
            has_bad = db.query(MemberDocument.id).filter(
                MemberDocument.member_id == Member.id,
                MemberDocument.status.in_(pending_statuses + [DocStatus.REJECTED.value]),
            ).exists()
            query = query.filter(has_docs, ~has_bad)

    total = query.count()
    status_rank = case(
        (Member.status == MemberStatus.ACTIVE, 1),
        (Member.status == MemberStatus.PENDING_VERIFICATION, 2),
        (Member.status == MemberStatus.PENDING_DOCS, 3),
        (Member.status == MemberStatus.PENDING_CARDS, 4),
        (Member.status == MemberStatus.REJECTED, 5),
        else_=9,
    )

    order_key = (order or "joined_at_desc").lower()
    if order_key == "joined_at_asc":
        query = query.order_by(Member.joined_at.is_(None), Member.joined_at.asc())
    elif order_key == "last_name_asc":
        query = query.order_by(Member.last_name.asc(), Member.first_name.asc())
    elif order_key == "last_name_desc":
        query = query.order_by(Member.last_name.desc(), Member.first_name.desc())
    elif order_key == "status_asc":
        query = query.order_by(status_rank.asc(), Member.last_name.asc())
    elif order_key == "status_desc":
        query = query.order_by(status_rank.desc(), Member.last_name.asc())
    else:
        query = query.order_by(Member.joined_at.is_(None), Member.joined_at.desc())

    members = query.offset(offset).limit(min(limit, 100)).all()

    # Avoid N+1 for docs_count
    member_ids = [m.id for m in members]
    docs_counts = {}
    docs_statuses = {}
    if member_ids:
        rows = (
            db.query(MemberDocument.member_id, func.count(MemberDocument.id))
            .filter(MemberDocument.member_id.in_(member_ids))
            .group_by(MemberDocument.member_id)
            .all()
        )
        docs_counts = {r[0]: r[1] for r in rows}
        status_rows = (
            db.query(MemberDocument.member_id, MemberDocument.status)
            .filter(MemberDocument.member_id.in_(member_ids))
            .all()
        )
        status_map = {}
        for member_id, doc_status in status_rows:
            status_map.setdefault(member_id, []).append(doc_status)
        docs_statuses = {
            member_id: _document_status_from_statuses(status_map.get(member_id, []))
            for member_id in member_ids
        }

    payments_latest = {}
    if member_ids:
        pay_rows = (
            db.query(MemberPayment.member_id, func.max(MemberPayment.paid_at))
            .filter(MemberPayment.member_id.in_(member_ids))
            .group_by(MemberPayment.member_id)
            .all()
        )
        payments_latest = {r[0]: r[1] for r in pay_rows}

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
                "docs_count": docs_counts.get(m.id, 0),
                "document_status": docs_statuses.get(m.id, "not_provided"),
                "is_paid": m.id in payments_latest,
                "last_payment_at": payments_latest.get(m.id).isoformat() if payments_latest.get(m.id) else None,
                "has_access": bool(m.password_hash),
                "is_manual": bool(m.is_manual),
            }
            for m in members
        ],
        "total": total,
    }


@router.post("/members")
def create_org_member(
    request: Request,
    body: CreateMemberBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    first_name = body.first_name.strip()
    last_name = body.last_name.strip()
    if not first_name or not last_name:
        raise HTTPException(status_code=400, detail="Nome e cognome sono obbligatori.")

    email = body.email.strip() if body.email else None
    if email == "":
        email = None
    phone = body.phone.strip() if body.phone else None
    if phone == "":
        phone = None
    fiscal_code = body.fiscal_code.strip() if body.fiscal_code else None
    if fiscal_code == "":
        fiscal_code = None
    member_type = body.member_type.strip() if body.member_type else None
    if member_type == "":
        member_type = None
    internal_notes = body.internal_notes.strip() if body.internal_notes else None
    if internal_notes == "":
        internal_notes = None
    payment_method = _normalize_member_payment_method(body.payment_method)

    if email:
        existing = db.query(Member).filter(
            func.lower(Member.email) == email.lower(),
            Member.org_id == admin.org_id,
            Member.deleted_at.is_(None),
            Member.status != MemberStatus.REJECTED,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Esiste già un socio con questa email.")

    if body.send_access_email and not email:
        raise HTTPException(status_code=400, detail="L'email è obbligatoria per inviare l'accesso.")

    joined_at_date = body.joined_at or datetime.utcnow().date()
    joined_at = datetime.combine(joined_at_date, datetime.min.time())

    member = Member(
        org_id=admin.org_id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=phone,
        fiscal_code=fiscal_code,
        payment_method=payment_method,
        status=MemberStatus.PENDING_DOCS,
        joined_at=joined_at,
        member_type=member_type,
        internal_notes=internal_notes,
        is_manual=body.is_manual,
        signup_ip=get_client_ip(request),
        signup_user_agent=request.headers.get("user-agent"),
    )

    db.add(member)
    db.commit()
    db.refresh(member)

    email_sent = False
    access_email_sent_at = None
    if body.send_access_email and email:
        email_sent, access_email_sent_at = _send_member_magic_link(db, request, member)

    audit.log_operation(
        db,
        action="member.manual_create",
        entity_type="member",
        entity_id=member.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        metadata={
            "org_id": admin.org_id,
            "email_sent": email_sent,
            "is_manual": member.is_manual,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "id": member.id,
        "first_name": member.first_name,
        "last_name": member.last_name,
        "email": member.email,
        "phone": member.phone,
        "fiscal_code": member.fiscal_code,
        "payment_method": _serialize_member_payment_method(member.payment_method),
        "status": member.status.value if member.status else None,
        "joined_at": member.joined_at.isoformat() if member.joined_at else None,
        "member_type": member.member_type,
        "internal_notes": member.internal_notes,
        "is_manual": member.is_manual,
        "email_sent": email_sent,
        "access_email_sent_at": access_email_sent_at.isoformat() if access_email_sent_at else None,
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

    last_token = _get_last_access_email_token(db, member.id)
    last_access_email_at = last_token.created_at.isoformat() if last_token and last_token.created_at else None
    payments = (
        db.query(MemberPayment)
        .filter(MemberPayment.member_id == member.id)
        .order_by(MemberPayment.paid_at.desc(), MemberPayment.id.desc())
        .limit(5)
        .all()
    )
    doc_ids_sub = select(MemberDocument.id).where(MemberDocument.member_id == member.id)
    payment_ids_sub = select(MemberPayment.id).where(MemberPayment.member_id == member.id)

    activities = (
        db.query(OperationLog)
        .filter(
            or_(
                and_(OperationLog.entity_type == "member", OperationLog.entity_id == member.id),
                and_(OperationLog.entity_type == "member_document", OperationLog.entity_id.in_(doc_ids_sub)),
                and_(OperationLog.entity_type == "member_payment", OperationLog.entity_id.in_(payment_ids_sub)),
            )
        )
        .order_by(OperationLog.created_at.desc())
        .limit(20)
        .all()
    )
    admin_ids = {a.actor_admin_id for a in activities if a.actor_admin_id}
    admin_emails = {}
    if admin_ids:
        admin_rows = (
            db.query(AdminUser.id, AdminUser.email)
            .filter(
                AdminUser.id.in_(admin_ids),
                or_(
                    AdminUser.org_id == admin.org_id,
                    AdminUser.role == AdminRole.SUPER_ADMIN,
                ),
            )
            .all()
        )
        admin_emails = {row[0]: row[1] for row in admin_rows}
    document_status = _document_status_from_statuses([d.status for d in member.documents])

    return {
        "id": member.id,
        "first_name": member.first_name,
        "last_name": member.last_name,
        "email": member.email,
        "phone": member.phone,
        "fiscal_code": member.fiscal_code,
        "payment_method": _serialize_member_payment_method(member.payment_method),
        "status": member.status.value if member.status else None,
        "card_no": member.card_no,
        "joined_at": member.joined_at.isoformat() if member.joined_at else None,
        "member_type": member.member_type,
        "internal_notes": member.internal_notes,
        "is_manual": member.is_manual,
        "has_access": bool(member.password_hash),
        "last_access_email_at": last_access_email_at,
        "document_status": document_status,
        "documents": [
            {
                "id": d.id,
                "type": d.doc_type,
                "filename": d.original_filename,
                "mime_type": d.mime_type,
                "size_bytes": d.size_bytes,
                "rel_path": d.rel_path,
                "download_url": f"/api/org-admin/members/{member.id}/documents/{d.id}",
                "uploaded_at": d.uploaded_at.isoformat(),
                "status": d.status,
                "review_notes": d.review_notes,
                "rejection_note": d.rejection_note,
                "reviewed_at": d.reviewed_at.isoformat() if d.reviewed_at else None,
                "reviewed_by_admin_id": d.reviewed_by_admin_id or d.reviewed_by,
                "replaces_document_id": d.replaces_document_id,
            }
            for d in member.documents
        ],
        "payments": [
            {
                "id": p.id,
                "amount_cents": p.amount_cents,
                "amount": round(p.amount_cents / 100, 2),
                "method": p.method,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
                "notes": p.notes,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in payments
        ],
        "activities": [
            {
                "id": a.id,
                "action": a.action,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "actor_admin_id": a.actor_admin_id,
                "actor_admin_email": admin_emails.get(a.actor_admin_id) if a.actor_admin_id else None,
                "actor_member_id": a.actor_member_id,
                "actor_member_name": f"{member.first_name} {member.last_name}"
                if a.actor_member_id == member.id else None,
                "actor_role": a.actor_role,
                "entity_type": a.entity_type,
                "entity_id": a.entity_id,
                "metadata": a.metadata_json,
            }
            for a in activities
        ],
    }


@router.get("/members/{member_id}/documents/{doc_id}")
def download_member_document(
    request: Request,
    member_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    doc = db.query(MemberDocument).filter(MemberDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.member_id != member_id:
        raise HTTPException(status_code=404, detail="Document not found for this member")

    # Check ownership via member
    if doc.member.org_id != admin.org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    full_path = os.path.join(settings.UPLOAD_DIR, doc.rel_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File missing on disk")

    return FileResponse(
        full_path,
        filename=doc.original_filename,
        media_type=doc.mime_type or "application/octet-stream",
        content_disposition_type="attachment"
    )


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


class MemberDecisionBody(BaseModel):
    decision: str
    notes: Optional[str] = None


class ManualPaymentBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: float = Field(..., gt=0)
    method: str
    paid_at: date
    notes: Optional[str] = None


@router.post("/members/{member_id}/send-access")
def send_member_access(
    request: Request,
    member_id: int,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    member = db.query(Member).filter(
        Member.id == member_id,
        Member.org_id == admin.org_id,
        Member.deleted_at.is_(None),
        Member.status != MemberStatus.REJECTED,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if not member.email:
        raise HTTPException(status_code=400, detail="Inserisci email per inviare accesso.")

    if member.password_hash:
        raise HTTPException(status_code=400, detail="Accesso già attivo per questo socio.")

    last_token = _get_last_access_email_token(db, member.id)
    if last_token and last_token.created_at:
        elapsed = datetime.utcnow() - last_token.created_at
        if elapsed < timedelta(minutes=ACCESS_EMAIL_THROTTLE_MINUTES):
            remaining_seconds = int(timedelta(minutes=ACCESS_EMAIL_THROTTLE_MINUTES).total_seconds() - elapsed.total_seconds())
            remaining_minutes = max(1, int((remaining_seconds + 59) // 60))
            raise HTTPException(
                status_code=429,
                detail=f"Accesso inviato di recente. Riprova tra {remaining_minutes} minuti.",
            )

    email_sent, sent_at = _send_member_magic_link(db, request, member)

    audit.log_operation(
        db,
        action="member.access_sent",
        entity_type="member",
        entity_id=member.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        metadata={
            "org_id": admin.org_id,
            "email_sent": email_sent,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "ok": True,
        "email_sent": email_sent,
        "last_access_email_at": sent_at.isoformat() if sent_at else None,
    }


@router.post("/members/{member_id}/decision")
def member_decision(
    request: Request,
    member_id: int,
    body: MemberDecisionBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if body.decision not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="Invalid decision")

    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if member.org_id != admin.org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Apply decision
    card_exhausted = False
    if body.decision == "approve":
        if member.card_no is None:
            # Idempotency: do not reassign card numbers
            try:
                assigned = assign_next_card(db, member.org_id)
                member.card_no = assigned
                member.card_year = datetime.utcnow().year
            except HTTPException as exc:
                if exc.status_code == 409:
                    # Cards exhausted - member approved but waiting for card
                    card_exhausted = True
                else:
                    raise

        if card_exhausted:
            member.status = MemberStatus.PENDING_CARDS
        else:
            member.status = MemberStatus.ACTIVE
            if member.card_no is not None and member.card_year is None:
                member.card_year = datetime.utcnow().year
            # Trigger joined_at if not set (first activation)
            if not member.joined_at:
                member.joined_at = datetime.utcnow()
    else:
        member.status = MemberStatus.REJECTED

    member.decision_at = datetime.utcnow()
    member.decision_by_admin_id = admin.id
    member.decision_notes = body.notes

    db.commit()

    audit.log_operation(
        db,
        action="member.decision",
        entity_type="member",
        entity_id=member.id,
        actor_admin_id=admin.id,
        actor_role="org_admin",
        metadata={"decision": body.decision, "notes": body.notes, "new_status": member.status.value},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent")
    )
    db.commit()

    return {"ok": True, "status": member.status.value}


@router.post("/members/{member_id}/payments/manual")
def create_manual_payment(
    request: Request,
    member_id: int,
    body: ManualPaymentBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if member.org_id != admin.org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    method = body.method.strip().lower()
    if method not in {"contanti", "bonifico", "altro", "cash", "bank_transfer", "other"}:
        raise HTTPException(status_code=400, detail="Metodo di pagamento non valido.")

    amount_cents = int(round(body.amount * 100))
    if amount_cents <= 0:
        raise HTTPException(status_code=400, detail="Importo non valido.")

    paid_at = datetime.combine(body.paid_at, datetime.min.time())
    notes = body.notes.strip() if body.notes else None
    if notes == "":
        notes = None

    payment = MemberPayment(
        member_id=member.id,
        org_id=admin.org_id,
        admin_id=admin.id,
        amount_cents=amount_cents,
        method=method,
        paid_at=paid_at,
        notes=notes,
    )
    db.add(payment)

    card_assigned = False
    if member.status != MemberStatus.REJECTED:
        if member.card_no is None:
            try:
                member.card_no = assign_next_card(db, member.org_id)
                member.card_year = datetime.utcnow().year
                card_assigned = True
            except HTTPException as exc:
                if exc.status_code == 409:
                    member.status = MemberStatus.PENDING_CARDS
                else:
                    raise
        if member.card_no is not None:
            member.status = MemberStatus.ACTIVE
            if member.card_year is None:
                member.card_year = datetime.utcnow().year
            if not member.joined_at:
                member.joined_at = datetime.utcnow()
            if not member.decision_at:
                member.decision_at = datetime.utcnow()
                member.decision_by_admin_id = admin.id
                if not member.decision_notes:
                    member.decision_notes = "Pagamento manuale"

    db.commit()
    db.refresh(payment)

    audit.log_operation(
        db,
        action="member.payment.manual",
        entity_type="member_payment",
        entity_id=payment.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        metadata={
            "org_id": admin.org_id,
            "member_id": member.id,
            "amount_cents": amount_cents,
            "method": method,
            "paid_at": paid_at.isoformat(),
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "ok": True,
        "payment": {
            "id": payment.id,
            "amount_cents": payment.amount_cents,
            "amount": round(payment.amount_cents / 100, 2),
            "method": payment.method,
            "paid_at": payment.paid_at.isoformat() if payment.paid_at else None,
            "notes": payment.notes,
        },
        "member_status": member.status.value if member.status else None,
        "card_assigned": card_assigned,
    }


@router.delete("/members/{member_id}")
def delete_member(
    request: Request,
    member_id: int,
    db: Session = Depends(get_db),
):
    """
    Delete (soft-delete) a member.
    Revokes access immediately.
    """
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if member.org_id != admin.org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Soft delete
    member.deleted_at = datetime.utcnow()
    member.deleted_by_admin_id = admin.id

    # Also invalidate tokens?
    # Tokens table has expires_at. We could delete valid tokens.
    # But since authentication checks deleted_at, it might be redundant but safer.
    # Let's mark tokens as used or delete them.
    # db.query(Token).filter(Token.member_id == member.id).update({Token.used_at: datetime.utcnow()})
    # Simpler: just relying on deleted_at check in auth.

    db.commit()

    audit.log_operation(
        db,
        action="member.delete",
        entity_type="member",
        entity_id=member.id,
        actor_admin_id=admin.id,
        actor_role="org_admin",
        metadata={"email": member.email},
        ip=get_client_ip(request)
    )
    db.commit()

    return {"ok": True}


class ReviewBody(BaseModel):
    status: str
    notes: Optional[str] = None


class RejectBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rejection_note: str


def _apply_doc_review(
    db: Session,
    request: Request,
    admin: AdminUser,
    doc: MemberDocument,
    status: str,
    rejection_note: Optional[str] = None,
):
    doc.status = status
    doc.reviewed_at = datetime.utcnow()
    doc.reviewed_by = admin.id
    doc.reviewed_by_admin_id = admin.id
    if status == DocStatus.REJECTED.value:
        doc.rejection_note = rejection_note
        doc.review_notes = rejection_note
    else:
        doc.rejection_note = None
    db.commit()

    audit.log_operation(
        db,
        action="member_doc.review",
        entity_type="member_document",
        entity_id=doc.id,
        actor_admin_id=admin.id,
        actor_role="org_admin",
        metadata={"status": status, "rejection_note": rejection_note, "member_id": doc.member_id},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()


@router.post("/documents/{doc_id}/approve")
def approve_document(
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

    if doc.member.org_id != admin.org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    _apply_doc_review(db, request, admin, doc, DocStatus.APPROVED.value)

    return {"ok": True, "doc_status": doc.status, "member_status": doc.member.status.value}


@router.post("/documents/{doc_id}/reject")
def reject_document(
    request: Request,
    doc_id: int,
    body: RejectBody,
    db: Session = Depends(get_db),
):
    admin = _get_current_org_admin(request, db)
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")

    note = body.rejection_note.strip() if body.rejection_note else ""
    if not note:
        raise HTTPException(status_code=400, detail="La nota di rigetto è obbligatoria.")

    doc = db.query(MemberDocument).filter(MemberDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.member.org_id != admin.org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    _apply_doc_review(db, request, admin, doc, DocStatus.REJECTED.value, rejection_note=note)

    return {"ok": True, "doc_status": doc.status, "member_status": doc.member.status.value}


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

    if body.status == "rejected":
        note = body.notes.strip() if body.notes else ""
        if not note:
            raise HTTPException(status_code=400, detail="La nota di rigetto è obbligatoria.")
        _apply_doc_review(db, request, admin, doc, DocStatus.REJECTED.value, rejection_note=note)
    else:
        _apply_doc_review(db, request, admin, doc, DocStatus.APPROVED.value)

    return {"ok": True, "doc_status": doc.status, "member_status": doc.member.status.value}


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
