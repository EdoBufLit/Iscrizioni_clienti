from __future__ import annotations

from datetime import datetime, timedelta
import logging
import os
from urllib.parse import quote_plus

from fastapi import Request
from sqlalchemy.orm import Session

from app.config import settings
from app.email_templates.member_card_email import build_member_card_email
from app.models import DocStatus, Member, MemberDocument, Organization, Token, TokenType
from app.services.card_verification import build_card_verification_token
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload
from app.services.member_activity import is_member_active
from app.services.org_branding import (
    resolve_assonam_logo_url,
    resolve_card_email_subject,
    resolve_card_logo_url,
    resolve_club_display_name,
)
from app.utils import generate_token, hash_token

logger = logging.getLogger(__name__)

_PUBLIC_MEMBER_CARD_VIEW_TEMPLATE = (
    "/associazioni/{org_slug}/tessera?card_token={card_token}&status={status}&wallet=1"
)


def _resolve_org_logo_disk_path(org: Organization | None) -> str | None:
    if org is None:
        return None
    if org.logo_path:
        candidate = os.path.join(settings.UPLOAD_DIR, org.logo_path)
        return candidate if os.path.exists(candidate) else None
    slug = (getattr(org, "slug", None) or "").strip().lower()
    if slug:
        static_candidate = os.path.normpath(
            os.path.join(os.path.dirname(__file__), "..", "static", "card-logos", f"{slug}.png")
        )
        return static_candidate if os.path.exists(static_candidate) else None
    return None


def _resolve_assonam_disk_path() -> str | None:
    static_dir = (settings.FRONTEND_STATIC_DIR or "").strip()
    if static_dir:
        candidate = os.path.join(static_dir, "logo-transparent.png")
        return candidate if os.path.exists(candidate) else None
    candidate = os.path.normpath(
        os.path.join(
            os.path.dirname(__file__),
            "..",
            "..",
            "frontend",
            "public",
            "logo-transparent.png",
        )
    )
    return candidate if os.path.exists(candidate) else None


def _build_backend_base_url(request: Request) -> str:
    configured_base = (settings.BASE_URL or "").strip().rstrip("/")
    if configured_base:
        return configured_base
    return str(request.base_url).rstrip("/")


def _build_frontend_base_url(request: Request) -> str:
    configured_frontend = (settings.FRONTEND_URL or "").strip().rstrip("/")
    if configured_frontend:
        return configured_frontend
    return _build_backend_base_url(request)


def _build_card_links(member: Member, backend_base_url: str) -> tuple[str, str, str]:
    if member.card_no is None or member.card_year is None:
        raise ValueError("Member has no active card assigned")
    token = build_card_verification_token(
        member_id=member.id,
        org_id=member.org_id,
        card_number=member.card_no,
        card_year=member.card_year,
    )
    verification_url = f"{backend_base_url}/api/cards/verify/{token}"
    download_url = f"{backend_base_url}/api/cards/{token}/download.pdf"
    return token, verification_url, download_url


def _build_frontend_card_page_url(
    *,
    frontend_base_url: str,
    org_slug: str,
    card_token: str,
    status: str = "issued",
) -> str:
    path = _PUBLIC_MEMBER_CARD_VIEW_TEMPLATE.format(
        org_slug=org_slug,
        card_token=card_token,
        status=status,
    )
    normalized_path = path if path.startswith("/") else f"/{path}"
    return f"{frontend_base_url.rstrip('/')}{normalized_path}"


def build_member_card_access_payload(
    *,
    member: Member,
    org: Organization,
    backend_base_url: str,
    frontend_base_url: str,
    card_page_status: str = "issued",
) -> dict[str, str]:
    token, verification_url, download_url = _build_card_links(member, backend_base_url)
    return {
        "card_verification_token": token,
        "card_verification_url": verification_url,
        "card_download_url": download_url,
        "card_wallet_apple_url": f"{backend_base_url}/api/cards/{token}/wallet/apple",
        "card_wallet_google_url": f"{backend_base_url}/api/cards/{token}/wallet/google",
        "active_card_page_url": _build_frontend_card_page_url(
            frontend_base_url=frontend_base_url,
            org_slug=org.slug,
            card_token=token,
            status=card_page_status,
        ),
    }


def _build_member_magic_link(db: Session, member_id: int, frontend_base_url: str) -> str:
    token_str = generate_token()
    token = Token(
        member_id=member_id,
        purpose=TokenType.LOGIN_MAGIC_LINK,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=settings.LOGIN_TOKEN_EXPIRE_MINUTES),
    )
    db.add(token)
    db.flush()
    return f"{frontend_base_url.rstrip('/')}/auth/verify?token={token_str}&role=member"


def _enqueue_member_card_ready_email(
    *,
    db: Session,
    member: Member,
    org: Organization,
    backend_base_url: str,
    frontend_base_url: str,
    email_type: str = "member_card_ready",
    dedupe_key: str | None = None,
    header_title: str = "La tua tessera ASSO.N.A.M. è pronta",
    header_subtitle: str = "Il tuo documento è stato verificato e la tua tessera socio è ora disponibile.",
    card_view_url_override: str | None = None,
) -> str | None:
    if not member.email:
        return None

    access_payload = build_member_card_access_payload(
        member=member,
        org=org,
        backend_base_url=backend_base_url,
        frontend_base_url=frontend_base_url,
    )
    verification_url = access_payload["card_verification_url"]
    download_url = access_payload["card_download_url"]
    club_display_name = resolve_club_display_name(org) or org.name
    assonam_logo_url = resolve_assonam_logo_url(
        frontend_base_url=frontend_base_url,
        backend_base_url=backend_base_url,
    )
    organization_logo_url = resolve_card_logo_url(org, base_url=backend_base_url)
    full_name = (
        f"{(member.first_name or '').strip()} {(member.last_name or '').strip()}".strip()
        or member.email
    )
    login_url = f"{frontend_base_url.rstrip('/')}/login"
    try:
        magic_link_url = _build_member_magic_link(db, member.id, frontend_base_url)
    except Exception:
        logger.exception("Unable to generate member magic link for card-ready email member_id=%s", member.id)
        magic_link_url = login_url

    if "token=" in magic_link_url and "role=member" in magic_link_url:
        wallet_add_url = f"{magic_link_url}&next=/wallet/google/add"
    else:
        wallet_add_url = f"{frontend_base_url.rstrip('/')}/wallet/google/add"
        if member.email:
            wallet_add_url = f"{wallet_add_url}?email={quote_plus(member.email)}"
    card_view_url = (
        (card_view_url_override or "").strip()
        or access_payload["active_card_page_url"]
        or f"{frontend_base_url.rstrip('/')}/dashboard"
    )
    statute_url = f"{frontend_base_url.rstrip('/')}/dashboard/documenti"

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
        logger.exception(
            "Unable to generate inline card image for member_id=%s org_id=%s",
            member.id,
            member.org_id,
        )
        card_image_bytes = None

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
        header_title=header_title,
        header_subtitle=header_subtitle,
        access_email_hint=member.email,
        google_wallet_add_url=wallet_add_url,
        card_view_url=card_view_url,
        statute_url=statute_url,
    )

    payload = build_email_payload(
        text_body=text_body,
        html_body=html_body,
        inline_images=inline_images if inline_images else None,
        sender=build_sender_payload(mode="association", association=org),
        meta={
            "member_id": member.id,
            "org_id": member.org_id,
            "mark_member_card_delivered": True,
        },
    )
    return enqueue_email(
        db,
        email_type=email_type,
        to_email=member.email,
        subject=resolve_card_email_subject(org),
        payload=payload,
        priority=5,
        dedupe_key=dedupe_key
        or f"member_card_ready:{member.id}:{member.card_year}:{member.card_no}",
    )


def maybe_send_member_card_ready_email(db: Session, request: Request, member_id: int) -> dict[str, object]:
    """Best-effort, idempotent delivery of the member card email.

    Used after document approvals and activation flows. Returns a small outcome payload
    so callers can log/debug without affecting endpoint responses.
    """

    member_query = db.query(Member).filter(Member.id == member_id)
    try:
        member_query = member_query.with_for_update()
    except Exception:
        # SQLite does not support FOR UPDATE; the normal query is still fine for tests/dev.
        pass

    member = member_query.first()
    if not member:
        return {"sent": False, "reason": "member_not_found"}

    org = member.organization
    if not org:
        return {"sent": False, "reason": "organization_missing"}

    delivered_marker = member.card_delivered_at or member.card_email_sent_at
    if delivered_marker is not None:
        return {"sent": False, "reason": "already_delivered"}

    if not is_member_active(member, now=datetime.utcnow()):
        return {"sent": False, "reason": "member_not_active"}

    if not member.email:
        return {"sent": False, "reason": "member_email_missing"}

    if member.card_no is None or member.card_year is None:
        return {"sent": False, "reason": "card_missing"}

    has_approved_doc = (
        db.query(MemberDocument.id)
        .filter(
            MemberDocument.member_id == member.id,
            MemberDocument.status == DocStatus.APPROVED.value,
        )
        .first()
        is not None
    )
    if not has_approved_doc:
        return {"sent": False, "reason": "no_approved_documents"}

    backend_base_url = _build_backend_base_url(request)
    frontend_base_url = _build_frontend_base_url(request)

    try:
        outbox_id = _enqueue_member_card_ready_email(
            db=db,
            member=member,
            org=org,
            backend_base_url=backend_base_url,
            frontend_base_url=frontend_base_url,
        )
    except Exception:
        logger.exception(
            "Failed to enqueue post-verification card email for member_id=%s org_id=%s",
            member.id,
            member.org_id,
        )
        return {"sent": False, "queued": False, "reason": "email_enqueue_failed"}

    if not outbox_id:
        logger.warning(
            "Card email enqueue returned empty outbox id for member_id=%s org_id=%s",
            member.id,
            member.org_id,
        )
        return {"sent": False, "queued": False, "reason": "email_enqueue_failed"}

    db.commit()
    return {"sent": False, "queued": True, "reason": "queued", "outbox_id": outbox_id}


def queue_member_card_email(
    db: Session,
    request: Request,
    member_id: int,
    *,
    require_active: bool = True,
    require_approved_document: bool = False,
    email_type: str = "member_card_manual_send",
    dedupe_key_prefix: str | None = None,
    card_view_url_override: str | None = None,
) -> dict[str, object]:
    member_query = db.query(Member).filter(Member.id == member_id)
    try:
        member_query = member_query.with_for_update()
    except Exception:
        pass

    member = member_query.first()
    if not member:
        return {"sent": False, "queued": False, "reason": "member_not_found"}

    org = member.organization
    if not org:
        return {"sent": False, "queued": False, "reason": "organization_missing"}

    if require_active and not is_member_active(member, now=datetime.utcnow()):
        return {"sent": False, "queued": False, "reason": "member_not_active"}

    if not member.email:
        return {"sent": False, "queued": False, "reason": "member_email_missing"}

    if member.card_no is None or member.card_year is None:
        return {"sent": False, "queued": False, "reason": "card_missing"}

    if require_approved_document:
        has_approved_doc = (
            db.query(MemberDocument.id)
            .filter(
                MemberDocument.member_id == member.id,
                MemberDocument.status == DocStatus.APPROVED.value,
            )
            .first()
            is not None
        )
        if not has_approved_doc:
            return {"sent": False, "queued": False, "reason": "no_approved_documents"}

    backend_base_url = _build_backend_base_url(request)
    frontend_base_url = _build_frontend_base_url(request)

    try:
        if dedupe_key_prefix:
            dedupe_key = f"{dedupe_key_prefix}:{member.id}:{member.card_year}:{member.card_no}"
        else:
            dedupe_key = (
                f"member_card_manual_send:{member.id}:{member.card_year}:{member.card_no}:{generate_token()}"
            )
        outbox_id = _enqueue_member_card_ready_email(
            db=db,
            member=member,
            org=org,
            backend_base_url=backend_base_url,
            frontend_base_url=frontend_base_url,
            email_type=email_type,
            dedupe_key=dedupe_key,
            header_title="La tua tessera ASSO.N.A.M. è disponibile",
            header_subtitle="Ti inviamo di nuovo il riepilogo della tua tessera socio e i link utili per consultarla o scaricarla.",
            card_view_url_override=card_view_url_override,
        )
    except Exception:
        logger.exception(
            "Failed to enqueue manual member card email for member_id=%s org_id=%s",
            member.id,
            member.org_id,
        )
        return {"sent": False, "queued": False, "reason": "email_enqueue_failed"}

    if not outbox_id:
        return {"sent": False, "queued": False, "reason": "email_enqueue_failed"}

    db.commit()
    return {"sent": False, "queued": True, "reason": "queued", "outbox_id": outbox_id}
