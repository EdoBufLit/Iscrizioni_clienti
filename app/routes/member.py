from fastapi import APIRouter, Depends, HTTPException, Request, Form, status, UploadFile, File
from fastapi.responses import RedirectResponse, FileResponse
from pydantic import BaseModel, EmailStr, Field, TypeAdapter
from sqlalchemy import func, update
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timedelta
from typing import Literal
from app.db import get_db
from app.models import Booking, Member, Token, TokenType, MemberDocument, MemberStatus, PaymentMethod, Organization, AdminUser, AdminRole, DocStatus, SignupSource, MemberContactChange
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload
from app.utils import generate_token, hash_token
from app.security import MIN_MEMBER_PASSWORD_LENGTH, get_password_hash, verify_password
from app.config import settings
from app.middleware import get_client_ip
from app.services.security_rate_limits import enforce_auth_rate_limit
from app.services.card_verification import build_card_verification_token
from app.services.google_wallet import (
    GoogleWalletApiError,
    GoogleWalletConfigError,
    generate_google_wallet_save_link_for_member,
)
from app.services.member_activity import get_member_inactive_reason, is_card_active, is_member_active
from app.services.member_membership import (
    membership_type_label,
    resolve_member_membership_type,
    resolve_member_valid_until,
)
from app.services.org_branding import resolve_card_logo_url, resolve_club_display_name
from app.services.org_admin_sessions import get_current_org_admin_from_request
from app.services.super_admin_auth import resolve_super_admin_session
from app.services.booking_customer_actions import submit_booking_customer_note
from app.services.bookings import serialize_member_booking
from app.services.member_document_correction import (
    clear_document_correction_session,
    create_replacement_document,
    establish_document_correction_session,
    get_document_correction_context,
    serialize_document_correction_context,
)
from app.services.renewals import can_access_member_account
from app.services.member_contact_changes import (
    create_contact_change,
    decrypt_contact_value,
    email_in_use_for_membership,
    encrypt_contact_value,
    expire_stale_requests,
    rotate_contact_change_token,
    serialize_contact_change,
)
from app import audit
import os
import logging
from app.log_redaction import hash_identifier, redact_for_log, redact_url

logger = logging.getLogger(__name__)

router = APIRouter()

_PASSWORD_RESET_GENERIC_MESSAGE = (
    "Se l'email e associata a un account, riceverai un link per reimpostare la password."
)

_ALLOWED_PAYMENT_METHODS = {PaymentMethod.CASH.value, PaymentMethod.BONIFICO.value}
_ACCOUNT_NOT_ACTIVE_DETAIL = "account non attivo"
_REGISTRATION_CONTINUATION_SESSION_KEY = "registration_continuations"


class MemberBookingNoteBody(BaseModel):
    note: str = Field(..., min_length=1, max_length=4000)


class DocumentCorrectionSessionBody(BaseModel):
    token: str = Field(..., min_length=20, max_length=4096)


class MemberContactChangeBody(BaseModel):
    field: Literal["email", "phone"]
    new_value: str = Field(..., min_length=3, max_length=320)


class MemberContactChangeConfirmBody(BaseModel):
    token: str = Field(..., min_length=20, max_length=512)


_EMAIL_ADAPTER = TypeAdapter(EmailStr)


def _hash_email_for_log(email: str | None) -> str:
    return hash_identifier(email)


def _normalize_payment_method(raw_value: str | None) -> str | None:
    if raw_value is None:
        return None
    normalized = raw_value.strip().upper()
    if normalized == "":
        return None
    if normalized not in _ALLOWED_PAYMENT_METHODS:
        raise HTTPException(
            status_code=400,
            detail="Modalità di pagamento non valida. Valori ammessi: CASH, BONIFICO.",
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


def _peek_registration_continuation(
    request: Request,
    *,
    member_id: int,
) -> str | None:
    current = request.session.get(_REGISTRATION_CONTINUATION_SESSION_KEY)
    if not isinstance(current, dict):
        return None

    raw_token = current.get(str(member_id))
    return raw_token if isinstance(raw_token, str) and raw_token else None


def _remove_registration_continuation(
    request: Request,
    *,
    member_id: int,
    expected_token: str,
) -> None:
    current = request.session.get(_REGISTRATION_CONTINUATION_SESSION_KEY)
    if not isinstance(current, dict):
        return

    continuations = dict(current)
    member_key = str(member_id)
    if continuations.get(member_key) != expected_token:
        return
    continuations.pop(member_key, None)
    if continuations:
        request.session[_REGISTRATION_CONTINUATION_SESSION_KEY] = continuations
    else:
        request.session.pop(_REGISTRATION_CONTINUATION_SESSION_KEY, None)


def _enqueue_member_password_reset(
    request: Request,
    db: Session,
    member: Member,
    *,
    now: datetime,
) -> None:
    token_str = generate_token()
    db.add(
        Token(
            member_id=member.id,
            purpose=TokenType.PASSWORD_RESET,
            token_hash=hash_token(token_str),
            expires_at=now + timedelta(minutes=settings.LOGIN_TOKEN_EXPIRE_MINUTES),
        )
    )
    db.flush()

    frontend_base = settings.FRONTEND_URL.rstrip("/")
    if not frontend_base:
        frontend_base = str(request.base_url).rstrip("/")

    link = f"{frontend_base}/recupera-password?token={token_str}"
    logger.info("Generated member password reset link: %s", redact_url(link))
    enqueue_email(
        db,
        email_type="member_password_reset",
        to_email=member.email,
        subject="Recupero password Area Riservata - ASSO.N.A.M.",
        payload=build_email_payload(
            text_body=(
                f"Clicca qui per reimpostare la password della tua area riservata: {link}\n\n"
                f"Il link scade tra {settings.LOGIN_TOKEN_EXPIRE_MINUTES} minuti. "
                "Se non hai richiesto tu il recupero, puoi ignorare questa email."
            ),
            sender=build_sender_payload(
                mode="association",
                association=member.organization,
            ),
            meta={
                "member_id": member.id,
                "token_purpose": TokenType.PASSWORD_RESET.value,
            },
        ),
        priority=1,
    )


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


def get_authenticated_member(request: Request, db: Session):
    """Resolve an active or expired annual account without widening feature access."""

    member_id = request.session.get("member_id")
    if not member_id:
        return None
    member = db.query(Member).filter(Member.id == member_id).first()
    return member if can_access_member_account(member) else None


# ── Legacy HTML redirects ─────────────────────────────────────────

@router.get("/member/login")
def login_page(request: Request, org: str = None, db: Session = Depends(get_db)):
    return RedirectResponse(url="/login")


@router.get("/member/auth")
def auth_magic_link(request: Request, token: str, db: Session = Depends(get_db)):
    enforce_auth_rate_limit(db, client_ip=get_client_ip(request))
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

    if not can_access_member_account(member):
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
            redact_for_log(org.statute_pdf_path),
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


def _queue_contact_change_confirmation(
    db: Session,
    *,
    member: Member,
    change_request: MemberContactChange,
    raw_token: str,
    normalized_value: str,
) -> None:
    frontend_base = settings.FRONTEND_URL.rstrip("/") or settings.BASE_URL.rstrip("/")
    link = f"{frontend_base}/conferma-contatto?token={raw_token}"
    target_email = normalized_value if change_request.field == "email" else member.email
    field_label = "indirizzo email" if change_request.field == "email" else "numero di telefono"
    enqueue_email(
        db,
        email_type="member_contact_change_confirmation",
        to_email=target_email,
        subject=f"Conferma il nuovo {field_label} - ASSONAM",
        payload=build_email_payload(
            text_body=(
                f"Hai richiesto di modificare il tuo {field_label}.\n\n"
                f"Per confermare, apri questo link e premi Conferma: {link}\n\n"
                "Il link è monouso e scade tra 24 ore. Se non hai richiesto tu la modifica, "
                "non confermare e contatta la tua associazione."
            ),
            sender=build_sender_payload(mode="association", association=member.organization),
            meta={"member_id": member.id, "contact_change_id": change_request.id},
        ),
        priority=1,
        dedupe_key=f"member-contact-change-confirm:{change_request.id}:{change_request.token_hash}",
    )


def _queue_email_change_security_notice(
    db: Session,
    *,
    member: Member,
    subject: str,
    body: str,
    dedupe_key: str,
) -> None:
    if not member.email:
        return
    enqueue_email(
        db,
        email_type="member_email_change_security_notice",
        to_email=member.email,
        subject=subject,
        payload=build_email_payload(
            text_body=body,
            sender=build_sender_payload(mode="association", association=member.organization),
            meta={"member_id": member.id},
        ),
        priority=1,
        dedupe_key=dedupe_key,
    )


def _queue_email_change_authorization(
    db: Session,
    *,
    member: Member,
    change_request: MemberContactChange,
    raw_token: str,
) -> None:
    if not member.email:
        return
    frontend_base = settings.FRONTEND_URL.rstrip("/") or settings.BASE_URL.rstrip("/")
    link = f"{frontend_base}/conferma-contatto?token={raw_token}&action=authorize"
    enqueue_email(
        db,
        email_type="member_email_change_authorization",
        to_email=member.email,
        subject="Autorizza la modifica del tuo indirizzo email - ASSONAM",
        payload=build_email_payload(
            text_body=(
                "È stata richiesta la modifica dell'indirizzo email della tua area riservata.\n\n"
                f"Per autorizzarla dalla casella attuale, apri questo link e premi Autorizza: {link}\n\n"
                "La modifica sarà applicata soltanto dopo questa autorizzazione e la conferma "
                "separata inviata al nuovo indirizzo. Il link è monouso e scade tra 24 ore. "
                "Se non hai richiesto tu la modifica, non autorizzare e contatta la tua associazione."
            ),
            sender=build_sender_payload(mode="association", association=member.organization),
            meta={"member_id": member.id, "contact_change_id": change_request.id},
        ),
        priority=1,
        dedupe_key=(
            f"member-email-change-authorize:{change_request.id}:"
            f"{change_request.authorization_token_hash}"
        ),
    )


@router.get("/api/member/contact-changes")
def list_member_contact_changes(request: Request, db: Session = Depends(get_db)):
    member = get_authenticated_member(request, db)
    if not member:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if expire_stale_requests(db, member_id=member.id):
        db.commit()
    rows = (
        db.query(MemberContactChange)
        .filter(MemberContactChange.member_id == member.id)
        .order_by(MemberContactChange.created_at.desc(), MemberContactChange.id.desc())
        .limit(20)
        .all()
    )
    return {"items": [serialize_contact_change(row) for row in rows]}


@router.post("/api/member/contact-changes")
def request_member_contact_change(
    payload: MemberContactChangeBody,
    request: Request,
    db: Session = Depends(get_db),
):
    member = get_authenticated_member(request, db)
    if not member:
        raise HTTPException(status_code=401, detail="Not authenticated")
    enforce_auth_rate_limit(db, client_ip=get_client_ip(request))
    new_value = payload.new_value
    if payload.field == "email":
        try:
            new_value = str(_EMAIL_ADAPTER.validate_python(new_value))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Inserisci un indirizzo email valido") from exc
    try:
        change_request, raw_token, normalized, raw_authorization_token = create_contact_change(
            db,
            member=member,
            field=payload.field,
            new_value=new_value,
            requested_ip_hash=hash_identifier(get_client_ip(request)),
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    _queue_contact_change_confirmation(
        db,
        member=member,
        change_request=change_request,
        raw_token=raw_token,
        normalized_value=normalized,
    )
    if payload.field == "email" and raw_authorization_token:
        _queue_email_change_authorization(
            db,
            member=member,
            change_request=change_request,
            raw_token=raw_authorization_token,
        )
    audit.log_operation(
        db,
        action="member.contact_change_requested",
        category="member",
        entity_type="member_contact_change",
        entity_id=change_request.id,
        actor_member_id=member.id,
        actor_role="member",
        org_id=member.org_id,
        metadata={"field": payload.field},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(change_request)
    return {"ok": True, "request": serialize_contact_change(change_request)}


@router.post("/api/member/contact-changes/{change_id}/resend")
def resend_member_contact_change(
    change_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    member = get_authenticated_member(request, db)
    if not member:
        raise HTTPException(status_code=401, detail="Not authenticated")
    enforce_auth_rate_limit(db, client_ip=get_client_ip(request))
    change_request = (
        db.query(MemberContactChange)
        .filter(
            MemberContactChange.id == change_id,
            MemberContactChange.member_id == member.id,
            MemberContactChange.status.in_(["pending", "expired"]),
        )
        .first()
    )
    if not change_request:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    try:
        normalized = decrypt_contact_value(change_request.new_value_encrypted)
    except ValueError as exc:
        raise HTTPException(status_code=410, detail=str(exc)) from exc
    raw_token, raw_authorization_token = rotate_contact_change_token(change_request)
    _queue_contact_change_confirmation(
        db,
        member=member,
        change_request=change_request,
        raw_token=raw_token,
        normalized_value=normalized,
    )
    if change_request.field == "email" and raw_authorization_token:
        _queue_email_change_authorization(
            db,
            member=member,
            change_request=change_request,
            raw_token=raw_authorization_token,
        )
    db.commit()
    return {"ok": True, "request": serialize_contact_change(change_request)}


@router.delete("/api/member/contact-changes/{change_id}")
def cancel_member_contact_change(
    change_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    member = get_authenticated_member(request, db)
    if not member:
        raise HTTPException(status_code=401, detail="Not authenticated")
    change_request = (
        db.query(MemberContactChange)
        .filter(
            MemberContactChange.id == change_id,
            MemberContactChange.member_id == member.id,
            MemberContactChange.status == "pending",
        )
        .first()
    )
    if not change_request:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    change_request.status = "cancelled"
    change_request.cancelled_at = datetime.utcnow()
    change_request.new_value_encrypted = encrypt_contact_value("")
    change_request.authorization_token_hash = None
    db.commit()
    return {"ok": True}


@router.post("/api/member/contact-changes/authorize")
def authorize_member_email_change(
    payload: MemberContactChangeConfirmBody,
    request: Request,
    db: Session = Depends(get_db),
):
    """Authorize an email change from the member's current mailbox."""

    enforce_auth_rate_limit(db, client_ip=get_client_ip(request))
    now = datetime.utcnow()
    token_digest = hash_token(payload.token)
    change_request = (
        db.query(MemberContactChange)
        .filter(
            MemberContactChange.authorization_token_hash == token_digest,
            MemberContactChange.field == "email",
            MemberContactChange.status == "pending",
            MemberContactChange.expires_at > now,
            MemberContactChange.authorized_at.is_(None),
        )
        .first()
    )
    if not change_request:
        raise HTTPException(status_code=410, detail="Link non valido, scaduto o già utilizzato")
    consumed = db.execute(
        update(MemberContactChange)
        .where(
            MemberContactChange.id == change_request.id,
            MemberContactChange.authorization_token_hash == token_digest,
            MemberContactChange.status == "pending",
            MemberContactChange.expires_at > now,
            MemberContactChange.authorized_at.is_(None),
        )
        .values(
            authorized_at=now,
            authorization_token_hash=None,
            updated_at=now,
        )
    )
    if consumed.rowcount != 1:
        db.rollback()
        raise HTTPException(status_code=410, detail="Link già utilizzato")
    audit.log_operation(
        db,
        action="member.email_change_authorized",
        category="member",
        entity_type="member_contact_change",
        entity_id=change_request.id,
        actor_member_id=change_request.member_id,
        actor_role="member_current_email_verification",
        org_id=change_request.org_id,
        metadata={"field": "email"},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return {"ok": True, "field": "email", "stage": "authorized"}


@router.post("/api/member/contact-changes/confirm")
def confirm_member_contact_change(
    payload: MemberContactChangeConfirmBody,
    request: Request,
    db: Session = Depends(get_db),
):
    enforce_auth_rate_limit(db, client_ip=get_client_ip(request))
    now = datetime.utcnow()
    token_digest = hash_token(payload.token)
    change_request = (
        db.query(MemberContactChange)
        .filter(
            MemberContactChange.token_hash == token_digest,
            MemberContactChange.status == "pending",
            MemberContactChange.expires_at > now,
        )
        .first()
    )
    if not change_request:
        raise HTTPException(status_code=410, detail="Link non valido, scaduto o già utilizzato")
    member = db.query(Member).filter(Member.id == change_request.member_id).first()
    if not member or member.deleted_at is not None:
        raise HTTPException(status_code=410, detail="Account non disponibile")
    if change_request.field == "email" and change_request.authorized_at is None:
        raise HTTPException(
            status_code=409,
            detail="Autorizza prima la modifica dal link inviato al vecchio indirizzo email",
        )
    try:
        new_value = decrypt_contact_value(change_request.new_value_encrypted)
    except ValueError as exc:
        raise HTTPException(status_code=410, detail=str(exc)) from exc

    if change_request.field == "email":
        if email_in_use_for_membership(
            db,
            member=member,
            normalized_email=new_value.lower(),
        ):
            raise HTTPException(status_code=409, detail="L'indirizzo email non è più disponibile")

    confirmation_conditions = [
        MemberContactChange.id == change_request.id,
        MemberContactChange.status == "pending",
        MemberContactChange.expires_at > now,
    ]
    if change_request.field == "email":
        confirmation_conditions.append(MemberContactChange.authorized_at.isnot(None))
    consumed = db.execute(
        update(MemberContactChange)
        .where(*confirmation_conditions)
        .values(
            status="confirmed",
            confirmed_at=now,
            updated_at=now,
            # Dopo l'uso resta soltanto la prova minimizzata dell'operazione.
            new_value_encrypted=encrypt_contact_value(""),
            authorization_token_hash=None,
        )
    )
    if consumed.rowcount != 1:
        db.rollback()
        raise HTTPException(status_code=410, detail="Link già utilizzato")

    old_email = member.email
    setattr(member, change_request.field, new_value)
    audit.log_operation(
        db,
        action="member.contact_change_confirmed",
        category="member",
        entity_type="member_contact_change",
        entity_id=change_request.id,
        actor_member_id=member.id,
        actor_role="member_email_verification",
        org_id=member.org_id,
        metadata={"field": change_request.field},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    if change_request.field == "email" and old_email:
        member.email = old_email
        _queue_email_change_security_notice(
            db,
            member=member,
            subject="Indirizzo email modificato - ASSONAM",
            body=(
                "L'indirizzo email della tua area riservata è stato modificato. "
                "Se non riconosci questa operazione, contatta immediatamente la tua associazione."
            ),
            dedupe_key=f"member-email-change-confirmed:{change_request.id}",
        )
        member.email = new_value
    db.commit()
    return {"ok": True, "field": change_request.field}


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
        safe_error = str(redact_for_log(str(exc)))
        logger.warning("Google Wallet config error for member_id=%s: %s", member.id, safe_error)
        member.google_wallet_last_error = str(exc)
        db.commit()
        raise HTTPException(status_code=500, detail=str(exc))
    except GoogleWalletApiError as exc:
        detail = f"Google Wallet API error ({exc.status_code})"
        logger.error(
            "Google Wallet API error for member_id=%s status=%s response=%s",
            member.id,
            exc.status_code,
            redact_for_log((exc.response_body or "")[:500]),
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

    doc = (
        db.query(MemberDocument)
        .filter(
            MemberDocument.id == doc_id,
            MemberDocument.member_id == member.id,
        )
        .with_for_update()
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    new_doc = await create_replacement_document(
        db,
        member=member,
        document=doc,
        upload=document,
    )
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


@router.post("/api/member/document-correction/session")
def create_document_correction_session(
    body: DocumentCorrectionSessionBody,
    request: Request,
    db: Session = Depends(get_db),
):
    enforce_auth_rate_limit(db, client_ip=get_client_ip(request))
    context = establish_document_correction_session(request, db, body.token)
    return serialize_document_correction_context(context)


@router.get("/api/member/document-correction")
def get_document_correction(
    request: Request,
    db: Session = Depends(get_db),
):
    context = get_document_correction_context(request, db)
    return serialize_document_correction_context(context)


@router.post("/api/member/document-correction/documents/{doc_id}/resubmit")
async def resubmit_document_from_correction_session(
    request: Request,
    doc_id: int,
    document: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    context = get_document_correction_context(
        request,
        db,
        document_id=doc_id,
        lock_document=True,
    )

    new_doc = await create_replacement_document(
        db,
        member=context.member,
        document=context.document,
        upload=document,
    )
    db.commit()
    db.refresh(new_doc)

    audit.log_operation(
        db,
        action="member.document.resubmit_limited_session",
        entity_type="member_document",
        entity_id=new_doc.id,
        actor_member_id=context.member.id,
        metadata={
            "replaces_document_id": context.document.id,
            "doc_type": context.document.doc_type,
            "limited_session": True,
        },
        ip=get_client_ip(request),
    )
    db.commit()
    clear_document_correction_session(request, doc_id)

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

@router.get("/api/member/bookings")
def list_member_bookings(
    request: Request,
    db: Session = Depends(get_db),
):
    member = get_current_member(request, db)
    if not member:
        raise HTTPException(status_code=401, detail="Not authenticated")

    bookings = (
        db.query(Booking)
        .options(
            joinedload(Booking.form),
            joinedload(Booking.events),
            joinedload(Booking.room),
            joinedload(Booking.table),
        )
        .filter(
            Booking.member_id == member.id,
            Booking.association_id == member.org_id,
        )
        .order_by(
            Booking.booking_date.desc().nulls_last(),
            Booking.booking_time.desc().nulls_last(),
            Booking.created_at.desc(),
            Booking.id.desc(),
        )
        .limit(50)
        .all()
    )
    return {"items": [serialize_member_booking(booking) for booking in bookings]}


@router.post("/api/member/bookings/{booking_id}/note")
def submit_member_booking_note(
    booking_id: int,
    body: MemberBookingNoteBody,
    request: Request,
    db: Session = Depends(get_db),
):
    member = get_current_member(request, db)
    if not member:
        raise HTTPException(status_code=401, detail="Not authenticated")

    booking = (
        db.query(Booking)
        .options(
            joinedload(Booking.form),
            joinedload(Booking.organization),
            joinedload(Booking.events),
            joinedload(Booking.room),
            joinedload(Booking.table),
        )
        .filter(
            Booking.id == booking_id,
            Booking.member_id == member.id,
            Booking.association_id == member.org_id,
        )
        .first()
    )
    if booking is None:
        raise HTTPException(status_code=404, detail="Prenotazione non trovata.")

    submit_booking_customer_note(
        db,
        booking=booking,
        note=body.note,
        source="member_area",
        event_type="customer_note_from_member_area",
    )
    db.commit()
    db.refresh(booking)
    return {"booking": serialize_member_booking(booking)}


@router.post("/api/auth/login")
def api_auth_login(request: Request, email: str = Form(...), password: str = Form(default=""), db: Session = Depends(get_db)):
    """
    Login: if password is provided, try password auth. Otherwise send a magic-link.
    Unknown emails keep anti-enumeration behavior; known non-active members get 403.
    """
    enforce_auth_rate_limit(db, client_ip=get_client_ip(request))

    email_norm = email.strip().lower()
    now = datetime.utcnow()
    matching_members = (
        db.query(Member)
        .filter(func.lower(Member.email) == email_norm)
        .order_by(Member.id.desc())
        .all()
    )

    member = next(
        (candidate for candidate in matching_members if can_access_member_account(candidate)),
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
        logger.info("Generated member magic link: %s", redact_url(link))

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


@router.post("/api/auth/password-reset/request")
def api_auth_password_reset_request(
    request: Request,
    email: str = Form(...),
    db: Session = Depends(get_db),
):
    """Request a one-time password reset link for active member accounts only."""
    enforce_auth_rate_limit(db, client_ip=get_client_ip(request))

    email_norm = email.strip().lower()
    now = datetime.utcnow()
    matching_members = (
        db.query(Member)
        .filter(func.lower(Member.email) == email_norm)
        .order_by(Member.id.desc())
        .all()
    )
    member = next(
        (candidate for candidate in matching_members if can_access_member_account(candidate)),
        None,
    )

    if member:
        _enqueue_member_password_reset(request, db, member, now=now)
        db.commit()

    return {"status": "ok", "message": _PASSWORD_RESET_GENERIC_MESSAGE}


@router.post("/api/auth/password-reset/confirm")
def api_auth_password_reset_confirm(
    request: Request,
    token: str = Form(...),
    new_password: str = Form(...),
    confirm_password: str = Form(...),
    db: Session = Depends(get_db),
):
    """Consume a one-time password reset token and update the member password."""
    enforce_auth_rate_limit(db, client_ip=get_client_ip(request))

    if len(new_password) < MIN_MEMBER_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"La password deve avere almeno {MIN_MEMBER_PASSWORD_LENGTH} caratteri.")
    if new_password != confirm_password:
        raise HTTPException(status_code=400, detail="Le password non coincidono.")

    token_hash = hash_token(token)
    now = datetime.utcnow()

    result = db.execute(
        update(Token)
        .where(
            Token.token_hash == token_hash,
            Token.purpose == TokenType.PASSWORD_RESET,
            Token.expires_at > now,
            Token.used_at.is_(None),
        )
        .values(used_at=now)
    )
    db.flush()

    if result.rowcount == 0:
        db.rollback()
        raise HTTPException(status_code=400, detail="Link non valido o scaduto.")

    token_entry = db.query(Token).filter(Token.token_hash == token_hash).first()
    member = db.query(Member).filter(Member.id == token_entry.member_id).first() if token_entry else None
    if not member or not can_access_member_account(member):
        db.rollback()
        raise HTTPException(status_code=400, detail="Link non valido o scaduto.")

    member.password_hash = get_password_hash(new_password)
    db.commit()
    return {"status": "ok", "message": "Password aggiornata. Ora puoi accedere con la nuova password."}


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

    enforce_auth_rate_limit(db, client_ip=get_client_ip(request))

    # Registration requires a valid organization
    if not org_slug:
        raise HTTPException(status_code=404, detail="Not found")

    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org:
        raise HTTPException(status_code=404, detail="Not found")

    if len(password) < MIN_MEMBER_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"La password deve avere almeno {MIN_MEMBER_PASSWORD_LENGTH} caratteri.")

    normalized_payment_method = _normalize_payment_method(payment_method)
    email_norm = email.strip().lower()

    # This is the second, transparent wizard step. Public profile fields are
    # never sufficient proof to create or claim a member account.
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
        now = datetime.utcnow()
        continuation = _peek_registration_continuation(
            request,
            member_id=existing.id,
        )
        if continuation is not None:
            consume_result = db.execute(
                update(Token)
                .where(
                    Token.member_id == existing.id,
                    Token.token_hash == hash_token(continuation),
                    Token.purpose == TokenType.REGISTRATION_CONTINUATION,
                    Token.expires_at > now,
                    Token.used_at.is_(None),
                )
                .values(used_at=now)
            )
            if consume_result.rowcount == 1:
                existing.password_hash = get_password_hash(password)
                if not existing.signup_source:
                    existing.signup_source = SignupSource.ASSONAM_FORM.value
                if normalized_payment_method is not None:
                    existing.payment_method = normalized_payment_method
                db.commit()
                _remove_registration_continuation(
                    request,
                    member_id=existing.id,
                    expected_token=continuation,
                )

                if is_member_active(existing, now=now):
                    request.session["member_id"] = existing.id
                    audit.member_verified(
                        member_id=existing.id,
                        ip=get_client_ip(request),
                    )
                    return {
                        "status": "ok",
                        "message": "Account attivato.",
                        "authenticated": True,
                    }
                return {
                    "status": "ok",
                    "message": "Registrazione ricevuta.",
                    "authenticated": False,
                }
            db.rollback()

        # A pre-existing account without an unconsumed internal proof is never
        # modified. Active members receive the standard non-enumerating reset.
        if is_member_active(existing, now=now):
            _enqueue_member_password_reset(request, db, existing, now=now)
            db.commit()
        return {
            "status": "ok",
            "message": "Registrazione ricevuta.",
            "authenticated": False,
        }
    return {
        "status": "ok",
        "message": "Registrazione ricevuta.",
        "authenticated": False,
    }


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
    member = get_authenticated_member(request, db)
    if not member:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if len(new_password) < MIN_MEMBER_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"La password deve avere almeno {MIN_MEMBER_PASSWORD_LENGTH} caratteri.")
    member.password_hash = get_password_hash(new_password)
    db.commit()
    return {"status": "ok", "message": "Password aggiornata."}


@router.get("/api/auth/me")
def api_auth_me(request: Request, db: Session = Depends(get_db)):
    member = get_authenticated_member(request, db)
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
    try:
        resolve_super_admin_session(request, db)
    except HTTPException:
        pass
    else:
        return {"authenticated": True, "role": "super_admin", "redirect_to": "/super-admin/org-admins"}

    # 2. Org admin
    admin = get_current_org_admin_from_request(request, db)
    if admin:
        return {"authenticated": True, "role": "org_admin", "redirect_to": "/org-admin"}

    # 3. Member
    member_id = request.session.get("member_id")
    if member_id:
        member = db.query(Member).filter(Member.id == member_id).first()
        if can_access_member_account(member):
            return {"authenticated": True, "role": "member", "redirect_to": "/dashboard"}

    return {"authenticated": False}
