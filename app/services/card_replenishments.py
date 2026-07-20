from __future__ import annotations

import html
import logging
import re
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.models import (
    AdminUser,
    Organization,
    RechargeRequest,
    RechargeRequestAccountingEvent,
)
from app.services.card_lot_registry import ensure_recharge_request_batch
from app.services.annual_memberships import as_rome_datetime
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.numbering_scopes import (
    NUMBERING_MODE_SHARED_ASSONAM,
    get_assonam_central_scope,
    get_numbering_mode,
)

logger = logging.getLogger(__name__)

CARD_REPLENISHMENT_UNIT_PRICE_CENTS = 100
CARD_REPLENISHMENT_CURRENCY = "EUR"
CARD_REPLENISHMENT_MIN_QUANTITY = 1
CARD_REPLENISHMENT_MAX_QUANTITY = 5000

BILLING_STATUS_NOT_APPLICABLE = "not_applicable"
BILLING_STATUS_UNPAID = "unpaid"
BILLING_STATUS_PAID = "paid"
PORTAL_SOURCE = "org_admin_portal"

_IDEMPOTENCY_KEY_RE = re.compile(r"^[A-Za-z0-9._:-]{8,64}$")


def normalize_idempotency_key(value: str | None) -> str | None:
    normalized = (value or "").strip()
    if not normalized:
        return None
    if not _IDEMPOTENCY_KEY_RE.fullmatch(normalized):
        raise ValueError(
            "La chiave di richiesta deve contenere da 8 a 64 caratteri alfanumerici"
        )
    return normalized


def allowed_replenishment_years(*, now: datetime | None = None) -> tuple[int, int]:
    current_year = as_rome_datetime(now).year
    return current_year, current_year + 1


def normalize_requested_year(
    value: int | None,
    *,
    now: datetime | None = None,
) -> int:
    allowed_years = allowed_replenishment_years(now=now)
    normalized = allowed_years[0] if value is None else int(value)
    if normalized not in allowed_years:
        raise ValueError(
            "L'anno del lotto deve essere l'anno corrente o quello successivo"
        )
    return normalized


def replenishment_capability(db: Session, org: Organization) -> dict[str, object]:
    central_scope = get_assonam_central_scope(db)
    mode = get_numbering_mode(org)
    can_auto_allocate = bool(
        central_scope is not None
        and org.numbering_scope_id == central_scope.id
        and mode == NUMBERING_MODE_SHARED_ASSONAM
    )
    if can_auto_allocate:
        message = None
    elif central_scope is None:
        message = (
            "Il pool centrale ASSONAM non e configurato. Contatta il Super Admin "
            "prima di richiedere un lotto."
        )
    else:
        message = (
            "Questa associazione usa una numerazione dedicata: il rifornimento "
            "automatico dal portale non e disponibile. Contatta il Super Admin."
        )
    allowed_years = allowed_replenishment_years()
    return {
        "can_auto_allocate": can_auto_allocate,
        "numbering_mode": mode,
        "blocked_reason": message,
        "unit_price_cents": CARD_REPLENISHMENT_UNIT_PRICE_CENTS,
        "currency": CARD_REPLENISHMENT_CURRENCY,
        "min_quantity": CARD_REPLENISHMENT_MIN_QUANTITY,
        "max_quantity": CARD_REPLENISHMENT_MAX_QUANTITY,
        "default_year": allowed_years[0],
        "allowed_years": list(allowed_years),
    }


def serialize_replenishment_request(
    item: RechargeRequest,
    *,
    include_events: bool = False,
) -> dict[str, object]:
    batch = item.card_batch
    payload: dict[str, object] = {
        "id": item.id,
        "organization_id": item.association_id,
        "organization_name": item.association_name,
        "requested_cards": int(item.requested_cards),
        "requested_year": int(item.requested_year),
        "notes": item.notes,
        "allocation_status": item.status,
        "card_batch_id": item.card_batch_id,
        "batch_range_start": batch.start_no if batch is not None else None,
        "batch_range_end": batch.end_no if batch is not None else None,
        "source": item.source,
        "unit_price_cents": int(item.unit_price_cents),
        "amount_due_cents": int(item.amount_due_cents),
        "currency": item.currency,
        "billing_status": item.billing_status,
        "paid_at": item.paid_at.isoformat() if item.paid_at else None,
        "paid_by_admin_id": item.paid_by_admin_id,
        "payment_reference": item.payment_reference,
        "accounting_note": item.accounting_note,
        "accounting_updated_at": (
            item.accounting_updated_at.isoformat()
            if item.accounting_updated_at
            else None
        ),
        "super_admin_notified_at": (
            item.super_admin_notified_at.isoformat()
            if item.super_admin_notified_at
            else None
        ),
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }
    if include_events:
        payload["accounting_events"] = [
            {
                "id": event.id,
                "actor_admin_id": event.actor_admin_id,
                "previous_status": event.previous_status,
                "new_status": event.new_status,
                "changes": event.changes_json or {},
                "created_at": event.created_at.isoformat()
                if event.created_at
                else None,
            }
            for event in item.accounting_events
        ]
    return payload


def load_replenishment_request(
    db: Session,
    request_id: int,
) -> RechargeRequest | None:
    return (
        db.query(RechargeRequest)
        .options(
            joinedload(RechargeRequest.organization),
            joinedload(RechargeRequest.card_batch),
            joinedload(RechargeRequest.accounting_events),
        )
        .filter(RechargeRequest.id == request_id)
        .first()
    )


def _queue_super_admin_notification(
    db: Session,
    recharge_request: RechargeRequest,
) -> None:
    recipient = (settings.SUPER_ADMIN_EMAIL or "").strip()
    if not recipient:
        logger.warning(
            "card_replenishment_email_skipped request_id=%s reason=missing_super_admin_email",
            recharge_request.id,
        )
        return

    amount_eur = recharge_request.amount_due_cents / 100
    safe_org_name = html.escape(recharge_request.association_name)
    text_body = (
        f"Nuova richiesta tessere #{recharge_request.id}\n\n"
        f"Associazione: {recharge_request.association_name}\n"
        f"Quantita: {recharge_request.requested_cards}\n"
        f"Anno lotto: {recharge_request.requested_year}\n"
        f"Debito registrato: EUR {amount_eur:.2f}\n\n"
        "Apri la sezione Super Admin > Crediti tessere per gestire lo stato contabile."
    )
    html_body = (
        "<h2>Nuova richiesta tessere</h2>"
        f"<p><strong>Associazione:</strong> {safe_org_name}</p>"
        f"<p><strong>Quantita:</strong> {recharge_request.requested_cards}</p>"
        f"<p><strong>Anno lotto:</strong> {recharge_request.requested_year}</p>"
        f"<p><strong>Debito registrato:</strong> EUR {amount_eur:.2f}</p>"
        "<p>Apri la sezione <strong>Crediti tessere</strong> del Super Admin per "
        "gestire lo stato contabile.</p>"
    )
    outbox_id = enqueue_email(
        db,
        email_type="card_replenishment_requested",
        to_email=recipient,
        subject=(
            f"Richiesta tessere #{recharge_request.id} - "
            f"{recharge_request.association_name}"
        )[:200],
        payload=build_email_payload(
            text_body=text_body,
            html_body=html_body,
            meta={
                "recharge_request_id": recharge_request.id,
                "org_id": recharge_request.association_id,
                "requested_year": recharge_request.requested_year,
            },
        ),
        priority=3,
        dedupe_key=f"card_replenishment_requested:{recharge_request.id}",
    )
    recharge_request.notification_email_outbox_id = outbox_id
    recharge_request.super_admin_notified_at = datetime.utcnow()


def create_portal_replenishment_request(
    db: Session,
    *,
    org: Organization,
    requested_by: AdminUser,
    requested_cards: int,
    requested_year: int | None,
    notes: str | None,
    idempotency_key: str | None,
) -> tuple[RechargeRequest, bool]:
    quantity = int(requested_cards)
    if quantity < CARD_REPLENISHMENT_MIN_QUANTITY or quantity > CARD_REPLENISHMENT_MAX_QUANTITY:
        raise ValueError("La quantita deve essere compresa tra 1 e 5000 tessere")
    normalized_year = normalize_requested_year(requested_year)

    capability = replenishment_capability(db, org)
    if not capability["can_auto_allocate"]:
        raise RuntimeError(str(capability["blocked_reason"]))

    normalized_key = normalize_idempotency_key(idempotency_key)
    if normalized_key:
        existing = (
            db.query(RechargeRequest)
            .options(joinedload(RechargeRequest.card_batch))
            .filter(
                RechargeRequest.association_id == org.id,
                RechargeRequest.idempotency_key == normalized_key,
            )
            .first()
        )
        if existing is not None:
            return existing, False

    normalized_notes = (notes or "").strip()[:1000] or None
    recharge_request = RechargeRequest(
        association_id=org.id,
        association_name=org.name,
        requester_whatsapp="portal:org-admin",
        requester_profile_name="Portale Org Admin",
        requested_cards=quantity,
        requested_year=normalized_year,
        notes=normalized_notes,
        source=PORTAL_SOURCE,
        requested_by_admin_id=requested_by.id,
        idempotency_key=normalized_key,
        unit_price_cents=CARD_REPLENISHMENT_UNIT_PRICE_CENTS,
        amount_due_cents=quantity * CARD_REPLENISHMENT_UNIT_PRICE_CENTS,
        currency=CARD_REPLENISHMENT_CURRENCY,
        billing_status=BILLING_STATUS_UNPAID,
    )
    db.add(recharge_request)
    db.flush()

    created_batch = ensure_recharge_request_batch(db, recharge_request.id)
    if created_batch is None:
        # The pre-flight and allocator use the same configuration. If the
        # configuration changed concurrently, do not leave a debt without cards.
        raise RuntimeError(
            "La numerazione non consente piu l'allocazione automatica. Riprova o contatta il Super Admin."
        )

    _queue_super_admin_notification(db, recharge_request)
    db.flush()
    return recharge_request, True


def update_replenishment_accounting(
    db: Session,
    *,
    recharge_request: RechargeRequest,
    actor: AdminUser,
    billing_status: str,
    paid_at: datetime | None,
    payment_reference: str | None,
    accounting_note: str | None,
) -> RechargeRequestAccountingEvent:
    if recharge_request.source != PORTAL_SOURCE or recharge_request.billing_status not in {
        BILLING_STATUS_UNPAID,
        BILLING_STATUS_PAID,
    }:
        raise ValueError(
            "Le richieste storiche non fanno parte del registro crediti del portale"
        )
    if billing_status not in {BILLING_STATUS_UNPAID, BILLING_STATUS_PAID}:
        raise ValueError("Stato contabile non valido")

    normalized_reference = (payment_reference or "").strip()[:160] or None
    normalized_note = (accounting_note or "").strip()[:2000] or None
    normalized_paid_at = paid_at
    if normalized_paid_at is not None and normalized_paid_at.tzinfo is not None:
        normalized_paid_at = normalized_paid_at.astimezone(timezone.utc).replace(tzinfo=None)

    before = {
        "billing_status": recharge_request.billing_status,
        "paid_at": recharge_request.paid_at.isoformat()
        if recharge_request.paid_at
        else None,
        "paid_by_admin_id": recharge_request.paid_by_admin_id,
        "payment_reference": recharge_request.payment_reference,
        "accounting_note": recharge_request.accounting_note,
    }
    previous_status = recharge_request.billing_status
    recharge_request.billing_status = billing_status
    recharge_request.payment_reference = normalized_reference
    recharge_request.accounting_note = normalized_note
    recharge_request.accounting_updated_at = datetime.utcnow()
    if billing_status == BILLING_STATUS_PAID:
        recharge_request.paid_at = normalized_paid_at or datetime.utcnow()
        recharge_request.paid_by_admin_id = actor.id
    else:
        recharge_request.paid_at = None
        recharge_request.paid_by_admin_id = None

    after = {
        "billing_status": recharge_request.billing_status,
        "paid_at": recharge_request.paid_at.isoformat()
        if recharge_request.paid_at
        else None,
        "paid_by_admin_id": recharge_request.paid_by_admin_id,
        "payment_reference": recharge_request.payment_reference,
        "accounting_note": recharge_request.accounting_note,
    }
    event = RechargeRequestAccountingEvent(
        recharge_request_id=recharge_request.id,
        actor_admin_id=actor.id,
        previous_status=previous_status,
        new_status=billing_status,
        changes_json={"before": before, "after": after},
    )
    db.add(event)
    db.flush()
    return event


def replenishment_summary(db: Session, *, org_id: int | None = None) -> dict[str, int]:
    filters = [
        RechargeRequest.source == PORTAL_SOURCE,
        RechargeRequest.billing_status.in_([BILLING_STATUS_UNPAID, BILLING_STATUS_PAID]),
    ]
    if org_id is not None:
        filters.append(RechargeRequest.association_id == org_id)
    base = db.query(RechargeRequest).filter(*filters)
    total = int(base.count())
    unpaid = int(base.filter(RechargeRequest.billing_status == BILLING_STATUS_UNPAID).count())
    paid = int(base.filter(RechargeRequest.billing_status == BILLING_STATUS_PAID).count())
    outstanding_cents = int(
        db.query(func.coalesce(func.sum(RechargeRequest.amount_due_cents), 0))
        .filter(*filters, RechargeRequest.billing_status == BILLING_STATUS_UNPAID)
        .scalar()
        or 0
    )
    paid_cents = int(
        db.query(func.coalesce(func.sum(RechargeRequest.amount_due_cents), 0))
        .filter(*filters, RechargeRequest.billing_status == BILLING_STATUS_PAID)
        .scalar()
        or 0
    )
    return {
        "total": total,
        "unpaid": unpaid,
        "paid": paid,
        "outstanding_cents": outstanding_cents,
        "paid_cents": paid_cents,
    }
