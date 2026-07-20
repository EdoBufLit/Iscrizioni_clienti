from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

import requests
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app import audit
from app.config import settings
from app.models import (
    MembershipPayment,
    MembershipPaymentSource,
    MembershipPaymentStatus,
    Member,
    MemberPayment,
    MemberStatus,
    Organization,
    OrganizationPaymentProvider,
)
from app.services.card_allocation import allocate_next_card
from app.services.annual_memberships import sync_annual_membership_term
from app.services.member_membership import (
    MEMBERSHIP_TYPE_ANNUAL,
    apply_membership_defaults,
    membership_amount_to_float,
    organization_allows_custom_membership_types,
    organization_membership_fee_amount,
    resolve_temporary_duration,
)
from app.services.member_card_delivery import (
    build_member_card_access_payload,
    queue_member_card_email,
)
from app.services.credential_crypto import decrypt_secret, encrypt_secret

logger = logging.getLogger(__name__)

PAID_MEMBERSHIP_STATUSES = {
    MembershipPaymentStatus.COMPLETED.value,
    MembershipPaymentStatus.MANUAL_COMPLETED.value,
}
RETRYABLE_MEMBERSHIP_STATUSES = {
    MembershipPaymentStatus.FAILED.value,
    MembershipPaymentStatus.CANCELLED.value,
    MembershipPaymentStatus.EXPIRED.value,
}
TERMINAL_MEMBERSHIP_STATUSES = PAID_MEMBERSHIP_STATUSES | RETRYABLE_MEMBERSHIP_STATUSES


@dataclass
class FulfillmentResult:
    issued_card: bool
    reason: str


def encrypt_sumup_api_key(raw_key: str) -> str:
    return encrypt_secret(
        raw_key,
        empty_detail="Chiave API SumUp obbligatoria.",
        config_detail="Configurazione cifratura credenziali SumUp non disponibile.",
    )


def decrypt_sumup_api_key(encrypted_key: str | None) -> str:
    return decrypt_secret(
        encrypted_key,
        missing_detail="Chiave API SumUp non configurata.",
        invalid_detail="Chiave API SumUp non decifrabile. Riconfigurare la chiave.",
        config_detail="Configurazione cifratura credenziali SumUp non disponibile.",
    )


def decimal_to_str(value: Decimal | float | int | str | None) -> str | None:
    if value is None:
        return None
    return str(Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def payment_status_is_paid(status: str | None) -> bool:
    normalized = (status or "").strip().lower()
    return normalized in PAID_MEMBERSHIP_STATUSES


def organization_requires_membership_payment(org: Organization | None) -> bool:
    if org is None:
        return False
    provider = (getattr(org, "payment_provider", None) or "").strip().lower()
    return (
        bool(getattr(org, "payment_required_before_card", False))
        and bool(getattr(org, "sumup_enabled", False))
        and provider == OrganizationPaymentProvider.SUMUP.value
    )


def organization_has_sumup_config(org: Organization | None) -> bool:
    if org is None:
        return False
    provider = (getattr(org, "payment_provider", None) or "").strip().lower()
    return (
        provider == OrganizationPaymentProvider.SUMUP.value
        and bool(getattr(org, "sumup_enabled", False))
        and bool(getattr(org, "membership_payment_label", None))
        and getattr(org, "membership_fee_amount", None) is not None
        and bool(getattr(org, "membership_fee_currency", None))
        and bool(getattr(org, "payment_button_label", None))
        and bool(getattr(org, "sumup_api_key_encrypted", None))
    )


def serialize_public_membership_payment(org: Organization | None) -> dict[str, Any]:
    if org is None:
        return {
            "enabled": False,
            "required": False,
            "label": None,
            "amount": None,
            "currency": None,
            "button_label": None,
            "custom_types_enabled": False,
            "temporary_amount": None,
            "temporary_duration_value": 1,
            "temporary_duration_unit": "days",
        }
    amount = getattr(org, "membership_fee_amount", None)
    temporary_duration_value, temporary_duration_unit = resolve_temporary_duration(org)
    return {
        "enabled": organization_has_sumup_config(org),
        "required": organization_requires_membership_payment(org),
        "label": getattr(org, "membership_payment_label", None),
        "amount": float(amount) if amount is not None else None,
        "currency": getattr(org, "membership_fee_currency", None),
        "button_label": getattr(org, "payment_button_label", None),
        "custom_types_enabled": organization_allows_custom_membership_types(org),
        "temporary_amount": membership_amount_to_float(
            getattr(org, "temporary_membership_fee_amount", None)
        ),
        "temporary_duration_value": temporary_duration_value,
        "temporary_duration_unit": temporary_duration_unit,
    }


def serialize_super_admin_membership_payment_settings(org: Organization) -> dict[str, Any]:
    amount = getattr(org, "membership_fee_amount", None)
    return {
        "payment_provider": getattr(org, "payment_provider", None)
        or OrganizationPaymentProvider.NONE.value,
        "payment_required_before_card": bool(
            getattr(org, "payment_required_before_card", False)
        ),
        "membership_payment_label": getattr(org, "membership_payment_label", None),
        "membership_fee_amount": float(amount) if amount is not None else None,
        "membership_fee_currency": getattr(org, "membership_fee_currency", "EUR"),
        "payment_button_label": getattr(org, "payment_button_label", "Paga con carta"),
        "temporary_membership_fee_amount": membership_amount_to_float(
            getattr(org, "temporary_membership_fee_amount", None)
        ),
        "custom_membership_types_enabled": bool(
            getattr(org, "custom_membership_types_enabled", False)
        ),
        "temporary_membership_duration_value": resolve_temporary_duration(org)[0],
        "temporary_membership_duration_unit": resolve_temporary_duration(org)[1],
        "sumup_enabled": bool(getattr(org, "sumup_enabled", False)),
        "sumup_api_key_configured": bool(getattr(org, "sumup_api_key_encrypted", None)),
        "sumup_api_key_last4": getattr(org, "sumup_api_key_last4", None),
        "sumup_api_key_configured_at": (
            org.sumup_api_key_configured_at.isoformat()
            if getattr(org, "sumup_api_key_configured_at", None)
            else None
        ),
    }


def _sumup_headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _sumup_url(path: str) -> str:
    base_url = settings.SUMUP_API_BASE_URL.rstrip("/")
    return f"{base_url}/{path.lstrip('/')}"


def _sumup_request(
    *,
    method: str,
    path: str,
    api_key: str,
    json_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    try:
        response = requests.request(
            method=method.upper(),
            url=_sumup_url(path),
            headers=_sumup_headers(api_key),
            json=json_payload,
            timeout=settings.SUMUP_REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        logger.exception("sumup_request_error method=%s path=%s", method, path)
        raise HTTPException(
            status_code=502,
            detail="Errore comunicazione con SumUp.",
        ) from exc

    try:
        payload = response.json() if response.text else {}
    except ValueError:
        payload = {}

    if response.status_code >= 400:
        detail = payload.get("message") or payload.get("error_message") or payload.get("error")
        raise HTTPException(
            status_code=400 if response.status_code < 500 else 502,
            detail=detail or "Errore risposta SumUp.",
        )
    return payload


def fetch_sumup_merchant_profile(api_key: str) -> dict[str, Any]:
    return _sumup_request(method="GET", path="me", api_key=api_key)


def verify_sumup_api_key(api_key: str) -> dict[str, Any]:
    payload = fetch_sumup_merchant_profile(api_key)
    merchant_profile = payload.get("merchant_profile") or payload
    merchant_code = (
        merchant_profile.get("merchant_code")
        or payload.get("merchant_code")
        or payload.get("id")
    )
    if not merchant_code:
        raise HTTPException(
            status_code=400,
            detail="La chiave SumUp non restituisce un merchant_code valido.",
        )
    return payload


def create_checkout_reference(org: Organization, member: Member) -> str:
    return f"org{org.id}-member{member.id}-{uuid.uuid4().hex[:12]}"


def _build_sumup_description(org: Organization) -> str:
    payment_label = (org.membership_payment_label or "").strip()
    org_name = (org.club_display_name or org.name or "").strip()
    if payment_label and org_name:
        return f"{payment_label} - {org_name}"[:255]
    return (payment_label or org_name or "Quota associativa")[:255]


def create_sumup_hosted_checkout(
    *,
    org: Organization,
    member: Member,
    payment: MembershipPayment,
    redirect_url: str,
    return_url: str,
) -> dict[str, Any]:
    api_key = decrypt_sumup_api_key(org.sumup_api_key_encrypted)
    profile = fetch_sumup_merchant_profile(api_key)
    merchant_profile = profile.get("merchant_profile") or profile
    merchant_code = (
        merchant_profile.get("merchant_code")
        or profile.get("merchant_code")
        or profile.get("id")
    )
    if not merchant_code:
        raise HTTPException(status_code=400, detail="Merchant code SumUp non disponibile.")

    # The payment row is the immutable financial snapshot. This matters for
    # renewals created before an association changes the following year's fee.
    amount = Decimal(payment.amount).quantize(Decimal("0.01"))
    payload = {
        "checkout_reference": payment.checkout_reference,
        "amount": float(amount),
        "currency": org.membership_fee_currency,
        "merchant_code": merchant_code,
        "description": _build_sumup_description(org),
        "pay_to_email": getattr(member, "email", None),
        "redirect_url": redirect_url,
        "return_url": return_url,
        "hosted_checkout": {"enabled": True},
    }
    create_payload = _sumup_request(
        method="POST",
        path="checkouts",
        api_key=api_key,
        json_payload=payload,
    )
    return create_payload


def verify_sumup_checkout(org: Organization, payment: MembershipPayment) -> dict[str, Any]:
    if not payment.sumup_checkout_id:
        raise HTTPException(status_code=400, detail="Checkout SumUp non associato al pagamento.")
    api_key = decrypt_sumup_api_key(org.sumup_api_key_encrypted)
    return _sumup_request(
        method="GET",
        path=f"checkouts/{payment.sumup_checkout_id}",
        api_key=api_key,
    )


def map_sumup_checkout_status(raw_status: str | None) -> str:
    normalized = (raw_status or "").strip().upper()
    if normalized == "PAID":
        return MembershipPaymentStatus.COMPLETED.value
    if normalized == "FAILED":
        return MembershipPaymentStatus.FAILED.value
    if normalized == "CANCELLED":
        return MembershipPaymentStatus.CANCELLED.value
    if normalized == "EXPIRED":
        return MembershipPaymentStatus.EXPIRED.value
    return MembershipPaymentStatus.PENDING.value


def sync_member_card_payment_flags(member: Member, org: Organization) -> None:
    is_paid = payment_status_is_paid(member.payment_status)
    if not organization_requires_membership_payment(org) and not is_paid:
        member.card_is_paid = False
        member.card_paid_at = None
        member.card_payment_status = None
        return
    member.card_is_paid = is_paid
    member.card_paid_at = member.payment_completed_at if is_paid else None
    member.card_payment_status = member.payment_status if member.payment_status else None


def _workflow_ready_for_fulfillment(member: Member, org: Organization) -> bool:
    if member.status == MemberStatus.REJECTED:
        return False
    if bool(getattr(org, "auto_approve_signup", False)):
        return True
    return member.decision_at is not None


def _lock_member_for_fulfillment(db: Session, member: Member) -> Member:
    member_id = getattr(member, "id", None)
    if member_id is None:
        db.flush()
        member_id = getattr(member, "id", None)
    if member_id is None:
        return member

    db.flush()
    query = db.query(Member).filter(Member.id == member_id)
    try:
        query = query.with_for_update()
    except Exception as exc:
        logger.debug("Member fulfillment lock unavailable: %s", exc)

    locked_member = query.first()
    if locked_member is None:
        return member

    db.refresh(locked_member)
    return locked_member


def maybe_fulfill_member_card(
    *,
    db: Session,
    member: Member,
    org: Organization,
    request: Request | None = None,
) -> FulfillmentResult:
    member = _lock_member_for_fulfillment(db, member)

    if organization_requires_membership_payment(org) and not payment_status_is_paid(
        member.payment_status
    ):
        if member.status != MemberStatus.REJECTED:
            member.status = MemberStatus.PENDING_CARDS
        return FulfillmentResult(issued_card=False, reason="payment_pending")

    if not _workflow_ready_for_fulfillment(member, org):
        return FulfillmentResult(issued_card=False, reason="workflow_not_ready")

    issued_new_card = False
    if member.card_no is None:
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
            issued_new_card = True
        except HTTPException as exc:
            if exc.status_code == 409:
                member.status = MemberStatus.PENDING_CARDS
                return FulfillmentResult(issued_card=False, reason="card_stock_exhausted")
            raise

    if member.card_year is None:
        member.card_year = datetime.utcnow().year
    if not member.joined_at:
        member.joined_at = datetime.utcnow()
    if not getattr(member, "membership_type", None):
        apply_membership_defaults(
            member=member,
            org=org,
            membership_type=MEMBERSHIP_TYPE_ANNUAL,
            reference_time=member.joined_at,
            membership_fee_snapshot=getattr(member, "membership_fee_snapshot", None),
        )
    elif getattr(member, "membership_fee_snapshot", None) is None or (
        getattr(member, "membership_type", None) == "temporary"
        and getattr(member, "valid_until", None) is None
    ):
        apply_membership_defaults(
            member=member,
            org=org,
            membership_type=getattr(member, "membership_type", None),
            reference_time=getattr(member, "valid_from", None) or member.joined_at,
            membership_fee_snapshot=getattr(member, "membership_fee_snapshot", None),
        )
    if getattr(member, "valid_from", None) is None:
        member.valid_from = member.joined_at
    member.status = MemberStatus.ACTIVE
    sync_annual_membership_term(db, member, source="membership_payment")

    if request is not None:
        try:
            backend_base_url = (settings.BASE_URL or str(request.base_url)).rstrip("/")
            frontend_base_url = (settings.FRONTEND_URL or backend_base_url).rstrip("/")
            access_payload = build_member_card_access_payload(
                member=member,
                org=org,
                backend_base_url=backend_base_url,
                frontend_base_url=frontend_base_url,
            )
            queue_member_card_email(
                db,
                request,
                member.id,
                require_active=True,
                require_approved_document=False,
                email_type="member_card_active",
                dedupe_key_prefix="member_card_active",
                card_view_url_override=access_payload["active_card_page_url"],
            )
        except Exception:
            logger.exception(
                "membership_payment_card_email_failed member_id=%s org_id=%s",
                member.id,
                member.org_id,
            )
    return FulfillmentResult(
        issued_card=issued_new_card,
        reason="fulfilled" if issued_new_card else "already_fulfilled",
    )


def apply_membership_payment_completion(
    *,
    db: Session,
    payment: MembershipPayment,
    member: Member | None,
    org: Organization,
    verified_payload: dict[str, Any],
    request: Request | None = None,
) -> FulfillmentResult:
    payment.status = MembershipPaymentStatus.COMPLETED.value
    payment.raw_last_status_response = verified_payload
    if payment.confirmed_at is None:
        payment.confirmed_at = datetime.utcnow()

    if member is None:
        return FulfillmentResult(issued_card=False, reason="member_missing")

    if (
        getattr(payment, "payment_kind", None) == "renewal"
        and getattr(payment, "annual_term_id", None) is not None
    ):
        from app.services.renewals import complete_renewal_payment

        issued = complete_renewal_payment(db, payment=payment)
        term = payment.annual_term
        return FulfillmentResult(
            issued_card=issued,
            reason=(
                "fulfilled"
                if issued
                else "already_fulfilled"
                if term is not None and term.card_no is not None
                else "card_stock_exhausted"
            ),
        )

    member.payment_required = organization_requires_membership_payment(org)
    member.payment_status = MembershipPaymentStatus.COMPLETED.value
    if member.payment_completed_at is None:
        member.payment_completed_at = datetime.utcnow()
    sync_member_card_payment_flags(member, org)
    fulfillment = maybe_fulfill_member_card(db=db, member=member, org=org, request=request)
    if member.card_year is not None:
        payment.membership_year = int(member.card_year)
        db.flush()
        term = sync_annual_membership_term(db, member, source="membership_payment")
        if term is not None:
            payment.annual_term_id = term.id
    return fulfillment


def update_payment_state_from_sumup(
    *,
    db: Session,
    payment: MembershipPayment,
    org: Organization,
    verified_payload: dict[str, Any],
    request: Request | None = None,
) -> FulfillmentResult:
    mapped_status = map_sumup_checkout_status(verified_payload.get("status"))
    payment.raw_last_status_response = verified_payload
    member = payment.member

    if mapped_status == MembershipPaymentStatus.COMPLETED.value:
        return apply_membership_payment_completion(
            db=db,
            payment=payment,
            member=member,
            org=org,
            verified_payload=verified_payload,
            request=request,
        )

    payment.status = mapped_status
    if (
        member is not None
        and getattr(payment, "payment_kind", None) != "renewal"
        and mapped_status in {
            MembershipPaymentStatus.FAILED.value,
            MembershipPaymentStatus.CANCELLED.value,
            MembershipPaymentStatus.EXPIRED.value,
        }
    ):
        member.payment_required = organization_requires_membership_payment(org)
        member.payment_status = mapped_status
        sync_member_card_payment_flags(member, org)
    return FulfillmentResult(issued_card=False, reason=mapped_status)


def latest_membership_payment(member: Member | None) -> MembershipPayment | None:
    if member is None:
        return None
    payments = sorted(
        member.membership_payments or [],
        key=lambda item: (item.created_at or datetime.min, item.id or 0),
        reverse=True,
    )
    return payments[0] if payments else None


def apply_manual_membership_payment(
    *,
    db: Session,
    member: Member,
    org: Organization,
    admin_id: int,
    amount: Decimal,
    currency: str,
    reason: str | None,
    notes: str | None,
    request: Request | None = None,
) -> tuple[MembershipPayment, FulfillmentResult, bool]:
    existing_paid_payment = (
        db.query(MembershipPayment)
        .filter(
            MembershipPayment.socio_id == member.id,
            MembershipPayment.org_id == org.id,
            MembershipPayment.payment_kind == "initial",
            MembershipPayment.status.in_(list(PAID_MEMBERSHIP_STATUSES)),
        )
        .order_by(MembershipPayment.confirmed_at.desc(), MembershipPayment.id.desc())
        .first()
    )
    if existing_paid_payment:
        member.payment_required = organization_requires_membership_payment(org)
        member.payment_status = existing_paid_payment.status
        member.payment_completed_at = member.payment_completed_at or existing_paid_payment.confirmed_at
        sync_member_card_payment_flags(member, org)
        fulfillment = maybe_fulfill_member_card(
            db=db, member=member, org=org, request=request
        )
        return existing_paid_payment, fulfillment, False

    payment = MembershipPayment(
        org_id=org.id,
        socio_id=member.id,
        membership_year=int(member.card_year) if member.card_year else datetime.utcnow().year,
        payment_kind="initial",
        provider=OrganizationPaymentProvider.SUMUP.value,
        payment_reason=reason,
        amount=amount,
        currency=currency,
        status=MembershipPaymentStatus.MANUAL_COMPLETED.value,
        source=MembershipPaymentSource.MANUAL.value,
        confirmed_at=datetime.utcnow(),
        manual_marked_paid_by_user_id=admin_id,
        notes=notes,
    )
    db.add(payment)

    member.payment_required = organization_requires_membership_payment(org)
    member.payment_status = MembershipPaymentStatus.MANUAL_COMPLETED.value
    member.payment_completed_at = datetime.utcnow()
    sync_member_card_payment_flags(member, org)

    fulfillment = maybe_fulfill_member_card(db=db, member=member, org=org, request=request)
    if member.card_year is not None:
        payment.membership_year = int(member.card_year)
        db.flush()
        term = sync_annual_membership_term(db, member, source="membership_payment")
        if term is not None:
            payment.annual_term_id = term.id
    return payment, fulfillment, True


def build_membership_payment_status_payload(
    payment: MembershipPayment,
    *,
    request: Request | None = None,
) -> dict[str, Any]:
    member = payment.member
    is_paid = payment_status_is_paid(payment.status)
    card_status = "pending"
    if member is not None:
        if member.status == MemberStatus.ACTIVE and member.card_no is not None:
            card_status = "issued"
        elif member.decision_at is not None:
            card_status = "awaiting_payment_confirmation" if not is_paid else "queued"

    if payment.status == MembershipPaymentStatus.COMPLETED.value:
        message = "Pagamento confermato."
    elif payment.status == MembershipPaymentStatus.MANUAL_COMPLETED.value:
        message = "Pagamento registrato manualmente."
    elif payment.status == MembershipPaymentStatus.EXPIRED.value:
        message = "Checkout scaduto. Crea un nuovo pagamento."
    elif payment.status == MembershipPaymentStatus.CANCELLED.value:
        message = "Pagamento annullato."
    elif payment.status == MembershipPaymentStatus.FAILED.value:
        message = "Pagamento non riuscito."
    else:
        message = "Pagamento in verifica."

    payload = {
        "payment_status": payment.status,
        "is_paid": is_paid,
        "card_status": card_status,
        "message": message,
        "can_retry": payment.status in RETRYABLE_MEMBERSHIP_STATUSES,
    }
    if request is not None and member is not None and member.card_no is not None and member.card_year is not None:
        backend_base_url = (settings.BASE_URL or str(request.base_url)).rstrip("/")
        frontend_base_url = (settings.FRONTEND_URL or backend_base_url).rstrip("/")
        payload.update(
            build_member_card_access_payload(
                member=member,
                org=member.organization,
                backend_base_url=backend_base_url,
                frontend_base_url=frontend_base_url,
            )
        )
    return payload


def log_sumup_webhook_event(
    *,
    db: Session,
    payment: MembershipPayment | None,
    payload: dict[str, Any],
    request: Request,
) -> None:
    audit.log_operation(
        db,
        action="membership_payment.sumup_webhook",
        entity_type="membership_payment",
        entity_id=payment.id if payment else None,
        metadata={"payload": payload},
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


def build_redirect_and_return_urls(
    *,
    request: Request,
    payment_id: int,
) -> tuple[str, str]:
    frontend_base = (settings.FRONTEND_URL or "").strip().rstrip("/") or str(
        request.base_url
    ).rstrip("/")
    backend_base = (settings.BASE_URL or "").strip().rstrip("/") or str(
        request.base_url
    ).rstrip("/")
    redirect_url = (
        f"{frontend_base}/iscrizione/pagamento/esito?payment_id={payment_id}"
    )
    return_url = f"{backend_base}/api/webhooks/sumup"
    return redirect_url, return_url


def normalize_membership_payment_reason(org: Organization) -> str:
    return (org.membership_payment_label or "Quota associativa").strip()


def create_legacy_manual_member_payment(
    *,
    db: Session,
    member: Member,
    org: Organization,
    admin_id: int,
    amount: Decimal,
    method: str,
    notes: str | None,
) -> MemberPayment:
    amount_cents = int((amount * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    legacy_payment = MemberPayment(
        member_id=member.id,
        org_id=org.id,
        admin_id=admin_id,
        amount_cents=amount_cents,
        method=method,
        paid_at=datetime.utcnow(),
        notes=notes,
    )
    db.add(legacy_payment)
    return legacy_payment
