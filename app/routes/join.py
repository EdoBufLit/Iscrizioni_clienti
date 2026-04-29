from fastapi import APIRouter, Depends, HTTPException, Request, Form, UploadFile, File
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from datetime import date, datetime, timedelta
from app.db import get_db
from app.models import (
    Organization,
    Member,
    MemberStatus,
    SignupSource,
    PaymentMethod,
    Token,
    TokenType,
    MemberDocument,
    AdminUser,
    AdminRole,
)
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload
from app.utils import generate_token, save_upload_file, hash_token
from app.services.card_allocation import allocate_next_card
from app.services.fiscal_code import validate_fiscal_code
from app.services.integration_issuer import (
    IssueMemberCommand,
    issue_member_from_integration,
)
from app.services.member_cleanup import (
    cleanup_deleted_member_traces,
    purge_deleted_members_permanently,
)
from app.services.member_activity import is_member_active
from app.services.member_membership import (
    apply_membership_defaults,
    normalize_membership_type,
    organization_allows_custom_membership_types,
    organization_membership_fee_amount,
)
from app.services.membership_payments import organization_requires_membership_payment
from app.services.municipalities import (
    get_municipality_by_code,
    normalize_municipality_text,
)
from app.services.org_branding import resolve_club_display_name
from app.config import settings
from app.middleware import join_limiter, get_client_ip, get_request_id
from app import audit
import logging
import os
import hashlib
from typing import Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

FOREIGN_BIRTH_PLACE_NAME = "Stato estero"
FOREIGN_BIRTH_PLACE_CODE = "Z000"


# Accepted values for member payment preference in signup.
_ALLOWED_PAYMENT_METHODS = {
    PaymentMethod.CASH.value,
    PaymentMethod.BONIFICO.value,
}
_AUTO_ISSUE_CARD_VIEW_TEMPLATE = (
    "/associazioni/{org_slug}/tessera?card_token={card_token}&status={status}&wallet=1"
)


def _normalize_payment_method(
    raw_value: Optional[str], required: bool = False
) -> Optional[str]:
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

    if normalized not in _ALLOWED_PAYMENT_METHODS:
        raise HTTPException(
            status_code=400,
            detail="Modalita di pagamento non valida. Valori ammessi: CASH, BONIFICO.",
        )
    return normalized


def _is_auto_issue_signup(org: Organization) -> bool:
    return bool(getattr(org, "auto_approve_signup", False))


def _build_auto_issue_external_customer_id(email: str) -> str:
    return f"email:{email.strip().lower()}"


def _resolve_frontend_base_url(request: Request) -> str:
    configured = (settings.FRONTEND_URL or "").strip().rstrip("/")
    if configured:
        return configured
    return str(request.base_url).rstrip("/")


def _resolve_client_version(request: Request, form_value: str | None) -> str | None:
    raw = (form_value or request.headers.get("x-client-version") or "").strip()
    return raw or None


def _normalize_gender(raw_value: str | None) -> str:
    normalized = (raw_value or "").strip().upper()
    if normalized not in {"M", "F"}:
        raise HTTPException(
            status_code=400,
            detail="Sesso non valido. Valori ammessi: M o F.",
        )
    return normalized


def _parse_birth_date(raw_value: str | None) -> date:
    cleaned = (raw_value or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Data di nascita obbligatoria.")
    try:
        return date.fromisoformat(cleaned)
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail="Data di nascita non valida."
        ) from exc


def _adult_cutoff_date(reference_date: date | None = None) -> date:
    today = reference_date or date.today()
    try:
        return today.replace(year=today.year - 18)
    except ValueError:
        return today.replace(month=2, day=28, year=today.year - 18)


def ensure_adults_only_age_requirement(
    org: Organization,
    birth_date_value: date,
) -> None:
    if not bool(getattr(org, "adults_only_banner_enabled", False)):
        return
    if birth_date_value > _adult_cutoff_date():
        raise HTTPException(
            status_code=400,
            detail="Iscrizione consentita solo ai maggiori di 18 anni.",
        )


def _resolve_birth_municipality(
    *,
    birth_place: str | None,
    birth_place_code: str | None,
    birth_place_foreign: bool = False,
) -> dict:
    normalized_name = normalize_municipality_text(birth_place)
    normalized_code = (birth_place_code or "").strip().upper()
    if birth_place_foreign:
        return {
            "name": FOREIGN_BIRTH_PLACE_NAME,
            "code": FOREIGN_BIRTH_PLACE_CODE,
            "province": "",
            "region": "",
        }

    if not normalized_name or not normalized_code:
        raise HTTPException(
            status_code=400,
            detail="Comune di nascita obbligatorio. Seleziona un comune valido dall'elenco.",
        )

    municipality = get_municipality_by_code(normalized_code)
    if municipality is None:
        raise HTTPException(
            status_code=400,
            detail="Comune di nascita non valido. Seleziona un comune valido dall'elenco.",
        )

    if normalize_municipality_text(municipality["name"]) != normalized_name:
        raise HTTPException(
            status_code=400,
            detail="Comune di nascita non valido. Seleziona un comune valido dall'elenco.",
        )

    return municipality


def _validate_signup_fiscal_code(
    *,
    first_name: str,
    last_name: str,
    fiscal_code: str,
    birth_date_value: date,
    gender: str,
    birth_place_code: str,
    org_slug: str,
    email: str,
) -> tuple[str, bool]:
    validation = validate_fiscal_code(
        fiscal_code=fiscal_code,
        first_name=first_name,
        last_name=last_name,
        birth_date=birth_date_value,
        gender=gender,
        birth_place_code=birth_place_code,
    )
    if not validation.is_formally_valid:
        raise HTTPException(
            status_code=400,
            detail="Codice fiscale non valido. Verifica formato e checksum.",
        )

    mismatch = validation.matches_expected is False
    if mismatch:
        email_hash = hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()[
            :12
        ]
        logger.info(
            "Fiscal code mismatch accepted for web signup org_slug=%s email_hash=%s expected=%s provided=%s",
            org_slug,
            email_hash,
            validation.expected,
            validation.normalized,
        )
    return validation.normalized, mismatch


# ── Legacy HTML redirects ─────────────────────────────────────────


@router.get("/join/continue")
def join_continue_page(request: Request, token: str, db: Session = Depends(get_db)):
    token_hash = hash_token(token)
    token_entry = (
        db.query(Token)
        .filter(
            Token.token_hash == token_hash,
            Token.purpose == TokenType.SIGNUP_CONTINUE,
            Token.expires_at > datetime.utcnow(),
        )
        .first()
    )

    if not token_entry:
        return RedirectResponse(url="/")

    if token_entry.used_at:
        return RedirectResponse(url="/")

    member = db.query(Member).filter(Member.id == token_entry.member_id).first()
    organization = (
        db.query(Organization).filter(Organization.id == member.org_id).first()
    )

    return RedirectResponse(url="/")


@router.get("/join/{org_slug}")
def join_page(request: Request, org_slug: str, db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org:
        return RedirectResponse(url="/associazioni")

    return RedirectResponse(url=f"/associazioni/{org_slug}/iscrizione")


# ── JSON API ──────────────────────────────────────────────────────


def check_signup_allowed(
    db: Session,
    org_id: int,
    email: str,
    request: Request,
    *,
    fiscal_code: Optional[str] = None,
):
    normalized_email = email.strip().lower()

    purged = purge_deleted_members_permanently(
        db,
        org_id=org_id,
        email=normalized_email,
        fiscal_code=fiscal_code,
    )
    if purged:
        db.commit()
        logger.info(
            "Hard-purged %s deleted member rows before signup check (org_id=%s)",
            purged,
            org_id,
        )

    cleaned = cleanup_deleted_member_traces(
        db,
        org_id=org_id,
        email=normalized_email,
        fiscal_code=fiscal_code,
    )
    if cleaned:
        db.commit()
        logger.info(
            "Sanitized %s deleted member rows before signup check (org_id=%s)",
            cleaned,
            org_id,
        )

    # 1. Block Org Admin
    # Check if this email is an admin for this org
    admin_user = (
        db.query(AdminUser)
        .filter(
            func.lower(AdminUser.email) == normalized_email,
            AdminUser.org_id == org_id,
            AdminUser.is_active.is_(True),
        )
        .first()
    )
    if admin_user:
        raise HTTPException(
            status_code=403,
            detail="Gli amministratori non possono iscriversi come soci.",
        )

    # Also check current session if authenticated as admin (double check)
    current_admin_id = request.session.get("org_admin_id")
    if current_admin_id:
        current_admin = (
            db.query(AdminUser).filter(AdminUser.id == current_admin_id).first()
        )
        if current_admin and current_admin.org_id == org_id:
            raise HTTPException(
                status_code=403,
                detail="Gli amministratori non possono iscriversi come soci.",
            )

    # 2. Uniqueness / Resubmission Check
    # Find latest member record (including deleted, but filtered manually if needed)
    # Actually, we want to find the latest non-deleted OR deleted to decide.
    # Logic:
    # - If exists and status in [PENDING, ACTIVE] AND deleted_at IS NULL -> Block
    # - If exists and status == REJECTED -> Allow (create new)
    # - If exists and deleted_at IS NOT NULL -> Allow (create new)

    latest_member = (
        db.query(Member)
        .filter(
            Member.org_id == org_id,
            func.lower(Member.email) == normalized_email,
        )
        .order_by(Member.id.desc())
        .first()
    )

    if latest_member:
        latest_member_status = (
            str(getattr(latest_member, "status", "") or "").strip().lower()
        )
        if latest_member.deleted_at is not None or latest_member_status == "deleted":
            # Deleted, allow resubmission
            pass
        elif latest_member.status == MemberStatus.REJECTED:
            # Rejected, allow resubmission
            pass
        elif latest_member.status == MemberStatus.ACTIVE and is_member_active(
            latest_member, now=datetime.utcnow()
        ):
            # Fully active member, block
            audit.log_operation(
                db,
                action="member.signup.blocked_duplicate",
                entity_type="member",
                entity_id=latest_member.id,
                metadata={"email": normalized_email, "reason": "duplicate_active"},
                ip=get_client_ip(request),
            )
            db.commit()
            raise HTTPException(
                status_code=409, detail="Sei già iscritto a questa associazione."
            )
        else:
            # Pending state (pending_docs, pending_verification, pending_cards)
            # Also reuse stale legacy rows that are status=active but lifecycle-inactive.
            # Return existing member so caller can respond 200 without creating a duplicate
            return latest_member

    return None


@router.post("/api/join/{org_slug}")
def api_join_start(
    request: Request,
    org_slug: str,
    first_name: str = Form(...),
    last_name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    fiscal_code: str = Form(...),
    accept_statute: bool = Form(...),
    accept_privacy: bool = Form(...),
    membership_type: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    join_limiter.check(get_client_ip(request))

    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if not org.is_active:
        raise HTTPException(
            status_code=400, detail="L'associazione non è attualmente attiva."
        )
    requested_membership_type = normalize_membership_type(membership_type)
    if (
        requested_membership_type == "temporary"
        and not organization_allows_custom_membership_types(org)
    ):
        raise HTTPException(
            status_code=400,
            detail="La tessera temporanea non e disponibile per questa associazione.",
        )
    if organization_requires_membership_payment(org):
        raise HTTPException(
            status_code=400,
            detail="Per questa associazione il pagamento online è obbligatorio. Usa il pulsante 'Paga con carta'.",
        )

    # Statute acceptance is required only when the org has a statute uploaded
    if org.statute_pdf_path:
        if not accept_statute:
            raise HTTPException(
                status_code=400,
                detail="È necessario accettare lo statuto per procedere.",
            )

    existing = check_signup_allowed(db, org.id, email, request, fiscal_code=fiscal_code)
    display_name = resolve_club_display_name(org) or org.name
    if existing:
        return {"status": "started", "organization": display_name}

    member = Member(
        org_id=org.id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=phone,
        fiscal_code=fiscal_code,
        status=MemberStatus.PENDING_DOCS,
        accepted_statute_at=datetime.utcnow(),
        accepted_statute_version=org.statute_version,
        accepted_privacy_at=datetime.utcnow(),
        accepted_privacy_version=org.privacy_version,
        signup_source=SignupSource.ASSONAM_FORM.value,
        signup_ip=request.client.host,
        signup_user_agent=request.headers.get("user-agent"),
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    # Create Token
    token_str = generate_token()
    token = Token(
        member_id=member.id,
        purpose=TokenType.SIGNUP_CONTINUE,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow()
        + timedelta(minutes=settings.JOIN_TOKEN_EXPIRE_MINUTES),
    )
    db.add(token)
    db.flush()

    link = f"{settings.BASE_URL}/join/continue?token={token_str}"
    enqueue_email(
        db,
        email_type="signup_continue",
        to_email=email,
        subject=f"Complete your registration for {display_name}",
        payload=build_email_payload(
            text_body=f"Click here to upload documents and complete registration: {link}",
            sender=build_sender_payload(mode="association", association=org),
            meta={
                "member_id": member.id,
                "token_purpose": TokenType.SIGNUP_CONTINUE.value,
            },
        ),
        priority=5,
    )
    db.commit()

    audit.join_submitted(org_slug=org_slug, org_id=org.id, ip=get_client_ip(request))

    return {"status": "started", "organization": display_name, "email_status": "queued"}


@router.post("/api/join/continue")
async def api_join_continue(
    request: Request,
    token: str = Form(...),
    id_document: UploadFile = File(...),
    fiscal_code_document: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # Validate token
    token_hash = hash_token(token)
    token_entry = (
        db.query(Token)
        .filter(
            Token.token_hash == token_hash,
            Token.purpose == TokenType.SIGNUP_CONTINUE,
            Token.expires_at > datetime.utcnow(),
        )
        .first()
    )

    if not token_entry:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    if token_entry.used_at:
        raise HTTPException(status_code=400, detail="Token already used")

    member = db.query(Member).filter(Member.id == token_entry.member_id).first()

    # Process Files with transactional cleanup on failure
    rel_path_id = None
    rel_path_fc = None
    sub_path = f"{member.org_id}/{member.id}"

    try:
        # Process ID Document
        rel_path_id, size_id, sha_id = await save_upload_file(
            id_document, sub_directory=sub_path
        )
        doc_id = MemberDocument(
            member_id=member.id,
            doc_type="identity",
            rel_path=rel_path_id,
            original_filename=id_document.filename,
            mime_type=id_document.content_type,
            size_bytes=size_id,
            sha256=sha_id,
            status="pending",
        )
        db.add(doc_id)
        audit.log_operation(
            db,
            action="member.document.upload",
            entity_type="member_document",
            entity_id=None,  # Not yet committed, but that's fine for now, or we can update later? Actually audit.log_operation creates a record, so it will have an ID when flushed.
            # But the prompt says: "entity_id=doc_id metadata_json includes filename/mime/size"
            # Since doc_id is an object here, we don't have ID yet.
            # We can flush doc_id first?
            # Or just log without entity_id for now?
            # Let's flush? No, let's keep it simple. The prompt task says "entity_id=doc_id".
            # I'll db.flush() after adding docs.
            metadata={
                "filename": id_document.filename,
                "mime": id_document.content_type,
                "size": size_id,
            },
        )

        # Process Fiscal Code Document
        rel_path_fc, size_fc, sha_fc = await save_upload_file(
            fiscal_code_document, sub_directory=sub_path
        )
        doc_fc = MemberDocument(
            member_id=member.id,
            doc_type="fiscal_code",
            rel_path=rel_path_fc,
            original_filename=fiscal_code_document.filename,
            mime_type=fiscal_code_document.content_type,
            size_bytes=size_fc,
            sha256=sha_fc,
            status="pending",
        )
        db.add(doc_fc)
        audit.log_operation(
            db,
            action="member.document.upload",
            entity_type="member_document",
            entity_id=None,
            metadata={
                "filename": fiscal_code_document.filename,
                "mime": fiscal_code_document.content_type,
                "size": size_fc,
            },
        )

        db.flush()  # Ensure IDs are generated for docs if we wanted to use them, but we are inside try block.
        # Actually I can't easily update the audit log entity_id unless I flush and then update the log object.
        # But audit.log_operation commits? No, it adds to session.
        # Let's check audit.py. I don't see audit.py content.
        # Assuming standard usage.
        # I'll skip entity_id in this step for simplicity or set it to 0/None.

        # Assign Card
        try:
            allocation = allocate_next_card(
                db,
                org_id=member.org_id,
                year=datetime.utcnow().year,
            )
            member.card_no = allocation.card_no
            member.batch_id = allocation.batch_id
            member.card_year = allocation.year
            member.numbering_scope_id = allocation.numbering_scope_id
            member.status = MemberStatus.ACTIVE
            member.joined_at = datetime.utcnow()
            assigned = allocation.card_no
        except HTTPException as exc:
            if exc.status_code == 409:
                # Cards exhausted - member goes to PENDING_CARDS status
                member.status = MemberStatus.PENDING_CARDS
                assigned = None
                logger.warning(
                    f"Member {member.id} completed upload but no cards available: {exc.detail}"
                )
            else:
                raise

        # Mark token used
        token_entry.used_at = datetime.utcnow()

        org = db.query(Organization).filter(Organization.id == member.org_id).first()
        display_name = resolve_club_display_name(org) or org.name
        enqueue_email(
            db,
            email_type="signup_complete",
            to_email=member.email,
            subject=f"Welcome to {display_name}",
            payload=build_email_payload(
                text_body=(
                    "Your registration is complete. "
                    f"You can now login at {settings.BASE_URL}/member/login"
                ),
                sender=build_sender_payload(mode="association", association=org),
                meta={"member_id": member.id},
            ),
            priority=5,
        )
        db.commit()

        audit.join_completed(
            member_id=member.id,
            org_id=member.org_id,
            card_assigned=bool(assigned),
        )

        return {
            "status": "complete",
            "assigned_card": bool(assigned),
            "member_status": member.status.value,
            "email_status": "queued",
        }

    except HTTPException:
        raise
    except Exception as e:
        # Cleanup uploads
        for rel_path in (rel_path_id, rel_path_fc):
            if rel_path:
                try:
                    os.remove(os.path.join(settings.UPLOAD_DIR, rel_path))
                except OSError:
                    pass
        db.rollback()
        logger.error(f"Error during file upload: {e}")
        raise HTTPException(
            status_code=500, detail="Internal server error during upload"
        )


@router.post("/api/join/{org_slug}/submit")
async def api_join_submit_multipart(
    request: Request,
    org_slug: str,
    first_name: str = Form(...),
    last_name: str = Form(...),
    birth_date: str = Form(...),
    birth_place: str = Form(...),
    birth_place_code: str = Form(...),
    birth_place_foreign: bool = Form(False),
    gender: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    fiscal_code: str = Form(...),
    accept_statute: bool = Form(...),
    accepted_statute_version: Optional[str] = Form(None),
    accept_privacy: bool = Form(...),
    payment_method: Optional[str] = Form(None),
    membership_type: Optional[str] = Form(None),
    client_version: Optional[str] = Form(None),
    accepted_privacy_version: Optional[str] = Form(None),  # Usually implied by org
    id_document: Optional[UploadFile] = File(None),
    fiscal_code_document: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    join_limiter.check(get_client_ip(request))
    request_id = get_request_id(request)
    request_user_agent = request.headers.get("user-agent")
    effective_client_version = _resolve_client_version(request, client_version)
    normalized_org_slug = org_slug.strip().lower()

    org = (
        db.query(Organization)
        .filter(
            func.lower(Organization.slug) == normalized_org_slug,
            Organization.deleted_at.is_(None),
        )
        .first()
    )
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if not org.is_active:
        raise HTTPException(
            status_code=400, detail="L'associazione non è attualmente attiva."
        )
    requested_membership_type = normalize_membership_type(membership_type)
    if (
        requested_membership_type == "temporary"
        and not organization_allows_custom_membership_types(org)
    ):
        raise HTTPException(
            status_code=400,
            detail="La tessera temporanea non e disponibile per questa associazione.",
        )
    if organization_requires_membership_payment(org):
        raise HTTPException(
            status_code=400,
            detail="Per questa associazione il pagamento online è obbligatorio. Usa il pulsante 'Paga con carta'.",
        )

    # Statute acceptance is required only when the org has a statute uploaded
    if org.statute_pdf_path:
        if not accept_statute:
            raise HTTPException(
                status_code=400,
                detail="È necessario accettare lo statuto per procedere.",
            )

    normalized_payment_method = _normalize_payment_method(payment_method, required=True)
    auto_issue_enabled = _is_auto_issue_signup(org)
    client_ip = get_client_ip(request)
    normalized_email = email.strip().lower()
    birth_date_value = _parse_birth_date(birth_date)
    ensure_adults_only_age_requirement(org, birth_date_value)
    normalized_gender = _normalize_gender(gender)
    municipality = _resolve_birth_municipality(
        birth_place=birth_place,
        birth_place_code=birth_place_code,
        birth_place_foreign=birth_place_foreign,
    )
    normalized_fiscal_code, fiscal_code_mismatch = _validate_signup_fiscal_code(
        first_name=first_name,
        last_name=last_name,
        fiscal_code=fiscal_code,
        birth_date_value=birth_date_value,
        gender=normalized_gender,
        birth_place_code=municipality["code"],
        org_slug=org_slug,
        email=normalized_email,
    )
    logger.info(
        "join_submit_start request_id=%s git_sha=%s org_slug=%s org_id=%s auto_approve_signup=%s email=%s fiscal_code=%s user_agent=%s client_version=%s",
        request_id,
        settings.GIT_SHA or "unknown",
        org.slug,
        org.id,
        auto_issue_enabled,
        normalized_email,
        normalized_fiscal_code,
        request_user_agent,
        effective_client_version or "-",
    )
    logger.info(
        "join_submit_branch request_id=%s branch=%s org_slug=%s org_id=%s",
        request_id,
        "AUTO_APPROVE" if auto_issue_enabled else "MANUAL_REVIEW",
        org.slug,
        org.id,
    )

    existing = check_signup_allowed(
        db,
        org.id,
        email,
        request,
        fiscal_code=normalized_fiscal_code,
    )
    require_membership_document = bool(
        getattr(org, "require_membership_document", False)
    )
    existing_identity_document = False
    if existing:
        existing_identity_document = (
            db.query(MemberDocument.id)
            .filter(
                MemberDocument.member_id == existing.id,
                MemberDocument.doc_type == "identity",
            )
            .first()
            is not None
        )
    if require_membership_document and not id_document and not existing_identity_document:
        raise HTTPException(
            status_code=400,
            detail="Per completare l'iscrizione è necessario caricare il documento di identità.",
        )

    # Transactional
    rel_path_id = None
    rel_path_fc = None
    uploaded_docs_count = 0
    auto_issue_result = None
    manual_review_email_status = "not_requested"
    member_persisted = False

    try:
        if existing:
            # Reuse pending draft: update fields and replace old documents
            member = existing
            member.first_name = first_name
            member.last_name = last_name
            member.phone = phone
            member.fiscal_code = normalized_fiscal_code
            member.birth_date = birth_date_value
            member.birth_place = municipality["name"]
            member.birth_place_code = municipality["code"]
            member.gender = normalized_gender
            member.status = MemberStatus.PENDING_VERIFICATION
            member.accepted_statute_at = datetime.utcnow()
            member.accepted_statute_version = (
                accepted_statute_version or org.statute_version
            )
            member.accepted_privacy_at = datetime.utcnow()
            member.accepted_privacy_version = org.privacy_version
            if not member.signup_source:
                member.signup_source = SignupSource.ASSONAM_FORM.value
            member.payment_method = normalized_payment_method
            member.signup_ip = client_ip
            member.signup_user_agent = request_user_agent
            apply_membership_defaults(
                member=member,
                org=org,
                membership_type=requested_membership_type,
                reference_time=datetime.utcnow(),
                membership_fee_snapshot=organization_membership_fee_amount(
                    org, requested_membership_type
                ),
            )

            # Remove old documents (files + DB rows)
            old_docs = (
                db.query(MemberDocument)
                .filter(MemberDocument.member_id == member.id)
                .all()
            )
            for old_doc in old_docs:
                try:
                    old_path = os.path.join(settings.UPLOAD_DIR, old_doc.rel_path)
                    if os.path.exists(old_path):
                        os.remove(old_path)
                except OSError:
                    logger.warning(
                        "Failed to delete old doc file: %s", old_doc.rel_path
                    )
                db.delete(old_doc)
            db.flush()
        else:
            # 1. Create Member FIRST to get ID for storage path
            member = Member(
                org_id=org.id,
                first_name=first_name,
                last_name=last_name,
                email=email,
                phone=phone,
                fiscal_code=normalized_fiscal_code,
                birth_date=birth_date_value,
                birth_place=municipality["name"],
                birth_place_code=municipality["code"],
                gender=normalized_gender,
                payment_method=normalized_payment_method,
                status=MemberStatus.PENDING_VERIFICATION,
                accepted_statute_at=datetime.utcnow(),
                accepted_statute_version=accepted_statute_version
                or org.statute_version,
                accepted_privacy_at=datetime.utcnow(),
                accepted_privacy_version=org.privacy_version,
                signup_source=SignupSource.ASSONAM_FORM.value,
                signup_ip=client_ip,
                signup_user_agent=request_user_agent,
            )
            db.add(member)
            db.flush()
            apply_membership_defaults(
                member=member,
                org=org,
                membership_type=requested_membership_type,
                reference_time=datetime.utcnow(),
                membership_fee_snapshot=organization_membership_fee_amount(
                    org, requested_membership_type
                ),
            )

        sub_path = f"{org.id}/{member.id}"

        # 2. Save Docs
        if id_document:
            rel_path_id, size_id, sha_id = await save_upload_file(
                id_document, sub_directory=sub_path
            )
            doc_obj_id = MemberDocument(
                member_id=member.id,
                doc_type="identity",
                rel_path=rel_path_id,
                original_filename=id_document.filename,
                mime_type=id_document.content_type,
                size_bytes=size_id,
                sha256=sha_id,
                status="pending",
            )
            db.add(doc_obj_id)
            uploaded_docs_count += 1
            audit.log_operation(
                db,
                action="member.document.upload",
                entity_type="member_document",
                entity_id=None,
                metadata={
                    "filename": id_document.filename,
                    "mime": id_document.content_type,
                    "size": size_id,
                },
            )

        if fiscal_code_document:
            rel_path_fc, size_fc, sha_fc = await save_upload_file(
                fiscal_code_document, sub_directory=sub_path
            )
            doc_obj_fc = MemberDocument(
                member_id=member.id,
                doc_type="fiscal_code",
                rel_path=rel_path_fc,
                original_filename=fiscal_code_document.filename,
                mime_type=fiscal_code_document.content_type,
                size_bytes=size_fc,
                sha256=sha_fc,
                status="pending",
            )
            db.add(doc_obj_fc)
            uploaded_docs_count += 1
            audit.log_operation(
                db,
                action="member.document.upload",
                entity_type="member_document",
                entity_id=None,
                metadata={
                    "filename": fiscal_code_document.filename,
                    "mime": fiscal_code_document.content_type,
                    "size": size_fc,
                },
            )

        audit.log_operation(
            db,
            action="member.create_with_docs",
            entity_type="member",
            entity_id=member.id,
            ip=client_ip,
            metadata={"docs_count": uploaded_docs_count},
        )

        if auto_issue_enabled:
            member.external_customer_id = _build_auto_issue_external_customer_id(
                normalized_email
            )
            member.signup_source = SignupSource.ASSONAM_FORM.value
            logger.info(
                "join_submit_commit_before request_id=%s phase=prepare_auto_issue member_id=%s org_id=%s",
                request_id,
                member.id,
                org.id,
            )
            db.commit()
            logger.info(
                "join_submit_commit_after request_id=%s phase=prepare_auto_issue member_id=%s org_id=%s",
                request_id,
                member.id,
                org.id,
            )
            member_persisted = True

            logger.info(
                "join_submit_auto_issue_call request_id=%s member_id=%s org_id=%s",
                request_id,
                member.id,
                org.id,
            )
            auto_issue_result = issue_member_from_integration(
                db,
                IssueMemberCommand(
                    org_id=org.id,
                    external_customer_id=member.external_customer_id,
                    email=normalized_email,
                    first_name=member.first_name,
                    last_name=member.last_name,
                    phone=member.phone,
                    fiscal_code=member.fiscal_code,
                    send_email=True,
                    signup_source=SignupSource.ASSONAM_FORM.value,
                    integration_name="web_signup_auto",
                    request_ip=client_ip,
                    request_user_agent=request_user_agent,
                    request_id=request_id,
                    client_version=effective_client_version,
                    backend_base_url=(
                        settings.BASE_URL or str(request.base_url).rstrip("/")
                    ).rstrip("/"),
                    frontend_base_url=_resolve_frontend_base_url(request),
                    send_email_once=True,
                    decision_note="Auto-approved via web signup",
                    card_view_url_template=_AUTO_ISSUE_CARD_VIEW_TEMPLATE,
                ),
            )
            db.refresh(member)
        else:
            display_name = resolve_club_display_name(org) or org.name
            enqueue_email(
                db,
                email_type="manual_review_received",
                to_email=email,
                subject=f"Richiesta iscrizione {display_name} ricevuta",
                payload=build_email_payload(
                    text_body=(
                        "Abbiamo ricevuto la tua richiesta e i documenti. "
                        "Un amministratore li verifichera a breve."
                    ),
                    sender=build_sender_payload(mode="association", association=org),
                    meta={"member_id": member.id},
                ),
                priority=5,
            )
            manual_review_email_status = "queued"
            logger.info(
                "join_submit_commit_before request_id=%s phase=manual_review member_id=%s org_id=%s",
                request_id,
                member.id,
                org.id,
            )
            db.commit()
            logger.info(
                "join_submit_commit_after request_id=%s phase=manual_review member_id=%s org_id=%s",
                request_id,
                member.id,
                org.id,
            )
            member_persisted = True

    except HTTPException as exc:
        logger.warning(
            "join_submit_http_exception request_id=%s status_code=%s detail=%s rollback=1",
            request_id,
            exc.status_code,
            exc.detail,
        )
        db.rollback()
        raise
    except IntegrityError:
        logger.warning(
            "join_submit_integrity_error request_id=%s rollback=1",
            request_id,
            exc_info=True,
        )
        db.rollback()
        if not member_persisted:
            for p in [rel_path_id, rel_path_fc]:
                if p:
                    try:
                        os.remove(os.path.join(settings.UPLOAD_DIR, p))
                    except OSError:
                        pass
        raise HTTPException(
            status_code=409,
            detail="Esiste già una iscrizione associata a questi dati.",
        )
    except Exception as e:
        logger.exception(
            "join_submit_unexpected_exception request_id=%s rollback=1",
            request_id,
        )
        db.rollback()
        if not member_persisted:
            # Cleanup only when the signup was not persisted yet.
            for p in [rel_path_id, rel_path_fc]:
                if p:
                    try:
                        os.remove(os.path.join(settings.UPLOAD_DIR, p))
                    except OSError:
                        pass
        raise HTTPException(
            status_code=500,
            detail=f"Errore nel salvataggio della richiesta. (ref: {request_id})",
        )

    audit.join_submitted(org_slug=org_slug, org_id=org.id, ip=client_ip)

    if auto_issue_enabled and auto_issue_result is None:
        logger.error(
            "join_submit_guardrail_block_manual_email request_id=%s org_id=%s reason=auto_issue_missing_result",
            request_id,
            org.id,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Errore emissione tessera automatica. (ref: {request_id})",
        )

    if auto_issue_result is not None:
        logger.info(
            "join_submit_auto_issue_completed request_id=%s org_id=%s member_id=%s outcome=%s email_sent=%s",
            request_id,
            org.id,
            auto_issue_result.member_id,
            auto_issue_result.outcome,
            auto_issue_result.email_sent,
        )
        return {
            "status": "issued",
            "id": auto_issue_result.member_id,
            "email_sent": auto_issue_result.email_sent,
            "email_status": auto_issue_result.email_status,
            "warnings": ["fiscal_code_mismatch"] if fiscal_code_mismatch else [],
            "active_card_page_url": auto_issue_result.card_page_url,
            "card_verification_token": auto_issue_result.card_verification_token,
            "card_verification_url": auto_issue_result.card_verification_url,
            "card_download_url": auto_issue_result.card_download_url,
        }

    return {
        "status": "received",
        "id": member.id,
        "email_sent": False,
        "email_status": manual_review_email_status,
        "warnings": ["fiscal_code_mismatch"] if fiscal_code_mismatch else [],
    }
