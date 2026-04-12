from fastapi import APIRouter, Depends, HTTPException, Request, Form, status, UploadFile, File
from fastapi.responses import RedirectResponse, FileResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.db import get_db
from app.models import Member, Token, TokenType, MemberDocument, MemberStatus, PaymentMethod, Organization, AdminUser, AdminRole, DocStatus, SignupSource
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload
from app.utils import generate_token, hash_token, save_upload_file
from app.security import get_password_hash, verify_password
from app.config import settings
from app.middleware import auth_limiter, get_client_ip
from app.services.card_verification import build_card_verification_token
from app.services.google_wallet import (
    GoogleWalletApiError,
    GoogleWalletConfigError,
    generate_google_wallet_save_link_for_member,
)
from app.services.member_activity import get_member_inactive_reason, is_card_active, is_member_active
from app.services.member_cleanup import cleanup_deleted_member_traces, purge_deleted_members_permanently
from app.services.member_membership import (
    membership_type_label,
    resolve_member_membership_type,
    resolve_member_valid_until,
)
from app.services.org_branding import resolve_card_logo_url, resolve_club_display_name
from app import audit
import os
import logging
import hashlib

logger = logging.getLogger(__name__)

router = APIRouter()

_ALLOWED_PAYMENT_METHODS = {PaymentMethod.CASH.value, PaymentMethod.BONIFICO.value}
_ACCOUNT_NOT_ACTIVE_DETAIL = "account non attivo"


def _hash_email_for_log(email: str | None) -> str:
    normalized = (email or "").strip().lower()
    if not normalized:
        return "unknown"
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def _normalize_payment_method(raw_value: str | None) -> str | None:
    if raw_value is None:
        return None
    normalized = raw_value.strip().upper()
    if normalized == "":
        return None
    if normalized not in _ALLOWED_PAYMENT_METHODS:
        raise HTTPException(
            status_code=400,
            detail="Modalita di pagamento non valida. Valori ammessi: CASH, BONIFICO.",
        )
    return normalized


def _serialize_payment_method(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, PaymentMethod):
        return value.value
    text = str(value).strip()
    if not text:
        return None
    upper = text.upper()
    return upper if upper in _ALLOWED_PAYMENT_METHODS else text


def get_current_member(request: Request, db: Session):
    member_id = request.session.get("member_id")
    if not member_id:
        return None
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        return None
    if not is_member_active(member, now=datetime.utcnow()):
        return None

    return member


# ── Legacy HTML redirects ─────────────────────────────────────────

@router.get("/member/login")
def login_page(request: Request, org: str = None, db: Session = Depends(get_db)):
    return RedirectResponse(url="/login")


@router.get("/member/auth")
def auth_magic_link(request: Request, token: str, db: Session = Depends(get_db)):
    auth_limiter.check(get_client_ip(request))
    token_hash = hash_token(token)
    now = datetime.utcnow()

    # Atomic token consumption: UPDATE only if unused AND not expired
    # This prevents race conditions where two requests could use the same token
    from sqlalchemy import update

    result = db.execute(
        update(Token)
        .where(
            Token.token_hash == token_hash,
            Token.purpose == TokenType.LOGIN_MAGIC_LINK,
            Token.expires_at > now,
            Token.used_at.is_(None),  # Only consume if not yet used
        )
        .values(used_at=now)
    )
    db.commit()

    # If no rows updated, token was invalid, expired, or already used
    if result.rowcount == 0:
        return RedirectResponse(url="/login")

    # Now fetch the token to get member_id (safe since we just consumed it)
    token_entry = db.query(Token).filter(Token.token_hash == token_hash).first()
    if not token_entry:
        return RedirectResponse(url="/login")

    member = db.query(Member).filter(Member.id == token_entry.member_id).first()
    if not member:
        return RedirectResponse(url="/login")

    if not is_member_active(member, now=now):
        raise HTTPException(status_code=403, detail=_ACCOUNT_NOT_ACTIVE_DETAIL)
    request.session["member_id"] = token_entry.member_id
    audit.member_verified(member_id=token_entry.member_id, ip=get_client_ip(request))

    return RedirectResponse(url="/dashboard", status_code=status.HTTP_302_FOUND)


@router.get("/member/portal")
def member_portal(request: Request, db: Session = Depends(get_db)):
    member = get_current_member(request, db)
    if not member:
        if request.session.get("member_id"):
            request.session.clear()
        return RedirectResponse(url="/login")

    return RedirectResponse(url="/dashboard")


@router.get("/member/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/login")


# ── File download (non-HTML, kept as-is) ──────────────────────────

@router.get("/member/download/{doc_id}")
def download_document(request: Request, doc_id: int, db: Session = Depends(get_db)):
    member = get_current_member(request, db)
    if not member:
        raise HTTPException(status_code=401, detail="Not authenticated")

    doc = db.query(MemberDocument).filter(MemberDocument.id == doc_id, MemberDocument.member_id == member.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = os.path.join(settings.UPLOAD_DIR, doc.rel_path)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")

    return FileResponse(file_path, filename=doc.original_filename, media_type=doc.mime_type)


def _resolve_member_statute(member: Member) -> tuple[Organization, str]:
    org = member.organization
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if not org.statute_pdf_path:
        raise HTTPException(status_code=404, detail="Statute not available")

    full_path = os.path.join(settings.UPLOAD_DIR, org.statute_pdf_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Statute file not found")
    return org, full_path


@router.get("/api/me/organization/statute")
def get_my_organization_statute(request: Request, db: Session = Depends(get_db)):
    member = get_current_member(request, db)
    if not member:
        raise HTTPException(status_code=401, detail="Not authenticated")

    org = member.organization
    if not org or not org.statute_pdf_path:
        return {
            "available": False,
            "filename": None,
            "mime_type": None,
            "download_url": None,
        }

    full_path = os.path.join(settings.UPLOAD_DIR, org.statute_pdf_path)
    if not os.path.exists(full_path):
        logger.warning(
            "Statute metadata requested but file missing on disk for org_id=%s rel_path=%s",
            org.id,
            org.statute_pdf_path,
        )
        return {
            "available": False,
            "filename": None,
            "mime_type": None,
            "download_url": None,
        }

    return {
        "available": True,
        "filename": f"statuto_{org.slug}.pdf",
        "mime_type": "application/pdf",
        "download_url": "/api/me/organization/statute/download",
    }


@router.get("/api/me/organization/statute/download")
def download_my_organization_statute(request: Request, db: Session = Depends(get_db)):
    member = get_current_member(request, db)
    if not member:
        raise HTTPException(status_code=401, detail="Not authenticated")

    org, full_path = _resolve_member_statute(member)
    return FileResponse(
        full_path,
        media_type="application/pdf",
        filename=f"statuto_{org.slug}.pdf",
    )


@router.get("/api/me/documents/statute")
def download_my_statute_via_documents_alias(request: Request, db: Session = Depends(get_db)):
    return download_my_organization_statute(request, db)


@router.post("/api/me/wallet/google/save-link")
def create_google_wallet_save_link(request: Request, db: Session = Depends(get_db)):
    member = get_current_member(request, db)
    if not member:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if member.card_no is None or member.card_year is None:
        raise HTTPException(status_code=409, detail="Tessera non disponibile per Google Wallet")

    try:
        result = generate_google_wallet_save_link_for_member(member)
    except GoogleWalletConfigError as exc:
        logger.warning("Google Wallet config error for member_id=%s: %s", member.id, str(exc))
        member.google_wallet_last_error = str(exc)
        db.commit()
        raise HTTPException(status_code=500, detail=str(exc))
    except GoogleWalletApiError as exc:
        detail = f"Google Wallet API error ({exc.status_code})"
        logger.error(
            "Google Wallet API error for member_id=%s status=%s response=%s",
            member.id,
            exc.status_code,
            (exc.response_body or "")[:500],
        )
        member.google_wallet_last_error = f"{detail}: {str(exc)}"
        db.commit()
        raise HTTPException(status_code=502, detail=detail)
    except Exception:
        logger.exception("Unexpected Google Wallet error for member_id=%s", member.id)
        member.google_wallet_last_error = "Unexpected Google Wallet error"
        db.commit()
        raise HTTPException(status_code=500, detail="Errore interno Google Wallet")

    now = datetime.utcnow()
    member.google_wallet_class_id = result.class_id
    member.google_wallet_object_id = result.object_id
    member.google_wallet_last_error = None
    member.google_wallet_last_synced_at = now
    if member.google_wallet_added_at is None:
        member.google_wallet_added_at = now
    db.commit()

    return {
        "url": result.url,
        "classId": result.class_id,
        "objectId": result.object_id,
    }


@router.post("/api/member/documents/{doc_id}/resubmit")
async def resubmit_document(
    request: Request,
    doc_id: int,
    document: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    member = get_current_member(request, db)
    if not member:
        raise HTTPException(status_code=401, detail="Not authenticated")

    doc = db.query(MemberDocument).filter(
        MemberDocument.id == doc_id,
        MemberDocument.member_id == member.id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.status != DocStatus.REJECTED.value:
        raise HTTPException(status_code=400, detail="Il documento puo essere reinviato solo se rigettato.")

    sub_path = f"{member.org_id}/{member.id}"
    rel_path, size_bytes, sha256 = await save_upload_file(document, sub_directory=sub_path)

    new_doc = MemberDocument(
        member_id=member.id,
        doc_type=doc.doc_type,
        rel_path=rel_path,
        original_filename=document.filename,
        mime_type=document.content_type,
        size_bytes=size_bytes,
        sha256=sha256,
        status=DocStatus.PENDING.value,
        replaces_document_id=doc.id,
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)

    audit.log_operation(
        db,
        action="member.document.resubmit",
        entity_type="member_document",
        entity_id=new_doc.id,
        actor_member_id=member.id,
        metadata={"replaces_document_id": doc.id, "doc_type": doc.doc_type},
        ip=get_client_ip(request),
    )
    db.commit()

    return {"ok": True, "id": new_doc.id, "status": new_doc.status}


@router.get("/api/member/documents")
def list_member_documents(
    request: Request,
    db: Session = Depends(get_db),
):
    member = get_current_member(request, db)
    if not member:
        raise HTTPException(status_code=401, detail="Not authenticated")

    docs = (
        db.query(MemberDocument)
        .filter(MemberDocument.member_id == member.id)
        .order_by(MemberDocument.uploaded_at.desc(), MemberDocument.id.desc())
        .all()
    )

    return {
        "required_types": ["identity", "fiscal_code"],
        "items": [
            {
                "id": d.id,
                "type": d.doc_type,
                "filename": d.original_filename,
                "mime_type": d.mime_type,
                "size_bytes": d.size_bytes,
                "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
                "status": d.status,
                "rejection_note": d.rejection_note,
                "reviewed_at": d.reviewed_at.isoformat() if d.reviewed_at else None,
                "replaces_document_id": d.replaces_document_id,
                "download_url": f"/member/download/{d.id}",
            }
            for d in docs
        ],
    }


# ── JSON API ──────────────────────────────────────────────────────

from sqlalchemy import func

@router.post("/api/auth/login")
def api_auth_login(request: Request, email: str = Form(...), password: str = Form(default=""), db: Session = Depends(get_db)):
    """
    Login: if password is provided, try password auth. Otherwise send a magic-link.
    Unknown emails keep anti-enumeration behavior; known non-active members get 403.
    """
    auth_limiter.check(get_client_ip(request))

    email_norm = email.strip().lower()
    now = datetime.utcnow()
    matching_members = (
        db.query(Member)
        .filter(func.lower(Member.email) == email_norm)
        .order_by(Member.id.desc())
        .all()
    )

    member = next(
        (candidate for candidate in matching_members if is_member_active(candidate, now=now)),
        None,
    )
    if member is None and matching_members:
        inactive_reason = get_member_inactive_reason(matching_members[0], now=now)
        logger.info(
            "Blocked login for non-active member email_hash=%s reason=%s",
            _hash_email_for_log(email_norm),
            inactive_reason,
        )
        raise HTTPException(status_code=403, detail=_ACCOUNT_NOT_ACTIVE_DETAIL)

    # Password-based login
    if password and member and member.password_hash and verify_password(password, member.password_hash):
        request.session["member_id"] = member.id
        audit.member_verified(member_id=member.id, ip=get_client_ip(request))
        return {"status": "ok", "message": "Login successful.", "authenticated": True}

    # Magic-link fallback
    if member:
        token_str = generate_token()
        token = Token(
            member_id=member.id,
            purpose=TokenType.LOGIN_MAGIC_LINK,
            token_hash=hash_token(token_str),
            expires_at=now + timedelta(minutes=settings.LOGIN_TOKEN_EXPIRE_MINUTES)
        )
        db.add(token)
        db.flush()

        frontend_base = settings.FRONTEND_URL.rstrip("/")
        if not frontend_base:
            frontend_base = str(request.base_url).rstrip("/")

        link = f"{frontend_base}/auth/verify?token={token_str}&role=member"
        logger.info("Generated member magic link: %s", link.replace(token_str, "***"))

        enqueue_email(
            db,
            email_type="member_magic_link",
            to_email=email,
            subject="Accesso Area Riservata - ASSO.N.A.M.",
            payload=build_email_payload(
                text_body=(
                    f"Clicca qui per accedere alla tua area riservata: {link}\n\n"
                    f"Il link scade tra {settings.LOGIN_TOKEN_EXPIRE_MINUTES} minuti."
                ),
                sender=build_sender_payload(
                    mode="association",
                    association=member.organization,
                ),
                meta={
                    "member_id": member.id,
                    "token_purpose": TokenType.LOGIN_MAGIC_LINK.value,
                },
            ),
            priority=1,
        )
        db.commit()

    audit.member_magic_link_requested(email=email, ip=get_client_ip(request))
    return {"status": "ok", "message": "If an account exists, a magic link has been sent."}


@router.post("/api/auth/register")
def api_auth_register(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    first_name: str = Form(...),
    last_name: str = Form(...),
    phone: str = Form(default=""),
    fiscal_code: str = Form(default=""),
    payment_method: str = Form(default=""),
    org_slug: str = Form(default=""),
    db: Session = Depends(get_db),
):
    """
    Register a new member with password auth.
    Requires a valid org_slug — public registration without an organization is disabled.
    """
    from fastapi import HTTPException

    auth_limiter.check(get_client_ip(request))

    # Registration requires a valid organization
    if not org_slug:
        raise HTTPException(status_code=404, detail="Not found")

    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org:
        raise HTTPException(status_code=404, detail="Not found")

    normalized_payment_method = _normalize_payment_method(payment_method)
    email_norm = email.strip().lower()
    fiscal_code_norm = fiscal_code.strip().upper() if fiscal_code else None

    purged = purge_deleted_members_permanently(
        db,
        org_id=org.id,
        email=email_norm,
        fiscal_code=fiscal_code_norm,
    )
    if purged:
        db.commit()

    cleaned = cleanup_deleted_member_traces(
        db,
        org_id=org.id,
        email=email_norm,
        fiscal_code=fiscal_code_norm,
    )
    if cleaned:
        db.commit()

    # Check if member already exists
    existing = (
        db.query(Member)
        .filter(
            Member.org_id == org.id,
            func.lower(Member.email) == email_norm,
            Member.deleted_at.is_(None),
        )
        .order_by(Member.id.desc())
        .first()
    )
    if existing:
        # If existing but no password, allow setting password
        if not existing.password_hash:
            existing.password_hash = get_password_hash(password)
            if not existing.signup_source:
                existing.signup_source = SignupSource.ASSONAM_FORM.value
            if normalized_payment_method is not None:
                existing.payment_method = normalized_payment_method
            db.commit()
            if is_member_active(existing, now=datetime.utcnow()):
                request.session["member_id"] = existing.id
                return {"status": "ok", "message": "Account attivato.", "authenticated": True}
            return {"status": "ok", "message": "Registrazione ricevuta.", "authenticated": False}
        # Already registered — don't reveal
        return {"status": "ok", "message": "Registrazione ricevuta."}

    member = Member(
        org_id=org.id,
        first_name=first_name,
        last_name=last_name,
        email=email_norm,
        phone=phone,
        fiscal_code=fiscal_code,
        payment_method=normalized_payment_method,
        password_hash=get_password_hash(password),
        status=MemberStatus.PENDING_DOCS,
        signup_source=SignupSource.ASSONAM_FORM.value,
        signup_ip=request.client.host if request.client else "unknown",
        signup_user_agent=request.headers.get("user-agent"),
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    if is_member_active(member, now=datetime.utcnow()):
        request.session["member_id"] = member.id
        audit.member_verified(member_id=member.id, ip=get_client_ip(request))
        return {"status": "ok", "message": "Registrazione completata.", "authenticated": True}

    return {"status": "ok", "message": "Registrazione ricevuta.", "authenticated": False}


@router.post("/api/auth/logout")
def api_auth_logout(request: Request):
    request.session.clear()
    return {"status": "ok"}


@router.post("/api/auth/change-password")
def api_auth_change_password(
    request: Request,
    new_password: str = Form(...),
    db: Session = Depends(get_db),
):
    """Set or change password for the authenticated member."""
    member = get_current_member(request, db)
    if not member:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="La password deve avere almeno 8 caratteri.")
    member.password_hash = get_password_hash(new_password)
    db.commit()
    return {"status": "ok", "message": "Password aggiornata."}


@router.get("/api/auth/me")
def api_auth_me(request: Request, db: Session = Depends(get_db)):
    member = get_current_member(request, db)
    if not member:
        raise HTTPException(status_code=401, detail="Not authenticated")

    org = member.organization
    status_raw = member.status.value if isinstance(member.status, MemberStatus) else (str(member.status) if member.status is not None else "")
    card_year = member.card_year

    if member.card_no is not None and card_year is None:
        # Backfill legacy rows that predate card_year.
        card_year = member.joined_at.year if member.joined_at else datetime.utcnow().year
        member.card_year = card_year
        db.commit()

    backend_base = settings.BASE_URL.rstrip("/") if settings.BASE_URL else str(request.base_url).rstrip("/")
    verification_url = None
    if member.card_no is not None and card_year is not None:
        token = build_card_verification_token(
            member_id=member.id,
            org_id=member.org_id,
            card_number=member.card_no,
            card_year=card_year,
        )
        verification_url = f"{backend_base}/api/cards/verify/{token}"

    card_status = "attiva" if is_card_active(member, now=datetime.utcnow()) else "non_attiva"
    organization_club_display_name = resolve_club_display_name(org) if org else None
    organization_card_logo_url = resolve_card_logo_url(org, base_url=backend_base) if org else None
    membership_type = resolve_member_membership_type(member)
    valid_until = resolve_member_valid_until(member)

    return {
        "id": member.id,
        "first_name": member.first_name,
        "last_name": member.last_name,
        "email": member.email,
        "phone": member.phone,
        "fiscal_code": member.fiscal_code,
        "payment_method": _serialize_payment_method(member.payment_method),
        "status": status_raw,
        "card_no": member.card_no,
        "card_status": card_status,
        "card_year": card_year,
        "membership_type": membership_type,
        "membership_type_label": membership_type_label(membership_type),
        "valid_until": valid_until.isoformat() if valid_until else None,
        "card_verification_url": verification_url,
        "card": {
            "number": member.card_no,
            "status": card_status,
            "year": card_year,
            "verification_url": verification_url,
        },
        "joined_at": member.joined_at.isoformat() if member.joined_at else None,
        "organization": {
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "club_display_name": organization_club_display_name,
            "card_logo_url": organization_card_logo_url,
        } if org else None,
    }


@router.get("/api/auth/whoami")
def api_auth_whoami(request: Request, db: Session = Depends(get_db)):
    """Unified session check. Returns authenticated role and redirect target."""
    # 1. Super admin (highest priority)
    admin_id = request.session.get("admin_id")
    if admin_id:
        admin = db.query(AdminUser).filter(
            AdminUser.id == admin_id,
            AdminUser.role == AdminRole.SUPER_ADMIN,
        ).first()
        if admin:
            return {"authenticated": True, "role": "super_admin", "redirect_to": "/super-admin/org-admins"}

    # 2. Org admin
    org_admin_id = request.session.get("org_admin_id")
    if org_admin_id:
        admin = db.query(AdminUser).filter(
            AdminUser.id == org_admin_id,
            AdminUser.role == AdminRole.ORG_ADMIN,
            AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None),
        ).first()
        if admin:
            return {"authenticated": True, "role": "org_admin", "redirect_to": "/org-admin"}

    # 3. Member
    member_id = request.session.get("member_id")
    if member_id:
        member = db.query(Member).filter(Member.id == member_id).first()
        if is_member_active(member, now=datetime.utcnow()):
            return {"authenticated": True, "role": "member", "redirect_to": "/dashboard"}

    return {"authenticated": False}
