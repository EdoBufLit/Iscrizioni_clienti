from dataclasses import dataclass
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import audit
from app.config import settings
from app.email_templates.member_card_email import build_member_card_email
from app.models import Member, MemberStatus, Organization, SignupSource, Token, TokenType
from app.services.card import assign_next_card_with_batch
from app.services.card_verification import build_card_verification_token
from app.utils import generate_token, hash_token, send_email_html


@dataclass(frozen=True)
class IssueMemberCommand:
    org_id: int
    external_customer_id: str
    email: str
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    fiscal_code: str | None = None
    send_email: bool = True
    signup_source: str = SignupSource.PIENISSIMO.value
    integration_name: str | None = None
    request_ip: str | None = None
    request_user_agent: str | None = None
    backend_base_url: str | None = None
    frontend_base_url: str | None = None
    send_email_once: bool = False


@dataclass(frozen=True)
class IssueMemberResult:
    status: str
    member_id: int
    card_number: int
    card_year: int
    card_verification_url: str
    member_portal_login_hint: str
    email_sent: bool
    org_slug: str
    outcome: str


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None


def _resolve_active_organization(db: Session, org_id: int) -> Organization:
    org = db.query(Organization).filter(Organization.id == org_id).first()
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


def _cleanup_deleted_conflicts(
    db: Session,
    *,
    org_id: int,
    signup_source: str,
    external_customer_id: str,
    email: str,
) -> int:
    deleted_members = (
        db.query(Member)
        .filter(
            Member.org_id == org_id,
            Member.deleted_at.isnot(None),
            or_(
                and_(
                    Member.signup_source == signup_source,
                    Member.external_customer_id == external_customer_id,
                ),
                func.lower(Member.email) == email,
            ),
        )
        .all()
    )
    if not deleted_members:
        return 0

    for member in deleted_members:
        member.email = None
        member.phone = None
        member.fiscal_code = None
        member.password_hash = None
        member.external_customer_id = None
        member.card_no = None
        member.card_year = None
        member.batch_id = None
        member.signup_ip = None
        member.signup_user_agent = None
    db.commit()
    return len(deleted_members)


def issue_member_from_integration(db: Session, command: IssueMemberCommand) -> IssueMemberResult:
    org = _resolve_active_organization(db, command.org_id)

    external_customer_id = _normalize_text(command.external_customer_id)
    if not external_customer_id:
        raise HTTPException(status_code=400, detail="external_customer_id is required")

    normalized_email = _normalize_text(command.email)
    if not normalized_email:
        raise HTTPException(status_code=400, detail="email is required")
    email = normalized_email.lower()

    now = datetime.utcnow()
    first_name = _normalize_text(command.first_name)
    last_name = _normalize_text(command.last_name)
    phone = _normalize_text(command.phone)
    fiscal_code = _normalize_text(command.fiscal_code)
    signup_source = _normalize_text(command.signup_source) or SignupSource.PIENISSIMO.value

    _cleanup_deleted_conflicts(
        db,
        org_id=org.id,
        signup_source=signup_source,
        external_customer_id=external_customer_id,
        email=email,
    )

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

    outcome = "reused"
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
            signup_ip=command.request_ip,
            signup_user_agent=command.request_user_agent,
        )
        db.add(member)
        try:
            db.commit()
            db.refresh(member)
            outcome = "created"
        except IntegrityError:
            # Handle concurrent idempotent inserts gracefully.
            db.rollback()
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
                raise HTTPException(status_code=409, detail="socio già presente")
            outcome = "reused"
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

    fallback_backend_base = settings.BASE_URL.rstrip("/") if settings.BASE_URL else ""
    backend_base = (command.backend_base_url or fallback_backend_base).rstrip("/")
    if not backend_base:
        backend_base = "http://localhost:8000"

    configured_frontend = settings.FRONTEND_URL.rstrip("/") if settings.FRONTEND_URL else ""
    frontend_base = (command.frontend_base_url or configured_frontend or backend_base).rstrip("/")
    verification_url = _build_verification_url(member, backend_base)

    email_sent = False
    login_hint = "email_skipped"
    should_send_email = bool(command.send_email and member.email)
    if command.send_email_once and member.card_email_sent_at is not None:
        should_send_email = False
        login_hint = "magic_link_already_sent"

    if should_send_email:
        magic_link_url = _build_magic_link(db, member.id, frontend_base)
        # Prefer PNG for broad email-client compatibility (SVG is often blocked or not rendered).
        logo_url = f"{frontend_base}/logo-transparent.png"
        full_name = f"{(member.first_name or '').strip()} {(member.last_name or '').strip()}".strip() or email
        text_body, html_body = build_member_card_email(
            member_full_name=full_name,
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
        if email_sent:
            member.card_email_sent_at = datetime.utcnow()
            db.commit()
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
            "integration_name": command.integration_name,
            "email_sent": email_sent,
            "outcome": outcome,
        },
        ip=command.request_ip,
        user_agent=command.request_user_agent,
    )
    db.commit()

    return IssueMemberResult(
        status="ok",
        member_id=member.id,
        card_number=member.card_no,
        card_year=member.card_year,
        card_verification_url=verification_url,
        member_portal_login_hint=login_hint,
        email_sent=email_sent,
        org_slug=org.slug,
        outcome=outcome,
    )


def issue_member_from_ingest(
    db: Session,
    command: IssueMemberCommand,
) -> IssueMemberResult:
    return issue_member_from_integration(
        db,
        IssueMemberCommand(
            org_id=command.org_id,
            external_customer_id=command.external_customer_id,
            email=command.email,
            first_name=command.first_name,
            last_name=command.last_name,
            phone=command.phone,
            fiscal_code=command.fiscal_code,
            send_email=command.send_email,
            signup_source=command.signup_source,
            integration_name=command.integration_name,
            request_ip=command.request_ip,
            request_user_agent=command.request_user_agent,
            backend_base_url=command.backend_base_url,
            frontend_base_url=command.frontend_base_url,
            send_email_once=True,
        ),
    )
