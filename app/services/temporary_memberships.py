"""Repeat temporary-card purchases for existing, approved member accounts."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from types import SimpleNamespace

from fastapi import HTTPException, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    AnnualMembershipTerm, Member, MemberNotification, MemberStatus,
    MembershipPayment, Organization, OrgAdminNotification, AdminUser, AdminRole,
    TemporaryMembershipPurchase,
)
from app.services.annual_memberships import as_rome_datetime, sync_annual_membership_term
from app.services.card_allocation import allocate_next_card, lock_card_allocation
from app.services.member_activity import is_member_active
from app.services.member_membership import resolve_temporary_duration

OPEN_STATUSES = ("payment_pending", "manual_pending", "paid_waiting_card")
PAID_STATUSES = ("completed", "manual_completed")


def utc(value: datetime | None = None) -> datetime:
    value = value or datetime.now(timezone.utc)
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def current_purchase(db: Session, member_id: int) -> TemporaryMembershipPurchase | None:
    return db.query(TemporaryMembershipPurchase).filter(
        TemporaryMembershipPurchase.member_id == member_id,
        TemporaryMembershipPurchase.status.in_(OPEN_STATUSES),
    ).order_by(TemporaryMembershipPurchase.id.desc()).first()


def assert_no_temporary_purchase(db: Session, member: Member) -> None:
    pending = current_purchase(db, member.id)
    if pending:
        raise HTTPException(status_code=409, detail="Completa prima l'acquisto della tessera temporanea già in corso.")
    if member.membership_type == "temporary" and is_member_active(member):
        raise HTTPException(status_code=409, detail="Hai già una tessera temporanea valida.")


def blocking_annual_term(db: Session, member_id: int, *, now: datetime | None = None) -> AnnualMembershipTerm | None:
    today = as_rome_datetime(now).date()
    return db.query(AnnualMembershipTerm).filter(
        AnnualMembershipTerm.member_id == member_id,
        AnnualMembershipTerm.status.notin_(("expired", "cancelled")),
        or_(
            (AnnualMembershipTerm.source == "renewal") & AnnualMembershipTerm.status.in_(
                ("due", "payment_pending", "approved_waiting_card", "paid_waiting_card", "scheduled")
            ),
            (AnnualMembershipTerm.card_no.isnot(None)) & (AnnualMembershipTerm.valid_through >= today),
        ),
    ).order_by(AnnualMembershipTerm.membership_year.desc()).first()


def _approved_account(member: Member) -> bool:
    status = member.status.value if isinstance(member.status, MemberStatus) else str(member.status)
    return bool(member.deleted_at is None and status in ("active", "expired")
                and member.card_no is not None and member.card_year is not None)


def _methods(org: Organization) -> list[str]:
    from app.services.membership_payments import organization_has_sumup_config
    if org.cash_only_signup_payment:
        return ["contanti"]
    return (["sumup"] if organization_has_sumup_config(org) else []) + ["bonifico", "contanti"]


def offer(db: Session, member: Member) -> dict[str, Any]:
    org = member.organization
    pending = current_purchase(db, member.id)
    annual = blocking_annual_term(db, member.id)
    amount = Decimal(str(org.temporary_membership_fee_amount or 0)) if org else Decimal(0)
    value, unit = resolve_temporary_duration(org)
    enabled = bool(org and org.is_active and org.custom_membership_types_enabled)
    reason = None
    if not enabled:
        reason = "Le tessere temporanee non sono disponibili per questa associazione."
    elif amount <= 0:
        reason = "L'associazione deve configurare il prezzo della tessera temporanea."
    elif not _approved_account(member):
        reason = "L'acquisto è riservato ai soci già approvati e tesserati."
    elif is_member_active(member):
        reason = "Hai già una tessera valida."
    elif annual:
        reason = "Completa prima il rinnovo annuale già in corso."
    elif db.query(MembershipPayment.id).filter(
        MembershipPayment.socio_id == member.id,
        MembershipPayment.payment_kind != "temporary",
        or_(MembershipPayment.reservation_state == "held", MembershipPayment.status.in_(("pending", "failed"))),
    ).first():
        reason = "Un altro pagamento tessera è ancora in verifica."
    elif pending:
        reason = "Riprendi l'acquisto già in corso."
    return {
        "enabled": enabled,
        "eligible": reason is None,
        "reason": reason,
        "offer": {
            "amount": float(amount), "currency": org.membership_fee_currency or "EUR",
            "duration_value": value, "duration_unit": unit,
            "duration_label": f"{value} {'ore' if unit == 'hours' else 'giorni'}",
            "methods": _methods(org),
        } if org else None,
        "current_purchase": serialize_purchase(db, pending) if pending else None,
        "blocking_annual_term_id": annual.id if annual else None,
    }


def _lock_member(db: Session, member: Member) -> Member:
    lock_card_allocation(db, member.org_id, as_rome_datetime().year)
    return db.execute(select(Member).where(Member.id == member.id).with_for_update()
                      .execution_options(populate_existing=True)).scalar_one()


def _last_payment(db: Session, purchase_id: int) -> MembershipPayment | None:
    return db.query(MembershipPayment).filter(
        MembershipPayment.temporary_purchase_id == purchase_id,
    ).order_by(MembershipPayment.id.desc()).first()


def serialize_purchase(db: Session, purchase: TemporaryMembershipPurchase) -> dict[str, Any]:
    payment = _last_payment(db, purchase.id)
    status = purchase.status
    if status == "active" and purchase.valid_until is not None and utc(purchase.valid_until) <= utc():
        status = "expired"
    return {
        "id": purchase.id, "member_id": purchase.member_id, "org_id": purchase.org_id,
        "member_name": f"{purchase.member.first_name or ''} {purchase.member.last_name or ''}".strip(),
        "email": purchase.member.email, "status": status, "method": purchase.method,
        "amount": float(purchase.amount) if purchase.amount is not None else None,
        "currency": purchase.currency, "duration_value": purchase.duration_value,
        "duration_unit": purchase.duration_unit,
        "created_at": utc(purchase.created_at).isoformat(),
        "issued_at": utc(purchase.issued_at).isoformat() if purchase.issued_at else None,
        "valid_from": utc(purchase.valid_from).isoformat() if purchase.valid_from else None,
        "valid_until": utc(purchase.valid_until).isoformat() if purchase.valid_until else None,
        "card_no": purchase.card_no, "card_year": purchase.card_year,
        "payment_status": payment.status if payment else None,
        "hosted_checkout_url": payment.hosted_checkout_url if payment and status == "payment_pending" else None,
        "issue_reason": purchase.issue_reason,
    }


def create_or_resume(db: Session, *, member: Member, method: str, request: Request) -> TemporaryMembershipPurchase:
    member = _lock_member(db, member)
    pending = current_purchase(db, member.id)
    if pending:
        if pending.method != method:
            raise HTTPException(status_code=409, detail="Riprendi il metodo di pagamento dell'acquisto già in corso.")
        purchase = pending
    else:
        eligibility = offer(db, member)
        if not eligibility["eligible"]:
            raise HTTPException(status_code=409, detail=eligibility["reason"])
        if method not in eligibility["offer"]["methods"]:
            raise HTTPException(status_code=422, detail="Metodo di pagamento non disponibile.")
        snapshot = eligibility["offer"]
        purchase = TemporaryMembershipPurchase(
            member_id=member.id, org_id=member.org_id, method=method,
            status="payment_pending" if method == "sumup" else "manual_pending",
            amount=Decimal(str(snapshot["amount"])), currency=snapshot["currency"],
            duration_value=snapshot["duration_value"], duration_unit=snapshot["duration_unit"],
        )
        db.add(purchase)
        db.flush()
        if method != "sumup":
            for admin in db.query(AdminUser).filter(
                AdminUser.org_id == member.org_id, AdminUser.role == AdminRole.ORG_ADMIN,
                AdminUser.is_active.is_(True), AdminUser.deleted_at.is_(None),
            ).all():
                db.add(OrgAdminNotification(
                    admin_user_id=admin.id, org_id=member.org_id, type="renewal",
                    title="Richiesta tessera temporanea", body=f"{member.first_name or ''} {member.last_name or ''}: conferma l'incasso {method}.",
                    href=f"/org-admin/soci/{member.id}",
                ))
    if method == "sumup" and purchase.status == "payment_pending":
        _ensure_checkout(db, member=member, purchase=purchase, request=request)
    db.flush()
    return purchase


def _ensure_checkout(db: Session, *, member: Member, purchase: TemporaryMembershipPurchase, request: Request) -> None:
    from app.services.card_reservations import reserve_payment_card
    from app.services.membership_payments import (
        create_checkout_reference, create_sumup_hosted_checkout,
        persist_sumup_checkout_creation, reuse_existing_sumup_checkout,
    )
    org = member.organization
    latest = _last_payment(db, purchase.id)
    if latest and latest.status in PAID_STATUSES:
        fulfill_purchase(db, purchase=purchase, payment=latest)
        return
    if latest and reuse_existing_sumup_checkout(db, latest, org, request=request):
        return
    # Reacquire the domain after provider verification may have committed it.
    member = _lock_member(db, member)
    purchase = db.execute(select(TemporaryMembershipPurchase).where(
        TemporaryMembershipPurchase.id == purchase.id).with_for_update()
        .execution_options(populate_existing=True)).scalar_one()
    current = _last_payment(db, purchase.id)
    if current and (latest is None or current.id != latest.id):
        raise HTTPException(status_code=409, detail="Un pagamento è già in preparazione. Riprendi l'acquisto tra poco.")
    if purchase.card_no is not None:
        return
    payment = MembershipPayment(
        org_id=purchase.org_id, socio_id=member.id, temporary_purchase_id=purchase.id,
        payment_kind="temporary", membership_year=as_rome_datetime().year,
        provider="sumup", amount=purchase.amount, currency=purchase.currency,
        payment_reason="Acquisto tessera temporanea", source="sumup", status="pending",
        checkout_reference=create_checkout_reference(org, member),
    )
    db.add(payment)
    db.flush()
    reserve_payment_card(db, payment)
    org_input = SimpleNamespace(**{field: getattr(org, field) for field in
        ("id", "sumup_api_key_encrypted", "membership_payment_label", "club_display_name", "name")})
    member_input = SimpleNamespace(id=member.id, email=member.email)
    payment_input = SimpleNamespace(**{field: getattr(payment, field) for field in
        ("id", "amount", "currency", "checkout_reference", "reservation_expires_at")})
    purchase_id = purchase.id
    db.commit()  # Durable reservation/reference before provider I/O.
    base = (settings.BASE_URL or str(request.base_url)).rstrip("/")
    front = (settings.FRONTEND_URL or base).rstrip("/")
    try:
        payload = create_sumup_hosted_checkout(
            org=org_input, member=member_input, payment=payment_input,
            redirect_url=f"{front}/dashboard?temporary_purchase={purchase_id}",
            return_url=f"{base}/api/webhooks/sumup",
        )
    except Exception as exc:
        persist_sumup_checkout_creation(db, payment, error=exc)
        raise
    persist_sumup_checkout_creation(db, payment, payload=payload)
    if not payment.hosted_checkout_url or not payment.sumup_checkout_id:
        raise HTTPException(status_code=502, detail="Checkout in verifica. Riprendi l'acquisto tra poco.")


def preserve_current_card(db: Session, member: Member) -> None:
    """Keep the old token/stock identity before replacing Member's current pointer."""
    if member.card_no is None or member.card_year is None:
        return
    if member.membership_type != "temporary":
        sync_annual_membership_term(db, member, source="before_temporary_purchase")
        db.flush()
        return
    existing = db.query(TemporaryMembershipPurchase.id).filter(
        TemporaryMembershipPurchase.member_id == member.id,
        TemporaryMembershipPurchase.card_no == member.card_no,
        TemporaryMembershipPurchase.card_year == member.card_year,
    ).first()
    if not existing:
        db.add(TemporaryMembershipPurchase(
            member_id=member.id, org_id=member.org_id, source="legacy", method="legacy",
            status="expired", amount=member.membership_fee_snapshot,
            currency=member.organization.membership_fee_currency or "EUR",
            card_no=member.card_no, card_year=member.card_year, batch_id=member.batch_id,
            numbering_scope_id=member.numbering_scope_id,
            issued_at=member.valid_from or member.joined_at,
            valid_from=member.valid_from, valid_until=member.valid_until,
        ))
        db.flush()


def fulfill_purchase(db: Session, *, purchase: TemporaryMembershipPurchase, payment: MembershipPayment,
                     now: datetime | None = None) -> bool:
    from app.services.card_reservations import reserved_payment_allocation, settle_paid_reservation_for_existing_card
    if payment.status not in PAID_STATUSES or payment.temporary_purchase_id != purchase.id:
        raise HTTPException(status_code=409, detail="Pagamento temporanea non confermato.")
    lock_card_allocation(db, purchase.org_id, int(payment.reserved_card_year or as_rome_datetime(now).year))
    member = db.execute(select(Member).where(Member.id == purchase.member_id).with_for_update()
                        .execution_options(populate_existing=True)).scalar_one()
    purchase = db.execute(select(TemporaryMembershipPurchase).where(
        TemporaryMembershipPurchase.id == purchase.id).with_for_update()
        .execution_options(populate_existing=True)).scalar_one()
    if purchase.card_no is not None:
        settle_paid_reservation_for_existing_card(db, payment, purchase)
        return False
    purchase.status = "paid_waiting_card"
    if not _approved_account(member) or not member.organization.is_active:
        purchase.issue_reason = "account_requires_review"
        return False
    if is_member_active(member, now=now):
        purchase.issue_reason = "another_card_is_valid"
        return False
    if blocking_annual_term(db, member.id, now=now):
        purchase.issue_reason = "annual_membership_in_progress"
        return False
    preserve_current_card(db, member)
    try:
        allocation = reserved_payment_allocation(db, payment)
        if allocation is None:
            allocation = allocate_next_card(db, member.org_id, as_rome_datetime(now).year)
    except HTTPException as exc:
        if exc.status_code != 409:
            raise
        purchase.issue_reason = "card_stock_unavailable"
        return False
    released_at = utc(now)
    duration = timedelta(**{"hours" if purchase.duration_unit == "hours" else "days": purchase.duration_value})
    purchase.card_no, purchase.card_year = allocation.card_no, allocation.year
    purchase.batch_id, purchase.numbering_scope_id = allocation.batch_id, allocation.numbering_scope_id
    purchase.issued_at = purchase.valid_from = released_at
    purchase.valid_until = released_at + duration
    purchase.status, purchase.issue_reason = "active", None
    member.card_no, member.card_year = allocation.card_no, allocation.year
    member.batch_id, member.numbering_scope_id = allocation.batch_id, allocation.numbering_scope_id
    member.membership_type = "temporary"
    member.valid_from = released_at.replace(tzinfo=None)
    member.valid_until = purchase.valid_until.replace(tzinfo=None)
    member.membership_fee_snapshot = purchase.amount
    member.status, member.expired_at = MemberStatus.ACTIVE, None
    member.payment_required, member.payment_status = True, payment.status
    member.payment_completed_at = payment.confirmed_at
    member.card_is_paid, member.card_paid_at, member.card_payment_status = True, payment.confirmed_at, payment.status
    member.card_email_sent_at = member.card_delivered_at = None
    db.flush()
    if not db.query(MemberNotification.id).filter(
        MemberNotification.dedupe_key == f"temporary-issued:{purchase.id}"
    ).first():
        db.add(MemberNotification(
            member_id=member.id, org_id=member.org_id, type="renewal", title="Tessera temporanea attiva",
            body="La durata della tessera decorre da questo rilascio. La trovi nella tua area riservata.",
            href="/dashboard", dedupe_key=f"temporary-issued:{purchase.id}",
        ))
    from app.services.member_deferred_access import queue_activation_email
    queue_activation_email(db, member, dedupe_key=f"temporary-issued-email:{purchase.id}")
    return True


def confirm_manual(db: Session, *, purchase: TemporaryMembershipPurchase, admin_id: int,
                   paid_at: datetime, notes: str | None) -> TemporaryMembershipPurchase:
    lock_card_allocation(db, purchase.org_id, as_rome_datetime().year)
    from app.services.member_accounting import guard_partial_manual_payment
    guard_partial_manual_payment(db, member=purchase.member, purchase=purchase)
    purchase = db.execute(select(TemporaryMembershipPurchase).where(
        TemporaryMembershipPurchase.id == purchase.id).with_for_update()
        .execution_options(populate_existing=True)).scalar_one()
    if purchase.method not in ("contanti", "bonifico") or purchase.status == "cancelled":
        raise HTTPException(status_code=409, detail="La richiesta non prevede una conferma manuale.")
    payment = db.query(MembershipPayment).filter(
        MembershipPayment.temporary_purchase_id == purchase.id,
        MembershipPayment.status.in_(PAID_STATUSES),
    ).first()
    if payment is None:
        payment = MembershipPayment(
            org_id=purchase.org_id, socio_id=purchase.member_id, temporary_purchase_id=purchase.id,
            payment_kind="temporary", membership_year=as_rome_datetime().year,
            provider="none", source="manual", status="manual_completed",
            amount=purchase.amount, currency=purchase.currency,
            payment_reason="Acquisto tessera temporanea", confirmed_at=utc(paid_at),
            manual_marked_paid_by_user_id=admin_id, notes=notes,
        )
        db.add(payment)
        db.flush()
        from app.services.membership_payments import create_legacy_manual_member_payment
        create_legacy_manual_member_payment(
            db=db, member=purchase.member, org=purchase.organization,
            admin_id=admin_id, amount=purchase.amount, method=purchase.method,
            paid_at=paid_at, notes=notes, membership_payment=payment,
        )
    fulfill_purchase(db, purchase=purchase, payment=payment)
    return purchase


def retry_paid_temporary_purchases(db: Session) -> int:
    purchases = db.query(TemporaryMembershipPurchase).filter(
        TemporaryMembershipPurchase.status == "paid_waiting_card",
    ).order_by(TemporaryMembershipPurchase.id).limit(100).all()
    issued = 0
    for purchase in purchases:
        payment = db.query(MembershipPayment).filter(
            MembershipPayment.temporary_purchase_id == purchase.id,
            MembershipPayment.status.in_(PAID_STATUSES),
        ).order_by(MembershipPayment.id.desc()).first()
        if payment:
            issued += int(fulfill_purchase(db, purchase=purchase, payment=payment))
    return issued


def cancel_purchase(db: Session, *, purchase: TemporaryMembershipPurchase) -> TemporaryMembershipPurchase:
    """Close only an unpaid order whose checkout is proven unable to charge."""
    from app.services.card_reservations import reconcile_payment_reservation
    lock_card_allocation(db, purchase.org_id, as_rome_datetime().year)
    purchase = db.execute(select(TemporaryMembershipPurchase).where(
        TemporaryMembershipPurchase.id == purchase.id).with_for_update()
        .execution_options(populate_existing=True)).scalar_one()
    if purchase.status == "cancelled":
        return purchase
    if purchase.card_no is not None or purchase.status == "paid_waiting_card":
        raise HTTPException(status_code=409, detail="Il pagamento è già stato registrato: contatta l'associazione.")
    latest = _last_payment(db, purchase.id)
    if latest is not None:
        if latest.status in PAID_STATUSES:
            raise HTTPException(status_code=409, detail="Il pagamento è già stato registrato: contatta l'associazione.")
        if latest.reservation_state == "held":
            reconcile_payment_reservation(db, latest, purchase.organization)
            # Reconciliation commits before provider I/O. Another browser may
            # have resumed the order in that gap; re-read it under the domain.
            purchase = db.execute(select(TemporaryMembershipPurchase).where(
                TemporaryMembershipPurchase.id == purchase.id).with_for_update()
                .execution_options(populate_existing=True)).scalar_one()
            latest = _last_payment(db, purchase.id)
        if latest.status in PAID_STATUSES or latest.reservation_state != "released":
            raise HTTPException(status_code=409, detail="Il pagamento online è ancora verificabile o pagabile. Attendi la chiusura del checkout prima di annullare.")
    purchase.status, purchase.issue_reason = "cancelled", None
    db.flush()
    return purchase
