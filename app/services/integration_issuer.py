from dataclasses import dataclass
from datetime import datetime, timedelta
import hashlib
import logging
from urllib.parse import quote_plus

from fastapi import HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import os

from app import audit
from app.config import settings
from app.email_templates.member_card_email import build_member_card_email
from app.models import (
    Member,
    MemberStatus,
    Organization,
    SignupSource,
    Token,
    TokenType,
)
from app.services.card_allocation import allocate_next_card, release_card_number
from app.services.card_verification import build_card_verification_token
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload
from app.services.org_branding import (
    resolve_assonam_logo_url,
    resolve_card_email_subject,
    resolve_card_logo_url,
    resolve_club_display_name,
)
from app.utils import generate_token, hash_token


logger = logging.getLogger(__name__)


def _resolve_org_logo_disk_path(org: Organization) -> str | None:
    if org.logo_path:
        p = os.path.join(settings.UPLOAD_DIR, org.logo_path)
        return p if os.path.exists(p) else None
    slug = (getattr(org, "slug", None) or "").strip().lower()
    if slug:
        static_p = os.path.normpath(
            os.path.join(
                os.path.dirname(__file__), "..", "static", "card-logos", f"{slug}.png"
            )
        )
        return static_p if os.path.exists(static_p) else None
    return None


def _resolve_assonam_disk_path() -> str | None:
    static_dir = (settings.FRONTEND_STATIC_DIR or "").strip()
    if static_dir:
        p = os.path.join(static_dir, "logo-transparent.png")
        return p if os.path.exists(p) else None
    rel = os.path.normpath(
        os.path.join(
            os.path.dirname(__file__),
            "..",
            "..",
            "frontend",
            "public",
            "logo-transparent.png",
        )
    )
    return rel if os.path.exists(rel) else None


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
    request_id: str | None = None
    client_version: str | None = None
    backend_base_url: str | None = None
    frontend_base_url: str | None = None
    send_email_once: bool = False
    allow_deleted_reissue: bool = True
    decision_note: str | None = None
    card_view_url_template: str | None = None


@dataclass(frozen=True)
class IssueMemberResult:
    status: str
    member_id: int
    card_number: int
    card_year: int
    card_verification_token: str
    card_verification_url: str
    card_download_url: str
    card_wallet_apple_url: str | None
    card_wallet_google_url: str | None
    wallet_enabled: bool
    member_portal_login_hint: str
    email_sent: bool
    email_status: str
    org_slug: str
    outcome: str
    card_page_url: str | None


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
        expires_at=datetime.utcnow()
        + timedelta(minutes=settings.LOGIN_TOKEN_EXPIRE_MINUTES),
    )
    db.add(token)
    db.flush()
    return f"{frontend_base}/auth/verify?token={token_str}&role=member"


def _build_card_links(
    member: Member, backend_base: str
) -> tuple[str, str, str, str, str]:
    if member.card_no is None or member.card_year is None:
        raise HTTPException(
            status_code=409, detail="Unable to issue card verification URL"
        )

    token = build_card_verification_token(
        member_id=member.id,
        org_id=member.org_id,
        card_number=member.card_no,
        card_year=member.card_year,
    )
    verification_url = f"{backend_base}/api/cards/verify/{token}"
    download_url = f"{backend_base}/api/cards/{token}/download.pdf"
    wallet_apple_url = f"{backend_base}/api/cards/{token}/wallet/apple"
    wallet_google_url = f"{backend_base}/api/cards/{token}/wallet/google"
    return token, verification_url, download_url, wallet_apple_url, wallet_google_url


def _build_frontend_card_page_url(
    *,
    frontend_base: str,
    card_view_url_template: str | None,
    org_slug: str,
    card_token: str,
    status: str = "issued",
) -> str | None:
    template = _normalize_text(card_view_url_template)
    if not template:
        return None

    path = template.format(
        org_slug=org_slug,
        card_token=card_token,
        status=status,
    )
    if path.startswith("http://") or path.startswith("https://"):
        return path
    normalized_path = path if path.startswith("/") else f"/{path}"
    return f"{frontend_base.rstrip('/')}{normalized_path}"


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
        release_card_number(
            db,
            org_id=org_id,
            year=member.card_year,
            card_no=member.card_no,
            batch_id=member.batch_id,
        )
        member.email = None
        member.phone = None
        member.fiscal_code = None
        member.birth_date = None
        member.birth_place = None
        member.birth_place_code = None
        member.gender = None
        member.password_hash = None
        member.external_customer_id = None
        member.card_no = None
        member.card_year = None
        member.batch_id = None
        member.numbering_scope_id = None
        member.signup_ip = None
        member.signup_user_agent = None
    db.commit()
    return len(deleted_members)


def _has_deleted_member_email_conflict(
    db: Session,
    *,
    org_id: int,
    email: str,
) -> bool:
    deleted_member = (
        db.query(Member.id)
        .filter(
            Member.org_id == org_id,
            Member.deleted_at.isnot(None),
            func.lower(Member.email) == email,
        )
        .order_by(Member.id.desc())
        .first()
    )
    return deleted_member is not None


def issue_member_from_integration(
    db: Session, command: IssueMemberCommand
) -> IssueMemberResult:
    request_id = _normalize_text(command.request_id) or "-"
    client_version = _normalize_text(command.client_version) or "-"
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
    signup_source = (
        _normalize_text(command.signup_source) or SignupSource.PIENISSIMO.value
    )
    decision_note = (
        _normalize_text(command.decision_note) or "Auto-approved via integration"
    )
    logger.info(
        "integration_issue_start request_id=%s git_sha=%s org_id=%s org_slug=%s email=%s signup_source=%s integration_name=%s client_version=%s",
        request_id,
        settings.GIT_SHA or "unknown",
        org.id,
        org.slug,
        email,
        signup_source,
        command.integration_name,
        client_version,
    )

    if command.allow_deleted_reissue:
        _cleanup_deleted_conflicts(
            db,
            org_id=org.id,
            signup_source=signup_source,
            external_customer_id=external_customer_id,
            email=email,
        )
    elif _has_deleted_member_email_conflict(db, org_id=org.id, email=email):
        raise HTTPException(
            status_code=409,
            detail="socio eliminato: contatta l'associazione",
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
            decision_notes=decision_note,
            is_manual=False,
            signup_ip=command.request_ip,
            signup_user_agent=command.request_user_agent,
        )
        db.add(member)
        try:
            logger.info(
                "integration_issue_commit_before request_id=%s phase=create_member org_id=%s email=%s",
                request_id,
                org.id,
                email,
            )
            db.commit()
            logger.info(
                "integration_issue_commit_after request_id=%s phase=create_member org_id=%s",
                request_id,
                org.id,
            )
            db.refresh(member)
            outcome = "created"
        except IntegrityError:
            # Handle concurrent idempotent inserts gracefully.
            logger.warning(
                "integration_issue_integrity_error request_id=%s phase=create_member rollback=1",
                request_id,
                exc_info=True,
            )
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
        member.decision_notes = decision_note
        member.is_manual = False

    issued_new_card = False
    member_card_year = None
    if member.card_year is not None:
        try:
            member_card_year = int(member.card_year)
        except (TypeError, ValueError):
            member_card_year = None

    needs_new_card = (
        member.card_no is None
        or member_card_year is None
        or member_card_year < now.year
    )
    if needs_new_card:
        allocation = allocate_next_card(
            db,
            org_id=org.id,
            year=now.year,
        )
        member.card_no = allocation.card_no
        member.batch_id = allocation.batch_id
        member.card_year = allocation.year
        member.numbering_scope_id = allocation.numbering_scope_id
        member.card_email_sent_at = None
        member.card_delivered_at = None
        issued_new_card = True
        if outcome == "reused":
            outcome = "reissued"

    logger.info(
        "integration_issue_flush_before request_id=%s phase=upsert_member_and_card member_id=%s org_id=%s outcome=%s",
        request_id,
        member.id,
        org.id,
        outcome,
    )
    db.flush()
    logger.info(
        "integration_issue_flush_after request_id=%s phase=upsert_member_and_card member_id=%s org_id=%s outcome=%s",
        request_id,
        member.id,
        org.id,
        outcome,
    )

    fallback_backend_base = settings.BASE_URL.rstrip("/") if settings.BASE_URL else ""
    backend_base = (command.backend_base_url or fallback_backend_base).rstrip("/")
    if not backend_base:
        backend_base = "http://localhost:8000"

    configured_frontend = (
        settings.FRONTEND_URL.rstrip("/") if settings.FRONTEND_URL else ""
    )
    frontend_base = (
        command.frontend_base_url or configured_frontend or backend_base
    ).rstrip("/")
    (
        verification_token,
        verification_url,
        download_url,
        wallet_apple_url,
        wallet_google_url,
    ) = _build_card_links(member, backend_base)
    card_page_url = _build_frontend_card_page_url(
        frontend_base=frontend_base,
        card_view_url_template=command.card_view_url_template,
        org_slug=org.slug,
        card_token=verification_token,
        status="active_card" if outcome == "reused" else "issued",
    )
    wallet_enabled = False

    email_sent = False
    email_status = "skipped"
    login_hint = "email_skipped"
    should_send_email = bool(command.send_email and member.email)
    delivered_marker = member.card_delivered_at or member.card_email_sent_at
    if command.send_email_once and delivered_marker is not None and not issued_new_card:
        should_send_email = False
        login_hint = "magic_link_already_sent"
        email_status = "skipped"
        logger.info(
            "integration_issue_email_skipped request_id=%s template=%s member_id=%s reason=%s",
            request_id,
            "card_active",
            member.id,
            "send_email_once_already_sent",
        )

    if should_send_email:
        logger.info(
            "integration_issue_email_before_send request_id=%s template=%s member_id=%s org_id=%s email=%s outcome=%s",
            request_id,
            "card_active",
            member.id,
            org.id,
            member.email,
            outcome,
        )
        magic_link_url = _build_magic_link(db, member.id, frontend_base)
        assonam_logo_url = resolve_assonam_logo_url(
            frontend_base_url=frontend_base,
            backend_base_url=backend_base,
        )
        organization_logo_url = resolve_card_logo_url(org, base_url=backend_base)
        club_display_name = resolve_club_display_name(org) or org.name
        subject = resolve_card_email_subject(org)
        full_name = (
            f"{(member.first_name or '').strip()} {(member.last_name or '').strip()}".strip()
            or email
        )
        if "token=" in magic_link_url and "role=member" in magic_link_url:
            wallet_add_url = f"{magic_link_url}&next=/wallet/google/add"
        else:
            wallet_add_url = f"{frontend_base.rstrip('/')}/wallet/google/add"
            if member.email:
                wallet_add_url = f"{wallet_add_url}?email={quote_plus(member.email)}"
        card_view_url = card_page_url or magic_link_url
        statute_url = f"{frontend_base.rstrip('/')}/dashboard/documenti"

        # Generate card PNG for inline email embed (CID)
        card_image_bytes: bytes | None = None
        try:
            from app.services.card_image import generate_card_image_bytes

            card_image_bytes = generate_card_image_bytes(
                member_full_name=full_name,
                organization_name=org.name,
                club_display_name=club_display_name,
                organization_slug=org.slug,
                card_number=member.card_no,
                card_year=member.card_year,
                card_status="attiva",
                org_logo_path=_resolve_org_logo_disk_path(org),
                assonam_logo_path=_resolve_assonam_disk_path(),
            )
        except Exception:
            card_image_bytes = None  # fallback: email senza immagine inline

        card_image_cid: str | None = None
        inline_images: list[dict] = []
        if card_image_bytes:
            card_image_cid = "card_front@assonam"
            inline_images.append(
                {
                    "cid": card_image_cid,
                    "content_type": "image/png",
                    "data": card_image_bytes,
                    "filename": "tessera.png",
                }
            )

        text_body, html_body = build_member_card_email(
            member_full_name=full_name,
            organization_name=org.name,
            club_display_name=club_display_name,
            organization_slug=org.slug,
            card_number=member.card_no,
            card_year=member.card_year,
            verification_url=verification_url,
            download_url=download_url,
            magic_link_url=magic_link_url,
            assonam_logo_url=assonam_logo_url,
            organization_logo_url=organization_logo_url,
            card_image_cid=card_image_cid,
            access_email_hint=member.email,
            google_wallet_add_url=wallet_add_url,
            card_view_url=card_view_url,
            statute_url=statute_url,
        )
        outbox_id = enqueue_email(
            db,
            email_type="member_card_active",
            to_email=member.email,
            subject=subject,
            payload=build_email_payload(
                text_body=text_body,
                html_body=html_body,
                inline_images=inline_images if inline_images else None,
                sender=build_sender_payload(mode="association", association=org),
                meta={
                    "member_id": member.id,
                    "org_id": member.org_id,
                    "mark_member_card_delivered": True,
                },
            ),
            priority=5,
            dedupe_key=f"member_card_active:{member.id}:{member.card_year}:{member.card_no}",
        )
        email_status = "queued"
        logger.info(
            "integration_issue_email_after_enqueue request_id=%s template=%s member_id=%s outbox_id=%s",
            request_id,
            "card_active",
            member.id,
            outbox_id,
        )
        login_hint = "magic_link_queued"
    else:
        logger.info(
            "integration_issue_email_skipped request_id=%s template=%s member_id=%s reason=%s",
            request_id,
            "card_active",
            member.id,
            "disabled_or_missing_email",
        )

    audit.log_operation(
        db,
        action="integration_issue_member",
        entity_type="member",
        entity_id=member.id,
        metadata={
            "org_slug": org.slug,
            "external_customer_id_hash": hashlib.sha256(
                external_customer_id.lower().encode("utf-8")
            ).hexdigest()[:16],
            "signup_source": signup_source,
            "integration_name": command.integration_name,
            "request_id": request_id,
            "client_version": client_version,
            "email_sent": email_sent,
            "email_status": email_status,
            "outcome": outcome,
            "issued_new_card": issued_new_card,
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
        card_verification_token=verification_token,
        card_verification_url=verification_url,
        card_download_url=download_url,
        card_wallet_apple_url=wallet_apple_url,
        card_wallet_google_url=wallet_google_url,
        wallet_enabled=wallet_enabled,
        member_portal_login_hint=login_hint,
        email_sent=email_sent,
        email_status=email_status,
        org_slug=org.slug,
        outcome=outcome,
        card_page_url=card_page_url,
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
            request_id=command.request_id,
            client_version=command.client_version,
            backend_base_url=command.backend_base_url,
            frontend_base_url=command.frontend_base_url,
            send_email_once=True,
            allow_deleted_reissue=False,
            decision_note=command.decision_note,
            card_view_url_template=command.card_view_url_template,
        ),
    )
