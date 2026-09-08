from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import audit
from app.config import settings
from app.db import get_db
from app.log_redaction import hash_identifier, redact_for_log
from app.middleware import get_client_ip, get_request_id
from app.models import (
    Member,
    MemberDocument,
    MemberStatus,
    MembershipPayment,
    MembershipPaymentStatus,
    Organization,
    SignupSource,
)
from app.routes.join import (
    ensure_adults_only_age_requirement,
    _normalize_gender,
    _parse_birth_date,
    _resolve_birth_municipality,
    _validate_signup_fiscal_code,
    check_signup_allowed,
)
from app.security import MIN_MEMBER_PASSWORD_LENGTH, get_password_hash, verify_password
from app.services.security_rate_limits import (
    enforce_join_rate_limit,
    enforce_payment_status_rate_limit,
)
from app.services.card_allocation import lock_card_allocation
from app.services.card_reservations import reserve_payment_card
from app.services.membership_payments import (
    MembershipPaymentSource,
    build_membership_payment_status_payload,
    build_redirect_and_return_urls,
    create_checkout_reference,
    create_sumup_hosted_checkout,
    latest_membership_payment,
    log_sumup_webhook_event,
    normalize_membership_payment_reason,
    organization_has_sumup_config,
    organization_requires_membership_payment,
    payment_status_is_paid,
    persist_sumup_checkout_creation,
    reuse_existing_sumup_checkout,
    serialize_public_membership_payment,
    update_payment_state_from_sumup,
    verify_sumup_checkout,
)
from app.services.member_membership import (
    MEMBERSHIP_TYPE_ANNUAL,
    apply_membership_defaults,
    normalize_membership_type,
    organization_allows_custom_membership_types,
    organization_membership_fee_amount,
)
from app.services.marketing_consent import grant_email_marketing_consent
from app.services.privacy_notice import record_privacy_notice_acknowledgement
from app.services.file_deletion import enqueue_file_deletion
from app.services.sqlite_card_allocation_guard import (
    sqlite_card_allocation_request_guard,
)
from app.utils import generate_token, hash_token, save_upload_file

logger = logging.getLogger(__name__)

router = APIRouter()

_PAYMENT_STATUS_CAPABILITY_TTL = timedelta(days=7)


def _payment_status_cookie_name(payment_id: int) -> str:
    return f"membership_payment_status_{payment_id}"


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _set_payment_status_cookie(
    response: Response,
    request: Request,
    *,
    payment_id: int,
    token_value: str,
) -> None:
    response.set_cookie(
        key=_payment_status_cookie_name(payment_id),
        value=token_value,
        max_age=int(_PAYMENT_STATUS_CAPABILITY_TTL.total_seconds()),
        httponly=True,
        secure=(
            request.url.scheme == "https"
            or (settings.BASE_URL or "").strip().lower().startswith("https://")
        ),
        samesite="lax",
        # The checkout endpoint needs this cookie too when the browser retries
        # an already-created SumUp checkout. Keeping it on the old status-only
        # path made a legitimate retry indistinguishable from an unauthenticated
        # takeover attempt and caused the stored capability to be rotated.
        path="/api/public",
    )


def _ensure_payment_status_capability(
    payment: MembershipPayment,
    *,
    request: Request,
    response: Response,
) -> None:
    cookie_name = _payment_status_cookie_name(payment.id)
    presented = request.cookies.get(cookie_name)
    expires_at = payment.status_token_expires_at
    is_current = bool(
        presented
        and payment.status_token_hash
        and expires_at
        and _as_utc(expires_at) > datetime.now(timezone.utc)
        and secrets.compare_digest(
            payment.status_token_hash,
            hash_token(presented),
        )
    )
    token_value = presented if is_current else generate_token()
    if not is_current:
        payment.status_token_hash = hash_token(token_value)
        payment.status_token_expires_at = (
            datetime.now(timezone.utc) + _PAYMENT_STATUS_CAPABILITY_TTL
        )
    _set_payment_status_cookie(
        response,
        request,
        payment_id=payment.id,
        token_value=token_value,
    )


def _has_payment_status_capability(
    payment: MembershipPayment,
    *,
    request: Request,
) -> bool:
    presented = request.cookies.get(_payment_status_cookie_name(payment.id))
    if not presented or not payment.status_token_hash or not payment.status_token_expires_at:
        return False
    if _as_utc(payment.status_token_expires_at) <= datetime.now(timezone.utc):
        return False
    return secrets.compare_digest(payment.status_token_hash, hash_token(presented))


def _password_proves_member_ownership(
    member: Member | None,
    password: str | None,
) -> bool:
    if not member or not password or not member.password_hash:
        return False
    try:
        return verify_password(password, member.password_hash)
    except (TypeError, ValueError):
        return False


def _is_recent_legacy_sumup_payment(payment: MembershipPayment) -> bool:
    """Temporary compatibility for checkouts created before capability rollout."""
    if payment.status_token_hash or payment.source != MembershipPaymentSource.SUMUP.value:
        return False
    if not payment.sumup_checkout_id or not payment.status_token_expires_at:
        return False
    return _as_utc(payment.status_token_expires_at) > datetime.now(timezone.utc)


def _can_claim_recent_legacy_sumup_payment(
    payment: MembershipPayment,
    *,
    request: Request,
) -> bool:
    """Bind an in-flight pre-capability checkout to its original browser context.

    This compatibility path exists only for the bounded migration window.  A
    successful claim immediately creates the normal random, hashed capability;
    public knowledge of the sequential payment id is never sufficient by itself.
    """

    if not _is_recent_legacy_sumup_payment(payment):
        return False
    member = payment.member
    if member is None:
        return False
    expected_ip = str(member.signup_ip or "").strip()
    expected_user_agent = str(member.signup_user_agent or "").strip()
    actual_ip = str(get_client_ip(request) or "").strip()
    actual_user_agent = str(request.headers.get("user-agent") or "").strip()
    if not expected_ip or not expected_user_agent:
        return False
    return secrets.compare_digest(expected_ip, actual_ip) and secrets.compare_digest(
        expected_user_agent,
        actual_user_agent,
    )


def _get_active_org_by_slug(db: Session, org_slug: str) -> Organization:
    normalized_org_slug = org_slug.strip().lower()
    org = (
        db.query(Organization)
        .filter(
            func.lower(Organization.slug) == normalized_org_slug,
            Organization.deleted_at.is_(None),
            Organization.is_active.is_(True),
        )
        .first()
    )
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _clear_member_documents(db: Session, member: Member) -> None:
    old_docs = db.query(MemberDocument).filter(MemberDocument.member_id == member.id).all()
    for old_doc in old_docs:
        if old_doc.rel_path:
            enqueue_file_deletion(db, old_doc.rel_path)
        db.delete(old_doc)
    db.flush()


async def _upsert_member_for_checkout(
    *,
    request: Request,
    db: Session,
    org: Organization,
    first_name: str,
    last_name: str,
    birth_date: str,
    birth_place: str,
    birth_place_code: str,
    birth_place_foreign: bool,
    gender: str,
    email: str,
    phone: str,
    fiscal_code: str,
    password: str | None,
    membership_type: str | None,
    accept_statute: bool,
    accepted_statute_version: str | None,
    accept_privacy: bool,
    marketing_email_consent: bool,
    id_document: UploadFile | None,
    allow_existing_update: bool,
) -> tuple[Member, bool]:
    if org.statute_pdf_path and not accept_statute:
        raise HTTPException(status_code=400, detail="È necessario accettare lo statuto per procedere.")
    if not accept_privacy:
        raise HTTPException(status_code=400, detail="È necessario accettare l'informativa privacy.")
    if password and len(password) < MIN_MEMBER_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"La password deve avere almeno {MIN_MEMBER_PASSWORD_LENGTH} caratteri.")

    requested_membership_type = normalize_membership_type(membership_type)
    if (
        requested_membership_type == "temporary"
        and not organization_allows_custom_membership_types(org)
    ):
        raise HTTPException(
            status_code=400,
            detail="La tessera temporanea non è disponibile per questa associazione.",
        )

    normalized_email = email.strip().lower()
    birth_date_value = _parse_birth_date(birth_date)
    ensure_adults_only_age_requirement(org, birth_date_value)
    normalized_gender = _normalize_gender(gender)
    municipality = _resolve_birth_municipality(
        birth_place=birth_place,
        birth_place_code=birth_place_code,
        birth_place_foreign=birth_place_foreign,
    )
    normalized_fiscal_code, _fiscal_code_mismatch = _validate_signup_fiscal_code(
        first_name=first_name,
        last_name=last_name,
        fiscal_code=fiscal_code,
        birth_date_value=birth_date_value,
        gender=normalized_gender,
        birth_place_code=municipality["code"],
        org_slug=org.slug,
        email=normalized_email,
    )

    existing = check_signup_allowed(
        db,
        org.id,
        normalized_email,
        request,
        fiscal_code=normalized_fiscal_code,
    )

    require_membership_document = bool(getattr(org, "require_membership_document", False))
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

    client_ip = get_client_ip(request)
    request_user_agent = request.headers.get("user-agent")

    if existing:
        if (
            existing.fiscal_code
            and existing.fiscal_code.strip().upper() != normalized_fiscal_code
        ):
            # Do not reveal which field collided and, critically, never let a
            # request identified only by an email overwrite an existing member.
            raise HTTPException(
                status_code=409,
                detail="Iscrizione o pagamento gi\u00e0 presente per questi dati.",
            )
        member = existing
        if allow_existing_update:
            member.first_name = first_name
            member.last_name = last_name
            member.email = normalized_email
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
            record_privacy_notice_acknowledgement(
                member,
                association_privacy_version=org.privacy_version,
            )
            member.signup_source = SignupSource.ASSONAM_FORM.value
            member.signup_ip = client_ip
            member.signup_user_agent = request_user_agent
            member.payment_required = True
            member.payment_status = MembershipPaymentStatus.PENDING.value
            if id_document:
                _clear_member_documents(db, member)
    else:
        member = Member(
            org_id=org.id,
            first_name=first_name,
            last_name=last_name,
            email=normalized_email,
            phone=phone,
            fiscal_code=normalized_fiscal_code,
            birth_date=birth_date_value,
            birth_place=municipality["name"],
            birth_place_code=municipality["code"],
            gender=normalized_gender,
            status=MemberStatus.PENDING_VERIFICATION,
            accepted_statute_at=datetime.utcnow(),
            accepted_statute_version=accepted_statute_version or org.statute_version,
            signup_source=SignupSource.ASSONAM_FORM.value,
            signup_ip=client_ip,
            signup_user_agent=request_user_agent,
            payment_required=True,
            payment_status=MembershipPaymentStatus.PENDING.value,
            password_hash=get_password_hash(password) if password else None,
        )
        record_privacy_notice_acknowledgement(
            member,
            association_privacy_version=org.privacy_version,
        )
        db.add(member)
        db.flush()
        if marketing_email_consent:
            grant_email_marketing_consent(
                db,
                member=member,
                source="membership_payment_signup",
                client_ip=client_ip,
                user_agent=request_user_agent,
            )

    if not existing or allow_existing_update:
        apply_membership_defaults(
            member=member,
            org=org,
            membership_type=requested_membership_type,
            reference_time=datetime.utcnow(),
            membership_fee_snapshot=organization_membership_fee_amount(
                org, requested_membership_type
            ),
        )

    if id_document and (not existing or allow_existing_update):
        sub_path = f"{org.id}/{member.id}"
        rel_path_id, size_id, sha_id = await save_upload_file(
            id_document, sub_directory=sub_path
        )
        db.add(
            MemberDocument(
                member_id=member.id,
                doc_type="identity",
                rel_path=rel_path_id,
                original_filename=id_document.filename,
                mime_type=id_document.content_type,
                size_bytes=size_id,
                sha256=sha_id,
                status="pending",
            )
        )
    return member, existing is not None


def _extract_checkout_id(payload: dict[str, Any]) -> str | None:
    for candidate in (
        payload.get("id"),
        payload.get("checkout_id"),
        payload.get("checkoutId"),
        (payload.get("data") or {}).get("id"),
        (payload.get("data") or {}).get("checkout_id"),
        (payload.get("checkout") or {}).get("id"),
    ):
        if candidate:
            return str(candidate)
    return None


def _extract_checkout_reference(payload: dict[str, Any]) -> str | None:
    for candidate in (
        payload.get("checkout_reference"),
        payload.get("checkoutReference"),
        payload.get("reference"),
        (payload.get("data") or {}).get("checkout_reference"),
        (payload.get("data") or {}).get("checkoutReference"),
    ):
        if candidate:
            return str(candidate)
    return None


@router.post(
    "/api/public/orgs/{org_slug}/membership-payment/create-checkout",
    dependencies=[Depends(sqlite_card_allocation_request_guard)],
)
async def create_membership_payment_checkout(
    request: Request,
    response: Response,
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
    password: Optional[str] = Form(None),
    membership_type: Optional[str] = Form(None),
    accept_statute: bool = Form(...),
    accepted_statute_version: Optional[str] = Form(None),
    accept_privacy: bool = Form(...),
    marketing_email_consent: bool = Form(False),
    id_document: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    request_id = get_request_id(request)
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("user-agent")
    logger.info(
        "membership_payment_checkout_start request_id=%s org_slug=%s ip_hash=%s user_agent_hash=%s",
        request_id,
        org_slug,
        hash_identifier(client_ip),
        hash_identifier(user_agent),
    )
    enforce_join_rate_limit(db, client_ip=client_ip)
    org = _get_active_org_by_slug(db, org_slug)
    if not organization_requires_membership_payment(org) or not organization_has_sumup_config(org):
        raise HTTPException(status_code=400, detail="Pagamento online non disponibile per questa associazione.")

    # Serialize signup, payment lookup and reservation in one numbering domain
    # before touching the member, including simultaneous same-email submits.
    lock_card_allocation(db, org_id=org.id, year=datetime.utcnow().year)

    normalized_email = email.strip().lower()
    preexisting_member = (
        db.query(Member)
        .filter(
            Member.org_id == org.id,
            func.lower(Member.email) == normalized_email,
            Member.deleted_at.is_(None),
        )
        .order_by(Member.id.desc())
        .first()
    )
    preexisting_payment = None
    if preexisting_member:
        preexisting_payment = (
            db.query(MembershipPayment)
            .filter(
                MembershipPayment.org_id == org.id,
                MembershipPayment.socio_id == preexisting_member.id,
                MembershipPayment.payment_kind == "initial",
            )
            .order_by(
                MembershipPayment.created_at.desc(),
                MembershipPayment.id.desc(),
            )
            .first()
        )
    existing_owner_verified = _password_proves_member_ownership(
        preexisting_member,
        password,
    ) or bool(
        preexisting_payment
        and _has_payment_status_capability(
            preexisting_payment,
            request=request,
        )
    )

    member, reused_existing_member = await _upsert_member_for_checkout(
        request=request,
        db=db,
        org=org,
        first_name=first_name,
        last_name=last_name,
        birth_date=birth_date,
        birth_place=birth_place,
        birth_place_code=birth_place_code,
        birth_place_foreign=birth_place_foreign,
        gender=gender,
        email=email,
        phone=phone,
        fiscal_code=fiscal_code,
        password=password,
        membership_type=membership_type,
        accept_statute=accept_statute,
        accepted_statute_version=accepted_statute_version,
        accept_privacy=accept_privacy,
        marketing_email_consent=marketing_email_consent,
        id_document=id_document,
        allow_existing_update=existing_owner_verified,
    )

    existing_owner_verified = bool(
        reused_existing_member
        and preexisting_member
        and preexisting_member.id == member.id
        and existing_owner_verified
    )

    latest_payment = (
        db.query(MembershipPayment)
        .filter(
            MembershipPayment.org_id == org.id,
            MembershipPayment.socio_id == member.id,
            MembershipPayment.payment_kind == "initial",
        )
        .order_by(MembershipPayment.created_at.desc(), MembershipPayment.id.desc())
        .first()
    )
    if latest_payment:
        if reuse_existing_sumup_checkout(
            db, latest_payment, org, request=request, verify_checkout=verify_sumup_checkout
        ):
            if existing_owner_verified:
                _ensure_payment_status_capability(
                    latest_payment, request=request, response=response
                )
            db.commit()
            logger.info(
                "membership_payment_checkout_reused request_id=%s org_slug=%s org_id=%s member_id=%s payment_id=%s",
                request_id, org_slug, org.id, member.id, latest_payment.id,
            )
            return {
                "payment_id": latest_payment.id,
                "hosted_checkout_url": latest_payment.hosted_checkout_url,
            }

    selected_membership_type = normalize_membership_type(membership_type)
    payment = MembershipPayment(
        org_id=org.id,
        socio_id=member.id,
        membership_year=datetime.utcnow().year,
        payment_kind="initial",
        provider="sumup",
        payment_reason=normalize_membership_payment_reason(org),
        amount=(
            organization_membership_fee_amount(org, selected_membership_type)
            or Decimal(org.membership_fee_amount).quantize(Decimal("0.01"))
        ),
        currency=org.membership_fee_currency,
        status=MembershipPaymentStatus.PENDING.value,
        source=MembershipPaymentSource.SUMUP.value,
        checkout_reference=create_checkout_reference(org, member),
    )
    db.add(payment)
    db.flush()
    reserve_payment_card(db, payment)
    if not reused_existing_member or existing_owner_verified:
        member.payment_required = True
        member.payment_status = MembershipPaymentStatus.PENDING.value
        _ensure_payment_status_capability(payment, request=request, response=response)
    # A provider timeout must leave a durable payment/reference/reservation.
    # Retrying can then look up that reference instead of charging twice.
    db.commit()

    redirect_url, return_url = build_redirect_and_return_urls(
        request=request,
        payment_id=payment.id,
    )
    try:
        create_payload = create_sumup_hosted_checkout(
            org=org,
            member=member,
            payment=payment,
            redirect_url=redirect_url,
            return_url=return_url,
        )
    except HTTPException as exc:
        persist_sumup_checkout_creation(db, payment, error=exc)
        if response.headers.get("set-cookie"):
            exc.headers = {**(exc.headers or {}), "Set-Cookie": response.headers["set-cookie"]}
        logger.warning(
            "membership_payment_checkout_sumup_http_error request_id=%s org_slug=%s org_id=%s member_id=%s payment_id=%s status_code=%s detail=%s",
            request_id,
            org_slug,
            org.id,
            member.id,
            payment.id,
            exc.status_code,
            redact_for_log(exc.detail),
        )
        raise
    except Exception as exc:
        persist_sumup_checkout_creation(db, payment, error=exc)
        logger.exception(
            "membership_payment_checkout_sumup_unexpected_error request_id=%s org_slug=%s org_id=%s member_id=%s payment_id=%s",
            request_id,
            org_slug,
            org.id,
            member.id,
            payment.id,
        )
        raise HTTPException(
            status_code=502,
            detail="Verifica del pagamento in corso. Riprova tra poco.",
            headers={"Set-Cookie": response.headers["set-cookie"]} if response.headers.get("set-cookie") else None,
        ) from exc
    persist_sumup_checkout_creation(db, payment, payload=create_payload)
    if not payment.hosted_checkout_url or not payment.sumup_checkout_id:
        logger.warning(
            "membership_payment_checkout_sumup_incomplete request_id=%s org_slug=%s org_id=%s member_id=%s payment_id=%s has_url=%s has_checkout_id=%s",
            request_id,
            org_slug,
            org.id,
            member.id,
            payment.id,
            bool(payment.hosted_checkout_url),
            bool(payment.sumup_checkout_id),
        )
        raise HTTPException(
            status_code=502,
            detail="Risposta checkout SumUp incompleta.",
            headers={"Set-Cookie": response.headers["set-cookie"]} if response.headers.get("set-cookie") else None,
        )

    audit.log_operation(
        db,
        action="membership_payment.checkout_created",
        entity_type="membership_payment",
        entity_id=payment.id,
        metadata={
            "org_id": org.id,
            "member_id": member.id,
            "checkout_reference": payment.checkout_reference,
            "sumup_checkout_id": payment.sumup_checkout_id,
            "request_id": request_id,
        },
        ip=client_ip,
        user_agent=user_agent,
    )
    db.commit()
    logger.info(
        "membership_payment_checkout_created request_id=%s org_slug=%s org_id=%s member_id=%s payment_id=%s",
        request_id,
        org_slug,
        org.id,
        member.id,
        payment.id,
    )
    return {"payment_id": payment.id, "hosted_checkout_url": payment.hosted_checkout_url}


@router.get("/api/public/membership-payments/{payment_id}/status")
def get_membership_payment_status(
    request: Request,
    response: Response,
    payment_id: int,
    db: Session = Depends(get_db),
):
    enforce_payment_status_rate_limit(db, client_ip=get_client_ip(request))
    payment = db.query(MembershipPayment).filter(MembershipPayment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Pagamento non trovato.")
    has_capability = _has_payment_status_capability(
        payment,
        request=request,
    )
    if not has_capability and not _can_claim_recent_legacy_sumup_payment(
        payment,
        request=request,
    ):
        raise HTTPException(status_code=404, detail="Pagamento non trovato.")
    if not has_capability:
        # Lazy-upgrade only the legitimate browser that created the checkout.
        # The migration fallback disappears automatically at its seven-day TTL.
        _ensure_payment_status_capability(
            payment,
            request=request,
            response=response,
        )
        db.commit()
    return build_membership_payment_status_payload(payment, request=request)


@router.post(
    "/api/webhooks/sumup",
    dependencies=[Depends(sqlite_card_allocation_request_guard)],
)
def handle_sumup_webhook(
    request: Request,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
):
    checkout_id = _extract_checkout_id(payload)
    checkout_reference = _extract_checkout_reference(payload)

    query = db.query(MembershipPayment)
    if checkout_id:
        query = query.filter(MembershipPayment.sumup_checkout_id == checkout_id)
    elif checkout_reference:
        query = query.filter(MembershipPayment.checkout_reference == checkout_reference)
    else:
        logger.warning(
            "sumup_webhook_ignored reason=missing_identifiers field_count=%s",
            len(payload),
        )
        return {"ok": True, "ignored": True}

    payment = query.order_by(MembershipPayment.id.desc()).first()
    if not payment:
        logger.warning(
            "sumup_webhook_ignored reason=payment_not_found checkout_id_hash=%s checkout_reference_hash=%s",
            hash_identifier(checkout_id),
            hash_identifier(checkout_reference),
        )
        return {"ok": True, "ignored": True}

    org = db.query(Organization).filter(Organization.id == payment.org_id).first()
    if not org:
        return {"ok": True, "ignored": True}

    # Provider I/O precedes domain/payment locks; the state updater reloads
    # under those locks and cannot regress a concurrent paid confirmation.
    verified_payload = verify_sumup_checkout(org, payment)
    fulfillment = update_payment_state_from_sumup(
        db=db,
        payment=payment,
        org=org,
        verified_payload=verified_payload,
        request=request,
    )
    log_sumup_webhook_event(db=db, payment=payment, payload=payload, request=request)
    db.commit()
    return {
        "ok": True,
        "payment_id": payment.id,
        "payment_status": payment.status,
        "fulfilled": fulfillment.issued_card,
    }
