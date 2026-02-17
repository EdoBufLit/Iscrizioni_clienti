from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from sqlalchemy.orm import Session

from app import audit
from app.config import settings
from app.db import get_db
from app.email_templates.member_card_email import build_member_card_email
from app.models import (
    IntegrationApiKey,
    Member,
    MemberStatus,
    Organization,
    SignupSource,
    Token,
    TokenType,
)
from app.security import require_integration_key
from app.services.card import assign_next_card_with_batch
from app.services.card_verification import build_card_verification_token
from app.utils import generate_token, hash_token, send_email_html

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


class IssueMemberBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_slug: str | None = None
    org_id: int | None = Field(default=None, ge=1)
    external_customer_id: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    fiscal_code: str | None = None
    send_email: bool = True

    @model_validator(mode="after")
    def validate_target_org(self):
        if not self.org_slug and self.org_id is None:
            raise ValueError("org_slug or org_id is required")
        return self


class IssueMemberResponse(BaseModel):
    status: str
    member_id: int
    card_number: int
    card_year: int
    card_verification_url: str
    member_portal_login_hint: str


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None


def _resolve_organization(db: Session, body: IssueMemberBody) -> Organization:
    org = None
    if body.org_id is not None:
        org = db.query(Organization).filter(Organization.id == body.org_id).first()
    elif body.org_slug:
        org = db.query(Organization).filter(Organization.slug == body.org_slug).first()

    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if not org.is_active:
        raise HTTPException(status_code=400, detail="Organization is not active")
    return org


def _build_magic_link(db: Session, member_id: int, frontend_base: str) -> str:
    token_str = generate_token()
    token = Token(
        member_id=member_id,
        purpose=TokenType.LOGIN_MAGIC_LINK,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=settings.LOGIN_TOKEN_EXPIRE_MINUTES),
    )
    db.add(token)
    db.commit()
    return f"{frontend_base}/auth/verify?token={token_str}&role=member"


def _build_verification_url(member: Member, backend_base: str) -> str:
    if member.card_no is None or member.card_year is None:
        raise HTTPException(status_code=409, detail="Unable to issue card verification URL")

    token = build_card_verification_token(
        member_id=member.id,
        org_id=member.org_id,
        card_number=member.card_no,
        card_year=member.card_year,
    )
    return f"{backend_base}/api/cards/verify/{token}"


@router.post("/members/issue", response_model=IssueMemberResponse)
def issue_member(
    request: Request,
    body: IssueMemberBody,
    db: Session = Depends(get_db),
    integration_key: IntegrationApiKey = Depends(require_integration_key(scope="issue_member")),
):
    org = _resolve_organization(db, body)
    if integration_key.org_id != org.id:
        raise HTTPException(status_code=403, detail="Integration key is not allowed for this organization")

    now = datetime.utcnow()
    external_customer_id = body.external_customer_id.strip()
    email = body.email.strip().lower()
    first_name = _normalize_text(body.first_name)
    last_name = _normalize_text(body.last_name)
    phone = _normalize_text(body.phone)
    fiscal_code = _normalize_text(body.fiscal_code)
    signup_source = SignupSource.PIENISSIMO.value

    member = (
        db.query(Member)
        .filter(
            Member.org_id == org.id,
            Member.signup_source == signup_source,
            Member.external_customer_id == external_customer_id,
            Member.deleted_at.is_(None),
        )
        .order_by(Member.id.desc())
        .first()
    )

    if not member:
        member = Member(
            org_id=org.id,
            first_name=first_name or "",
            last_name=last_name or "",
            email=email,
            phone=phone,
            fiscal_code=fiscal_code,
            status=MemberStatus.ACTIVE,
            signup_source=signup_source,
            external_customer_id=external_customer_id,
            joined_at=now,
            decision_at=now,
            decision_notes="Auto-approved via integration",
            is_manual=False,
            signup_ip=request.client.host if request.client else None,
            signup_user_agent=request.headers.get("user-agent"),
        )
        db.add(member)
        db.commit()
        db.refresh(member)
    else:
        member.email = email
        if first_name is not None:
            member.first_name = first_name
        if last_name is not None:
            member.last_name = last_name
        if phone is not None:
            member.phone = phone
        if fiscal_code is not None:
            member.fiscal_code = fiscal_code
        member.signup_source = signup_source
        member.external_customer_id = external_customer_id
        member.status = MemberStatus.ACTIVE
        if not member.joined_at:
            member.joined_at = now
        member.decision_at = now
        member.decision_notes = "Auto-approved via integration"
        member.is_manual = False

    if member.card_no is None:
        assigned_card, batch_id = assign_next_card_with_batch(db, org.id)
        member.card_no = assigned_card
        member.batch_id = batch_id
        member.card_year = now.year
    elif member.card_year is None:
        member.card_year = now.year

    db.commit()
    db.refresh(member)

    backend_base = settings.BASE_URL.rstrip("/") if settings.BASE_URL else str(request.base_url).rstrip("/")
    frontend_base = settings.FRONTEND_URL.rstrip("/") if settings.FRONTEND_URL else backend_base
    verification_url = _build_verification_url(member, backend_base)

    login_hint = "email_skipped"
    email_sent = False
    if body.send_email:
        magic_link_url = _build_magic_link(db, member.id, frontend_base)
        logo_url = f"{backend_base}/assonam-logo.svg"
        member_full_name = f"{(member.first_name or '').strip()} {(member.last_name or '').strip()}".strip() or email
        text_body, html_body = build_member_card_email(
            member_full_name=member_full_name,
            organization_name=org.name,
            card_number=member.card_no,
            card_year=member.card_year,
            verification_url=verification_url,
            magic_link_url=magic_link_url,
            logo_url=logo_url,
        )
        email_sent = send_email_html(
            to_email=member.email,
            subject=f"La tua tessera socio {org.name}",
            text_body=text_body,
            html_body=html_body,
        )
        login_hint = "magic_link_sent" if email_sent else "magic_link_send_failed"

    audit.log_operation(
        db,
        action="integration_issue_member",
        entity_type="member",
        entity_id=member.id,
        metadata={
            "org_slug": org.slug,
            "external_customer_id": external_customer_id,
            "signup_source": signup_source,
            "integration_name": integration_key.name,
            "email_sent": email_sent,
        },
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return IssueMemberResponse(
        status="ok",
        member_id=member.id,
        card_number=member.card_no,
        card_year=member.card_year,
        card_verification_url=verification_url,
        member_portal_login_hint=login_hint,
    )
