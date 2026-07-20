from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any, Iterable

from fastapi import HTTPException, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    AnnualMembershipTerm,
    AnnualMembershipTermStatus,
    Member,
    MemberNotification,
    MemberNotificationType,
    MemberStatus,
    MembershipPayment,
    MembershipPaymentKind,
    MembershipPaymentSource,
    MembershipPaymentStatus,
    MembershipType,
    OrgAdminNotification,
    OrgAdminNotificationType,
    Organization,
    OrganizationPaymentProvider,
)
from app.services.annual_memberships import (
    ROME_TIMEZONE,
    annual_membership_valid_through,
    as_rome_datetime,
)
from app.services.card_allocation import allocate_next_card
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload
from app.services.membership_payments import (
    PAID_MEMBERSHIP_STATUSES,
    create_checkout_reference,
    create_sumup_hosted_checkout,
    organization_has_sumup_config,
    payment_status_is_paid,
)


logger = logging.getLogger(__name__)

RENEWAL_WINDOW_DAYS = 60
REMINDER_PHASES = (60, 30, 7)
_RENEWED_STATUSES = {
    AnnualMembershipTermStatus.APPROVED_WAITING_CARD.value,
    AnnualMembershipTermStatus.SCHEDULED.value,
    AnnualMembershipTermStatus.ACTIVE.value,
    AnnualMembershipTermStatus.PAID_WAITING_CARD.value,
}


@dataclass(frozen=True)
class RenewalAction:
    term: AnnualMembershipTerm
    created: bool
    action: str
    checkout_required: bool = False


def _utc_now(value: datetime | None = None) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _status_value(value: object) -> str:
    if isinstance(value, MemberStatus):
        return value.value
    return str(value or "").strip().lower()


def can_access_member_account(member: Member | None) -> bool:
    """Allow an expired annual member to reach renewal-only account surfaces."""

    if member is None or member.deleted_at is not None:
        return False
    if _status_value(member.status) == MemberStatus.ACTIVE.value:
        return True
    return (
        _status_value(member.status) == MemberStatus.EXPIRED.value
        and member.card_no is not None
        and member.card_year is not None
        and str(member.membership_type or MembershipType.ANNUAL.value).lower()
        != MembershipType.TEMPORARY.value
    )


def get_account_member_from_session(request: Request, db: Session) -> Member | None:
    member_id = request.session.get("member_id")
    if not member_id:
        return None
    member = db.query(Member).filter(Member.id == member_id).first()
    return member if can_access_member_account(member) else None


def get_latest_annual_term(db: Session, member_id: int) -> AnnualMembershipTerm | None:
    return (
        db.query(AnnualMembershipTerm)
        .filter(AnnualMembershipTerm.member_id == member_id)
        .order_by(
            AnnualMembershipTerm.membership_year.desc(),
            AnnualMembershipTerm.id.desc(),
        )
        .first()
    )


def get_current_annual_term(db: Session, member: Member) -> AnnualMembershipTerm | None:
    """Resolve the term represented by the legacy Member card pointer.

    A renewal may already have created a later scheduled/due term.  That later
    row must not become the source for another renewal until it is actually
    promoted to the member's current card.
    """

    if member.card_no is not None and member.card_year is not None:
        current = (
            db.query(AnnualMembershipTerm)
            .filter(
                AnnualMembershipTerm.member_id == member.id,
                AnnualMembershipTerm.card_no == member.card_no,
                AnnualMembershipTerm.card_year == member.card_year,
            )
            .order_by(AnnualMembershipTerm.id.desc())
            .first()
        )
        if current is not None:
            return current
    return get_latest_annual_term(db, member.id)


def get_annual_term(
    db: Session,
    *,
    member_id: int,
    membership_year: int,
) -> AnnualMembershipTerm | None:
    return (
        db.query(AnnualMembershipTerm)
        .filter(
            AnnualMembershipTerm.member_id == member_id,
            AnnualMembershipTerm.membership_year == membership_year,
        )
        .first()
    )


def _renewal_window_opens_on(term: AnnualMembershipTerm) -> date:
    from datetime import timedelta

    return term.valid_through - timedelta(days=RENEWAL_WINDOW_DAYS)


def _decimal_amount(value: object | None) -> Decimal:
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value)).quantize(Decimal("0.01"))


def ensure_renewal_term(
    db: Session,
    *,
    member: Member,
    membership_year: int | None = None,
    now: datetime | None = None,
) -> tuple[AnnualMembershipTerm, bool]:
    current = get_current_annual_term(db, member)
    if current is None:
        raise HTTPException(status_code=409, detail="Annualità corrente non disponibile.")

    target_year = int(membership_year or (current.membership_year + 1))
    existing = get_annual_term(
        db,
        member_id=member.id,
        membership_year=target_year,
    )
    if existing is not None:
        return existing, False

    source = get_annual_term(
        db,
        member_id=member.id,
        membership_year=target_year - 1,
    )
    if source is None:
        raise HTTPException(
            status_code=409,
            detail="L'annualità precedente non è disponibile per questo rinnovo.",
        )

    org = member.organization or db.query(Organization).filter(Organization.id == member.org_id).first()
    if org is None:
        raise HTTPException(status_code=404, detail="Associazione non trovata.")

    term = AnnualMembershipTerm(
        member_id=member.id,
        org_id=member.org_id,
        membership_year=target_year,
        starts_on=date(target_year, 1, 1),
        valid_through=annual_membership_valid_through(target_year),
        status=AnnualMembershipTermStatus.DUE.value,
        fee_amount=_decimal_amount(org.membership_fee_amount),
        currency=str(org.membership_fee_currency or "EUR").upper(),
        source="renewal",
    )
    db.add(term)
    db.flush()
    return term, True


def assert_member_renewal_window_open(
    db: Session,
    member: Member,
    *,
    now: datetime | None = None,
) -> AnnualMembershipTerm:
    current = get_current_annual_term(db, member)
    if current is None:
        raise HTTPException(status_code=409, detail="Annualità corrente non disponibile.")
    local_today = as_rome_datetime(now).date()
    if local_today < _renewal_window_opens_on(current):
        raise HTTPException(
            status_code=409,
            detail=(
                "Il rinnovo sarà disponibile dal "
                f"{_renewal_window_opens_on(current).strftime('%d/%m/%Y')}."
            ),
        )
    return current


def _paid_payment_for_term(
    db: Session,
    term_id: int,
) -> MembershipPayment | None:
    return (
        db.query(MembershipPayment)
        .filter(
            MembershipPayment.annual_term_id == term_id,
            MembershipPayment.status.in_(list(PAID_MEMBERSHIP_STATUSES)),
        )
        .order_by(MembershipPayment.confirmed_at.desc(), MembershipPayment.id.desc())
        .first()
    )


def _latest_payment_for_term(
    db: Session,
    term_id: int,
) -> MembershipPayment | None:
    return (
        db.query(MembershipPayment)
        .filter(MembershipPayment.annual_term_id == term_id)
        .order_by(MembershipPayment.created_at.desc(), MembershipPayment.id.desc())
        .first()
    )


def promote_renewal_term(
    db: Session,
    *,
    term: AnnualMembershipTerm,
    now: datetime | None = None,
) -> bool:
    if term.card_no is None or term.card_year is None:
        return False
    local_today = as_rome_datetime(now).date()
    if term.starts_on > local_today:
        term.status = AnnualMembershipTermStatus.SCHEDULED.value
        return False

    member = term.member or db.query(Member).filter(Member.id == term.member_id).first()
    if member is None or member.deleted_at is not None:
        return False
    if _status_value(member.status) == MemberStatus.REJECTED.value:
        # A future paid/scheduled term must never silently undo an explicit
        # organization-admin rejection.
        return False

    member.card_no = term.card_no
    member.card_year = term.card_year
    member.batch_id = term.batch_id
    member.numbering_scope_id = term.numbering_scope_id
    member.membership_type = MembershipType.ANNUAL.value
    member.valid_from = datetime.combine(term.starts_on, time.min)
    member.valid_until = None
    member.membership_fee_snapshot = term.fee_amount
    member.status = MemberStatus.ACTIVE
    member.expired_at = None

    paid = _paid_payment_for_term(db, term.id)
    if paid is not None:
        member.payment_status = paid.status
        member.payment_required = True
        member.payment_completed_at = paid.confirmed_at or _utc_now(now)
        member.card_is_paid = True
        member.card_paid_at = member.payment_completed_at
        member.card_payment_status = paid.status
    else:
        member.payment_required = False
        member.payment_status = MembershipPaymentStatus.NOT_REQUIRED.value
        member.payment_completed_at = None
        member.card_is_paid = False
        member.card_paid_at = None
        member.card_payment_status = None

    term.status = AnnualMembershipTermStatus.ACTIVE.value
    term.activated_at = term.activated_at or _utc_now(now)
    return True


def allocate_renewal_card(
    db: Session,
    *,
    term: AnnualMembershipTerm,
    now: datetime | None = None,
    approved_without_payment: bool = False,
) -> bool:
    if term.card_no is not None:
        promote_renewal_term(db, term=term, now=now)
        return False

    try:
        allocation = allocate_next_card(
            db,
            org_id=term.org_id,
            year=term.membership_year,
        )
    except HTTPException as exc:
        if exc.status_code != 409:
            raise
        term.status = (
            AnnualMembershipTermStatus.PAID_WAITING_CARD.value
            if _paid_payment_for_term(db, term.id) is not None
            else (
                AnnualMembershipTermStatus.APPROVED_WAITING_CARD.value
                if approved_without_payment
                else AnnualMembershipTermStatus.DUE.value
            )
        )
        return False

    term.card_no = allocation.card_no
    term.card_year = allocation.year
    term.batch_id = allocation.batch_id
    term.numbering_scope_id = allocation.numbering_scope_id
    term.issued_at = term.issued_at or _utc_now(now)
    term.status = AnnualMembershipTermStatus.SCHEDULED.value
    promote_renewal_term(db, term=term, now=now)
    return True


def _notify_org_admins_of_renewal_request(
    db: Session,
    *,
    member: Member,
    term: AnnualMembershipTerm,
    now: datetime | None = None,
) -> None:
    admins = (
        db.query(AdminUser)
        .filter(
            AdminUser.org_id == member.org_id,
            AdminUser.role == AdminRole.ORG_ADMIN,
            AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None),
        )
        .all()
    )
    local_today = as_rome_datetime(now).date()
    href = f"/org-admin/quote?year={term.membership_year}"
    body = (
        f"{member.first_name or ''} {member.last_name or ''} ha richiesto il rinnovo "
        f"per il {term.membership_year}."
    ).strip()
    day_start = datetime.combine(local_today, time.min)
    for admin in admins:
        duplicate = (
            db.query(OrgAdminNotification.id)
            .filter(
                OrgAdminNotification.admin_user_id == admin.id,
                OrgAdminNotification.type == OrgAdminNotificationType.RENEWAL.value,
                OrgAdminNotification.href == href,
                OrgAdminNotification.body == body,
                OrgAdminNotification.created_at >= day_start,
            )
            .first()
        )
        if duplicate is not None:
            continue
        db.add(
            OrgAdminNotification(
                admin_user_id=admin.id,
                org_id=member.org_id,
                type=OrgAdminNotificationType.RENEWAL.value,
                title="Nuova richiesta di rinnovo",
                body=body,
                href=href,
                is_read=False,
            )
        )


def request_renewal(
    db: Session,
    *,
    member: Member,
    now: datetime | None = None,
) -> RenewalAction:
    assert_member_renewal_window_open(db, member, now=now)
    term, created = ensure_renewal_term(db, member=member, now=now)
    if term.card_no is not None or term.status in _RENEWED_STATUSES:
        return RenewalAction(term=term, created=created, action="already_renewed")

    org = member.organization
    if org is None:
        raise HTTPException(status_code=404, detail="Associazione non trovata.")
    fee = _decimal_amount(term.fee_amount)
    requires_payment_before_card = bool(org.payment_required_before_card and fee > 0)

    if requires_payment_before_card:
        term.status = AnnualMembershipTermStatus.PAYMENT_PENDING.value
        action = "online_payment" if organization_has_sumup_config(org) else "manual_payment"
        result = RenewalAction(
            term=term,
            created=created,
            action=action,
            checkout_required=action == "online_payment",
        )
    elif bool(org.auto_approve_signup):
        allocated = allocate_renewal_card(
            db,
            term=term,
            now=now,
            approved_without_payment=True,
        )
        result = RenewalAction(
            term=term,
            created=created,
            action="renewed" if allocated or term.card_no is not None else "waiting_card",
        )
    else:
        term.status = AnnualMembershipTermStatus.DUE.value
        result = RenewalAction(term=term, created=created, action="org_confirmation")

    _notify_org_admins_of_renewal_request(db, member=member, term=term, now=now)
    _create_member_notification(
        db,
        member=member,
        title="Rinnovo preso in carico",
        body=_renewal_action_message(result.action, term.membership_year),
        dedupe_key=f"renewal-request:{term.id}",
    )
    return result


def _renewal_action_message(action: str, year: int) -> str:
    if action == "renewed":
        return f"La tessera {year} è stata predisposta."
    if action == "waiting_card":
        return "Rinnovo registrato: l'associazione assegnerà la tessera appena disponibile."
    if action == "online_payment":
        return "Completa il pagamento online per confermare il rinnovo."
    if action == "manual_payment":
        return "La richiesta è in attesa della registrazione del pagamento da parte dell'associazione."
    return "La richiesta è in attesa di conferma da parte dell'associazione."


def _create_member_notification(
    db: Session,
    *,
    member: Member,
    title: str,
    body: str,
    dedupe_key: str,
    href: str = "/dashboard",
) -> bool:
    if (
        db.query(MemberNotification.id)
        .filter(MemberNotification.dedupe_key == dedupe_key)
        .first()
        is not None
    ):
        return False
    db.add(
        MemberNotification(
            member_id=member.id,
            org_id=member.org_id,
            type=MemberNotificationType.RENEWAL.value,
            title=title,
            body=body,
            href=href,
            dedupe_key=dedupe_key,
        )
    )
    return True


def serialize_annual_term(
    db: Session,
    term: AnnualMembershipTerm | None,
) -> dict[str, Any] | None:
    if term is None:
        return None
    payment = _latest_payment_for_term(db, term.id)
    return {
        "id": term.id,
        "membership_year": term.membership_year,
        "starts_on": term.starts_on.isoformat(),
        "valid_through": term.valid_through.isoformat(),
        "status": term.status,
        "fee_amount": float(term.fee_amount or 0),
        "currency": term.currency,
        "card_no": term.card_no,
        "card_year": term.card_year,
        "issued_at": term.issued_at.isoformat() if term.issued_at else None,
        "payment": serialize_term_payment(payment),
    }


def serialize_term_payment(payment: MembershipPayment | None) -> dict[str, Any] | None:
    if payment is None:
        return None
    return {
        "id": payment.id,
        "status": payment.status,
        "source": payment.source,
        "amount": float(payment.amount),
        "currency": payment.currency,
        "confirmed_at": payment.confirmed_at.isoformat() if payment.confirmed_at else None,
        "hosted_checkout_url": payment.hosted_checkout_url,
    }


def serialize_member_membership(
    db: Session,
    *,
    member: Member,
    now: datetime | None = None,
) -> dict[str, Any]:
    terms = (
        db.query(AnnualMembershipTerm)
        .filter(AnnualMembershipTerm.member_id == member.id)
        .order_by(AnnualMembershipTerm.membership_year.desc())
        .all()
    )
    current = next(
        (
            item
            for item in terms
            if item.card_no == member.card_no and item.card_year == member.card_year
        ),
        terms[0] if terms else None,
    )
    future = next(
        (item for item in terms if current and item.membership_year > current.membership_year),
        None,
    )
    renewal_opens_on = _renewal_window_opens_on(current) if current else None
    local_today = as_rome_datetime(now).date()
    can_renew = bool(
        current
        and local_today >= renewal_opens_on
        and (future is None or future.status not in _RENEWED_STATUSES)
    )
    return {
        "current": serialize_annual_term(db, current),
        "renewal": serialize_annual_term(db, future),
        "renewal_opens_on": renewal_opens_on.isoformat() if renewal_opens_on else None,
        "can_renew": can_renew,
        "is_account_only": _status_value(member.status) == MemberStatus.EXPIRED.value,
    }


def create_renewal_checkout(
    db: Session,
    *,
    member: Member,
    term: AnnualMembershipTerm,
    request: Request,
) -> MembershipPayment:
    if term.member_id != member.id or term.org_id != member.org_id:
        raise HTTPException(status_code=404, detail="Rinnovo non trovato.")
    if term.card_no is not None:
        raise HTTPException(status_code=409, detail="Rinnovo già completato.")
    org = member.organization
    if org is None or not organization_has_sumup_config(org):
        raise HTTPException(status_code=409, detail="Pagamento online non disponibile.")

    existing_paid = _paid_payment_for_term(db, term.id)
    if existing_paid is not None:
        raise HTTPException(status_code=409, detail="Quota di rinnovo già pagata.")
    latest = _latest_payment_for_term(db, term.id)
    if (
        latest is not None
        and latest.status == MembershipPaymentStatus.PENDING.value
        and latest.hosted_checkout_url
    ):
        return latest

    backend_base = (settings.BASE_URL or str(request.base_url)).rstrip("/")
    frontend_base = (settings.FRONTEND_URL or backend_base).rstrip("/")
    payment = MembershipPayment(
        org_id=org.id,
        socio_id=member.id,
        annual_term_id=term.id,
        membership_year=term.membership_year,
        payment_kind=MembershipPaymentKind.RENEWAL.value,
        provider=OrganizationPaymentProvider.SUMUP.value,
        payment_reason=f"Rinnovo quota associativa {term.membership_year}",
        amount=_decimal_amount(term.fee_amount),
        currency=term.currency,
        status=MembershipPaymentStatus.PENDING.value,
        source=MembershipPaymentSource.SUMUP.value,
        checkout_reference=create_checkout_reference(org, member),
    )
    db.add(payment)
    db.flush()
    payload = create_sumup_hosted_checkout(
        org=org,
        member=member,
        payment=payment,
        redirect_url=f"{frontend_base}/dashboard?renewal=payment-return",
        return_url=f"{backend_base}/api/webhooks/sumup",
    )
    hosted = payload.get("hosted_checkout") or {}
    hosted_url = (
        payload.get("hosted_checkout_url")
        or hosted.get("checkout_url")
        or hosted.get("hosted_checkout_url")
        or payload.get("checkout_url")
    )
    checkout_id = payload.get("id") or payload.get("checkout_id")
    if not hosted_url or not checkout_id:
        raise HTTPException(status_code=502, detail="Risposta checkout SumUp incompleta.")
    payment.hosted_checkout_url = str(hosted_url)
    payment.sumup_checkout_id = str(checkout_id)
    payment.raw_create_response = payload
    term.status = AnnualMembershipTermStatus.PAYMENT_PENDING.value
    return payment


def complete_renewal_payment(
    db: Session,
    *,
    payment: MembershipPayment,
    now: datetime | None = None,
) -> bool:
    term = payment.annual_term
    if term is None:
        return False
    if term.card_no is not None:
        promote_renewal_term(db, term=term, now=now)
        return False
    issued = allocate_renewal_card(db, term=term, now=now)
    if not issued and term.card_no is None:
        term.status = AnnualMembershipTermStatus.PAID_WAITING_CARD.value
    _create_member_notification(
        db,
        member=term.member,
        title="Pagamento rinnovo confermato",
        body=(
            f"La quota {term.membership_year} è stata registrata. "
            + (
                "La nuova tessera è disponibile."
                if term.card_no is not None
                else "La tessera sarà assegnata appena disponibile."
            )
        ),
        dedupe_key=f"renewal-payment-confirmed:{payment.id}",
    )
    return issued


def record_manual_renewal_payment(
    db: Session,
    *,
    member: Member,
    membership_year: int,
    admin_id: int,
    amount: Decimal,
    method: str,
    paid_at: datetime,
    notes: str | None,
    now: datetime | None = None,
) -> tuple[AnnualMembershipTerm, MembershipPayment, bool]:
    term, _ = ensure_renewal_term(
        db,
        member=member,
        membership_year=membership_year,
        now=now,
    )
    existing = _paid_payment_for_term(db, term.id)
    if existing is not None:
        return term, existing, False
    payment = MembershipPayment(
        org_id=member.org_id,
        socio_id=member.id,
        annual_term_id=term.id,
        membership_year=term.membership_year,
        payment_kind=MembershipPaymentKind.RENEWAL.value,
        provider=OrganizationPaymentProvider.SUMUP.value,
        payment_reason=f"Rinnovo quota associativa {term.membership_year}",
        amount=amount.quantize(Decimal("0.01")),
        currency=term.currency,
        status=MembershipPaymentStatus.MANUAL_COMPLETED.value,
        source=MembershipPaymentSource.MANUAL.value,
        confirmed_at=paid_at,
        manual_marked_paid_by_user_id=admin_id,
        notes=(f"Metodo: {method}. {notes or ''}").strip(),
    )
    db.add(payment)
    db.flush()
    issued = complete_renewal_payment(db, payment=payment, now=now)
    return term, payment, issued


def confirm_unpaid_renewal(
    db: Session,
    *,
    member: Member,
    membership_year: int,
    now: datetime | None = None,
) -> tuple[AnnualMembershipTerm, bool]:
    term, _ = ensure_renewal_term(
        db,
        member=member,
        membership_year=membership_year,
        now=now,
    )
    org = member.organization or (
        db.query(Organization).filter(Organization.id == member.org_id).first()
    )
    if org is None:
        raise HTTPException(status_code=404, detail="Associazione non trovata.")
    if bool(org.payment_required_before_card) and _decimal_amount(term.fee_amount) > 0:
        raise HTTPException(
            status_code=409,
            detail="Registra prima il pagamento della quota di rinnovo.",
        )
    return term, allocate_renewal_card(
        db,
        term=term,
        now=now,
        approved_without_payment=True,
    )


def _next_term_is_complete(db: Session, source: AnnualMembershipTerm) -> bool:
    target = get_annual_term(
        db,
        member_id=source.member_id,
        membership_year=source.membership_year + 1,
    )
    return bool(target and target.status in _RENEWED_STATUSES)


def _reminder_marker(source: AnnualMembershipTerm, today: date) -> str | None:
    days_left = (source.valid_through - today).days
    if days_left == -1:
        return "expired"
    if days_left < -1:
        return None
    if days_left <= 7:
        return "7"
    if days_left <= 30:
        return "30"
    if days_left <= 60:
        return "60"
    return None


def send_renewal_reminder(
    db: Session,
    *,
    source: AnnualMembershipTerm,
    now: datetime | None = None,
    manual: bool = False,
) -> bool:
    member = source.member
    if member is None or member.deleted_at is not None or not member.email:
        return False
    if _next_term_is_complete(db, source):
        return False
    local_today = as_rome_datetime(now).date()
    marker = "manual" if manual else _reminder_marker(source, local_today)
    if marker is None:
        return False
    dedupe_marker = f"{marker}:{local_today.isoformat()}" if manual else marker
    dedupe_key = f"renewal-reminder:{source.id}:{dedupe_marker}"
    title = (
        "Tessera scaduta: rinnova ora"
        if marker == "expired"
        else f"La tessera scade il {source.valid_through.strftime('%d/%m/%Y')}"
    )
    body = (
        f"Accedi alla tua area riservata per rinnovare la tessera "
        f"{source.membership_year + 1}."
    )
    created = _create_member_notification(
        db,
        member=member,
        title=title,
        body=body,
        dedupe_key=dedupe_key,
    )
    if not created:
        return False

    frontend_base = (settings.FRONTEND_URL or settings.BASE_URL or "").rstrip("/")
    dashboard_url = f"{frontend_base}/dashboard" if frontend_base else "/dashboard"
    enqueue_email(
        db,
        email_type="renewal_reminder",
        to_email=member.email,
        subject=title,
        payload=build_email_payload(
            text_body=f"{title}\n\n{body}\n\n{dashboard_url}",
            html_body=(
                f"<h1>{title}</h1><p>{body}</p>"
                f'<p><a href="{dashboard_url}">Apri area riservata</a></p>'
            ),
            sender=build_sender_payload(mode="association", association=member.organization),
            meta={
                "member_id": member.id,
                "org_id": member.org_id,
                "source_term_id": source.id,
                "reminder_marker": marker,
                "service_message": True,
            },
        ),
        priority=3,
        dedupe_key=dedupe_key,
    )
    return True


def retry_waiting_renewal_cards(
    db: Session,
    *,
    now: datetime | None = None,
) -> int:
    """Assign newly available stock only to renewals already approved or paid.

    Plain ``due`` rows are intentionally excluded: their presence alone is not
    an approval and the background worker must never advance them.
    """

    waiting_terms = (
        db.query(AnnualMembershipTerm)
        .filter(
            AnnualMembershipTerm.card_no.is_(None),
            AnnualMembershipTerm.status.in_(
                [
                    AnnualMembershipTermStatus.APPROVED_WAITING_CARD.value,
                    AnnualMembershipTermStatus.PAID_WAITING_CARD.value,
                ]
            ),
        )
        .order_by(
            AnnualMembershipTerm.membership_year.asc(),
            AnnualMembershipTerm.id.asc(),
        )
        .all()
    )
    assigned = 0
    for term in waiting_terms:
        is_paid_waiting = (
            term.status == AnnualMembershipTermStatus.PAID_WAITING_CARD.value
        )
        if is_paid_waiting and _paid_payment_for_term(db, term.id) is None:
            logger.warning(
                "renewal_waiting_card_skipped_missing_payment term_id=%s",
                term.id,
            )
            continue
        issued = allocate_renewal_card(
            db,
            term=term,
            now=now,
            approved_without_payment=not is_paid_waiting,
        )
        if not issued:
            continue
        assigned += 1
        if term.member is not None:
            _create_member_notification(
                db,
                member=term.member,
                title="Tessera di rinnovo assegnata",
                body=f"La tessera {term.membership_year} è stata predisposta nella tua area riservata.",
                dedupe_key=f"renewal-card-assigned:{term.id}",
            )
    return assigned


def activate_due_renewal_terms(
    db: Session,
    *,
    now: datetime | None = None,
) -> int:
    local_today = as_rome_datetime(now).date()
    terms = (
        db.query(AnnualMembershipTerm)
        .filter(
            AnnualMembershipTerm.status == AnnualMembershipTermStatus.SCHEDULED.value,
            AnnualMembershipTerm.starts_on <= local_today,
            AnnualMembershipTerm.card_no.isnot(None),
        )
        .all()
    )
    activated = 0
    for term in terms:
        if not promote_renewal_term(db, term=term, now=now):
            continue
        activated += 1
        _create_member_notification(
            db,
            member=term.member,
            title="La nuova tessera è attiva",
            body=f"La tessera {term.membership_year} è ora attiva nella tua area riservata.",
            dedupe_key=f"renewal-activated:{term.id}",
        )
    return activated


def dispatch_due_renewal_reminders(
    db: Session,
    *,
    now: datetime | None = None,
) -> dict[str, int]:
    local_today = as_rome_datetime(now).date()
    sources = (
        db.query(AnnualMembershipTerm)
        .join(Member, Member.id == AnnualMembershipTerm.member_id)
        .filter(
            AnnualMembershipTerm.valid_through >= local_today - timedelta(days=1),
            AnnualMembershipTerm.valid_through <= local_today + timedelta(days=RENEWAL_WINDOW_DAYS),
            AnnualMembershipTerm.status.in_(
                [
                    AnnualMembershipTermStatus.ACTIVE.value,
                    AnnualMembershipTermStatus.EXPIRED.value,
                ]
            ),
            Member.deleted_at.is_(None),
        )
        .all()
    )
    queued = sum(
        1
        for source in sources
        if send_renewal_reminder(db, source=source, now=now)
    )
    assigned = retry_waiting_renewal_cards(db, now=now)
    activated = activate_due_renewal_terms(db, now=now)
    return {
        "reminders_queued": queued,
        "cards_assigned": assigned,
        "terms_activated": activated,
    }


def run_renewal_reminder_job_once(*, now: datetime | None = None) -> dict[str, Any]:
    db = SessionLocal()
    try:
        result = dispatch_due_renewal_reminders(db, now=now)
        db.commit()
        return {"ok": True, **result}
    except Exception:
        db.rollback()
        logger.exception("renewal_reminder_job_failed")
        return {
            "ok": False,
            "reminders_queued": 0,
            "cards_assigned": 0,
            "terms_activated": 0,
        }
    finally:
        db.close()


def _quote_row(
    db: Session,
    *,
    member: Member,
    source: AnnualMembershipTerm | None,
    target: AnnualMembershipTerm | None,
    year: int,
    org: Organization,
) -> dict[str, Any]:
    payment = _latest_payment_for_term(db, target.id) if target else None
    paid = bool(payment and payment_status_is_paid(payment.status))
    fee = _decimal_amount(target.fee_amount if target else org.membership_fee_amount)
    renewal_status = target.status if target else AnnualMembershipTermStatus.DUE.value
    renewed = bool(
        target
        and target.card_no is not None
        and target.status
        in {
            AnnualMembershipTermStatus.SCHEDULED.value,
            AnnualMembershipTermStatus.ACTIVE.value,
        }
    )
    if paid:
        payment_state = "paid"
    elif payment and payment.status == MembershipPaymentStatus.PENDING.value:
        payment_state = "pending"
    elif fee <= 0:
        payment_state = "not_required"
    else:
        payment_state = "unpaid"
    return {
        "member_id": member.id,
        "first_name": member.first_name,
        "last_name": member.last_name,
        "email": member.email,
        "source_term_id": source.id if source else None,
        "renewal_term_id": target.id if target else None,
        "membership_year": year,
        "previous_valid_through": source.valid_through.isoformat() if source else None,
        "renewal_status": renewal_status,
        "renewed": renewed,
        "fee_amount": float(fee),
        "can_confirm_without_payment": not (
            bool(org.payment_required_before_card) and fee > 0
        ),
        "currency": target.currency if target else (org.membership_fee_currency or "EUR"),
        "payment_state": payment_state,
        "payment": serialize_term_payment(payment),
        "new_card_no": target.card_no if target else None,
        "new_card_year": target.card_year if target else None,
    }


def build_quote_center(
    db: Session,
    *,
    org: Organization,
    year: int,
    status_filter: str | None = None,
    search: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    source_terms = (
        db.query(AnnualMembershipTerm)
        .filter(
            AnnualMembershipTerm.org_id == org.id,
            AnnualMembershipTerm.membership_year == year - 1,
        )
        .all()
    )
    target_terms = (
        db.query(AnnualMembershipTerm)
        .filter(
            AnnualMembershipTerm.org_id == org.id,
            AnnualMembershipTerm.membership_year == year,
        )
        .all()
    )
    source_by_member = {item.member_id: item for item in source_terms}
    target_by_member = {item.member_id: item for item in target_terms}
    member_ids = sorted(set(source_by_member) | set(target_by_member))
    members = (
        db.query(Member)
        .filter(
            Member.id.in_(member_ids) if member_ids else Member.id == -1,
            Member.org_id == org.id,
            Member.deleted_at.is_(None),
        )
        .all()
    )
    rows = [
        _quote_row(
            db,
            member=member,
            source=source_by_member.get(member.id),
            target=target_by_member.get(member.id),
            year=year,
            org=org,
        )
        for member in members
    ]
    rows.sort(key=lambda item: ((item["last_name"] or "").lower(), (item["first_name"] or "").lower(), item["member_id"]))

    paid_total = sum(
        Decimal(str(row["payment"]["amount"]))
        for row in rows
        if row["payment_state"] == "paid" and row["payment"]
    )
    theoretical = sum(Decimal(str(row["fee_amount"])) for row in rows)
    kpis = {
        "due": sum(1 for row in rows if row["renewal_status"] == AnnualMembershipTermStatus.DUE.value),
        "renewed": sum(1 for row in rows if row["renewed"]),
        "payment_pending": sum(1 for row in rows if row["payment_state"] == "pending"),
        "unpaid": sum(1 for row in rows if row["payment_state"] == "unpaid"),
        "paid_waiting_card": sum(
            1
            for row in rows
            if row["renewal_status"] == AnnualMembershipTermStatus.PAID_WAITING_CARD.value
        ),
        "approved_waiting_card": sum(
            1
            for row in rows
            if row["renewal_status"]
            == AnnualMembershipTermStatus.APPROVED_WAITING_CARD.value
        ),
        "theoretical_total": float(theoretical),
        "collected_total": float(paid_total),
        "outstanding_total": float(max(theoretical - paid_total, Decimal("0.00"))),
        "currency": str(org.membership_fee_currency or "EUR"),
    }

    filtered = rows
    normalized_search = (search or "").strip().lower()
    if normalized_search:
        filtered = [
            row
            for row in filtered
            if normalized_search
            in " ".join(
                str(row.get(field) or "").lower()
                for field in ("first_name", "last_name", "email")
            )
        ]
    normalized_status = (status_filter or "").strip().lower()
    if normalized_status == "renewed":
        filtered = [row for row in filtered if row["renewed"]]
    elif normalized_status == "unpaid":
        filtered = [row for row in filtered if row["payment_state"] == "unpaid"]
    elif normalized_status:
        filtered = [row for row in filtered if row["renewal_status"] == normalized_status]

    return {
        "year": year,
        "kpis": kpis,
        "items": filtered[offset : offset + limit],
        "total": len(filtered),
    }


def get_quote_member(
    db: Session,
    *,
    org_id: int,
    member_id: int,
) -> Member:
    member = (
        db.query(Member)
        .filter(
            Member.id == member_id,
            Member.org_id == org_id,
            Member.deleted_at.is_(None),
        )
        .first()
    )
    if member is None:
        raise HTTPException(status_code=404, detail="Socio non trovato.")
    return member


def send_manual_quote_reminders(
    db: Session,
    *,
    org_id: int,
    membership_year: int,
    member_ids: Iterable[int] | None = None,
    now: datetime | None = None,
) -> int:
    query = db.query(AnnualMembershipTerm).filter(
        AnnualMembershipTerm.org_id == org_id,
        AnnualMembershipTerm.membership_year == membership_year - 1,
    )
    requested_ids = [int(value) for value in (member_ids or [])]
    if requested_ids:
        query = query.filter(AnnualMembershipTerm.member_id.in_(requested_ids))
    return sum(
        1
        for source in query.all()
        if send_renewal_reminder(db, source=source, now=now, manual=True)
    )
