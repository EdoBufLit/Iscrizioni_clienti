from __future__ import annotations

import logging
import os
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import audit
from app.db import get_db
from app.middleware import get_client_ip, get_request_id, join_limiter
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
from app.security import MIN_MEMBER_PASSWORD_LENGTH, get_password_hash
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
from app.utils import save_upload_file

logger = logging.getLogger(__name__)

router = APIRouter()


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
        try:
            old_path = os.path.join(save_upload_file.__globals__["settings"].UPLOAD_DIR, old_doc.rel_path)
            if os.path.exists(old_path):
                os.remove(old_path)
        except OSError:
            logger.warning("Failed to delete old membership payment doc file: %s", old_doc.rel_path)
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
    id_document: UploadFile | None,
) -> Member:
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
        member = existing
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
        member.accepted_statute_version = accepted_statute_version or org.statute_version
        member.accepted_privacy_at = datetime.utcnow()
        member.accepted_privacy_version = org.privacy_version
        member.signup_source = SignupSource.ASSONAM_FORM.value
        member.signup_ip = client_ip
        member.signup_user_agent = request_user_agent
        member.payment_required = True
        member.payment_status = MembershipPaymentStatus.PENDING.value
        if password:
            member.password_hash = get_password_hash(password)
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
            accepted_privacy_at=datetime.utcnow(),
            accepted_privacy_version=org.privacy_version,
            signup_source=SignupSource.ASSONAM_FORM.value,
            signup_ip=client_ip,
            signup_user_agent=request_user_agent,
            payment_required=True,
            payment_status=MembershipPaymentStatus.PENDING.value,
            password_hash=get_password_hash(password) if password else None,
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

    if id_document:
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
    return member


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


@router.post("/api/public/orgs/{org_slug}/membership-payment/create-checkout")
async def create_membership_payment_checkout(
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
    password: Optional[str] = Form(None),
    membership_type: Optional[str] = Form(None),
    accept_statute: bool = Form(...),
    accepted_statute_version: Optional[str] = Form(None),
    accept_privacy: bool = Form(...),
    id_document: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    join_limiter.check(get_client_ip(request))
    org = _get_active_org_by_slug(db, org_slug)
    if not organization_requires_membership_payment(org) or not organization_has_sumup_config(org):
        raise HTTPException(status_code=400, detail="Pagamento online non disponibile per questa associazione.")

    member = await _upsert_member_for_checkout(
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
        id_document=id_document,
    )

    latest_payment = (
        db.query(MembershipPayment)
        .filter(
            MembershipPayment.org_id == org.id,
            MembershipPayment.socio_id == member.id,
        )
        .order_by(MembershipPayment.created_at.desc(), MembershipPayment.id.desc())
        .first()
    )
    if latest_payment:
        if payment_status_is_paid(latest_payment.status):
            raise HTTPException(status_code=409, detail="La quota associativa risulta già pagata.")
        if latest_payment.status == MembershipPaymentStatus.PENDING.value and latest_payment.sumup_checkout_id:
            verified_payload = verify_sumup_checkout(org, latest_payment)
            update_payment_state_from_sumup(
                db=db,
                payment=latest_payment,
                org=org,
                verified_payload=verified_payload,
            )
            if payment_status_is_paid(latest_payment.status):
                db.commit()
                raise HTTPException(status_code=409, detail="La quota associativa risulta già pagata.")
            if latest_payment.status == MembershipPaymentStatus.PENDING.value and latest_payment.hosted_checkout_url:
                db.commit()
                return {
                    "payment_id": latest_payment.id,
                    "hosted_checkout_url": latest_payment.hosted_checkout_url,
                }

    selected_membership_type = normalize_membership_type(membership_type)
    payment = MembershipPayment(
        org_id=org.id,
        socio_id=member.id,
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

    redirect_url, return_url = build_redirect_and_return_urls(
        request=request,
        payment_id=payment.id,
    )
    create_payload = create_sumup_hosted_checkout(
        org=org,
        member=member,
        payment=payment,
        redirect_url=redirect_url,
        return_url=return_url,
    )
    hosted_checkout = create_payload.get("hosted_checkout") or {}
    hosted_checkout_url = (
        create_payload.get("hosted_checkout_url")
        or hosted_checkout.get("checkout_url")
        or hosted_checkout.get("hosted_checkout_url")
        or create_payload.get("checkout_url")
    )
    sumup_checkout_id = create_payload.get("id") or create_payload.get("checkout_id")
    if not hosted_checkout_url or not sumup_checkout_id:
        raise HTTPException(status_code=502, detail="Risposta checkout SumUp incompleta.")

    payment.sumup_checkout_id = str(sumup_checkout_id)
    payment.hosted_checkout_url = str(hosted_checkout_url)
    payment.raw_create_response = create_payload
    member.payment_required = True
    member.payment_status = MembershipPaymentStatus.PENDING.value

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
            "request_id": get_request_id(request),
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return {"payment_id": payment.id, "hosted_checkout_url": payment.hosted_checkout_url}


@router.get("/api/public/membership-payments/{payment_id}/status")
def get_membership_payment_status(
    request: Request,
    payment_id: int,
    db: Session = Depends(get_db),
):
    payment = db.query(MembershipPayment).filter(MembershipPayment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Pagamento non trovato.")
    return build_membership_payment_status_payload(payment, request=request)


@router.post("/api/webhooks/sumup")
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
        logger.warning("sumup_webhook_ignored reason=missing_identifiers payload=%s", payload)
        return {"ok": True, "ignored": True}

    payment = query.order_by(MembershipPayment.id.desc()).first()
    if not payment:
        logger.warning(
            "sumup_webhook_ignored reason=payment_not_found checkout_id=%s checkout_reference=%s",
            checkout_id,
            checkout_reference,
        )
        return {"ok": True, "ignored": True}

    org = db.query(Organization).filter(Organization.id == payment.org_id).first()
    if not org:
        return {"ok": True, "ignored": True}

    log_sumup_webhook_event(db=db, payment=payment, payload=payload, request=request)
    verified_payload = verify_sumup_checkout(org, payment)
    fulfillment = update_payment_state_from_sumup(
        db=db,
        payment=payment,
        org=org,
        verified_payload=verified_payload,
        request=request,
    )
    db.commit()
    return {
        "ok": True,
        "payment_id": payment.id,
        "payment_status": payment.status,
        "fulfilled": fulfillment.issued_card,
    }
