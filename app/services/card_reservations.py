"""Durable card holds: provider confirmation, never the local clock, releases stock."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
from typing import Any, Callable
from urllib.parse import urlencode, urlsplit

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import CardBatch, MembershipPayment, Organization
from app.services.card_allocation import CardAllocationResult, allocate_next_card, lock_card_allocation
from app.services.card_availability import occupied_card_numbers


logger = logging.getLogger(__name__)
RESERVATION_MINUTES = 15
STOCK_EXHAUSTED_MESSAGE = "Tessere esaurite: pagamento online temporaneamente non disponibile."
PAID_STATUSES = {"completed", "manual_completed"}


def _utc(value: datetime | None = None) -> datetime:
    value = value or datetime.now(timezone.utc)
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _lock_payment(db: Session, payment: MembershipPayment) -> MembershipPayment:
    year = payment.reserved_card_year or payment.membership_year or _utc().year
    lock_card_allocation(db, payment.org_id, int(year))
    db.flush()
    if payment.id is None:
        raise ValueError("Payment must be persisted before reserving a card")
    return db.execute(
        select(MembershipPayment).where(MembershipPayment.id == payment.id)
        .with_for_update().execution_options(populate_existing=True)
    ).scalar_one()


def _allocation(payment: MembershipPayment) -> CardAllocationResult:
    if payment.reserved_card_no is None or payment.reserved_batch_id is None or payment.reserved_card_year is None:
        raise HTTPException(status_code=409, detail="Prenotazione tessera incompleta: verifica amministrativa necessaria.")
    return CardAllocationResult(
        card_no=payment.reserved_card_no, batch_id=payment.reserved_batch_id,
        year=payment.reserved_card_year, numbering_scope_id=payment.reserved_numbering_scope_id,
    )


def reserve_payment_card(db: Session, payment: MembershipPayment, *, now: datetime | None = None) -> CardAllocationResult:
    """Reserve under the allocation lock; caller commits BEFORE contacting SumUp."""
    payment = _lock_payment(db, payment)
    if payment.reservation_state == "held":
        return _allocation(payment)
    if payment.reservation_state in {"consumed", "released"}:
        raise HTTPException(status_code=409, detail="Questo tentativo di pagamento è già concluso.")
    try:
        allocation = allocate_next_card(db, payment.org_id, int(payment.membership_year or _utc(now).year))
    except HTTPException as exc:
        if exc.status_code == 409:
            raise HTTPException(status_code=409, detail=STOCK_EXHAUSTED_MESSAGE) from exc
        raise
    payment.reserved_card_no = allocation.card_no
    payment.reserved_batch_id = allocation.batch_id
    payment.reserved_card_year = allocation.year
    payment.reserved_numbering_scope_id = allocation.numbering_scope_id
    payment.reservation_expires_at = _utc(now) + timedelta(minutes=RESERVATION_MINUTES)
    payment.reservation_state = "held"
    db.flush()
    return allocation


def find_member_paid_reservation(db: Session, member_id: int, year: int | None = None) -> MembershipPayment | None:
    query = select(MembershipPayment).where(
        MembershipPayment.socio_id == member_id,
        MembershipPayment.payment_kind == "initial",
        MembershipPayment.status.in_(PAID_STATUSES),
        MembershipPayment.reservation_state == "held",
    )
    if year is not None:
        query = query.where(MembershipPayment.reserved_card_year == year)
    return db.execute(query.order_by(MembershipPayment.id.desc())).scalars().first()


def reserved_payment_allocation(db: Session, payment: MembershipPayment) -> CardAllocationResult | None:
    """Consume the exact paid hold within the member/term assignment transaction."""
    payment = _lock_payment(db, payment)
    if payment.reservation_state != "held":
        return None
    if payment.status not in PAID_STATUSES:
        raise HTTPException(status_code=409, detail="Pagamento non ancora confermato.")
    allocation = _allocation(payment)
    batch = db.get(CardBatch, allocation.batch_id)
    if (
        batch is None or batch.org_id != payment.org_id or batch.released_at is not None
        or not batch.is_enabled or batch.year != allocation.year
        or not batch.start_no <= allocation.card_no <= batch.end_no
        or batch.numbering_scope_id != allocation.numbering_scope_id
    ):
        raise HTTPException(status_code=409, detail="Il lotto della tessera prenotata richiede una verifica amministrativa.")
    occupied = occupied_card_numbers(
        db, org_id=payment.org_id, scope_id=allocation.numbering_scope_id,
        start_no=allocation.card_no, end_no=allocation.card_no, year=allocation.year,
        exclude_payment_id=payment.id,
    )
    if allocation.card_no in occupied:
        raise HTTPException(status_code=409, detail="La tessera prenotata risulta già impegnata.")
    payment.reservation_state = "consumed"
    db.flush()
    return allocation


def _definitively_unpaid_expired(payload: dict[str, Any]) -> bool:
    if str(payload.get("status", "")).upper() != "EXPIRED":
        return False
    transactions = payload.get("transactions")
    if not isinstance(transactions, list):
        return False
    # FAILED describes one failed attempt and can still be retried on the same
    # checkout. EXPIRED + only failed/cancelled attempts is the required proof.
    return all(
        isinstance(tx, dict) and str(tx.get("status", "")).upper() in {"FAILED", "CANCELLED"}
        for tx in transactions
    )


def settle_paid_reservation_for_existing_card(db: Session, payment: MembershipPayment, owner) -> bool:
    """Settle a duplicate payment hold when this membership already owns a card.

    A manual issuance may precede a late online confirmation. Keep the issued
    card and release only the unused hold belonging to that paid membership.
    This is fulfillment reconciliation, never expiration of a paid checkout.
    """
    from app.models import AnnualMembershipTerm, Member

    payment = _lock_payment(db, payment)
    if payment.status not in PAID_STATUSES or payment.reservation_state != "held":
        return False
    if isinstance(owner, Member):
        identity_matches = payment.payment_kind == "initial" and payment.socio_id == owner.id
    elif isinstance(owner, AnnualMembershipTerm):
        identity_matches = payment.payment_kind == "renewal" and payment.annual_term_id == owner.id
    else:
        return False
    if (
        not identity_matches or owner.org_id != payment.org_id or owner.card_no is None
        or owner.card_year != payment.reserved_card_year or owner.batch_id is None
    ):
        return False
    batch = db.get(CardBatch, owner.batch_id)
    if (batch is None or batch.org_id != owner.org_id or batch.year != owner.card_year
            or not batch.start_no <= owner.card_no <= batch.end_no):
        return False
    payment.reservation_state = "consumed" if owner.card_no == payment.reserved_card_no else "released"
    db.flush()
    return True


def release_payment_reservation(db: Session, payment: MembershipPayment, *, verified_payload: dict[str, Any]) -> bool:
    payment = _lock_payment(db, payment)
    if payment.reservation_state != "held" or payment.status in PAID_STATUSES:
        return False
    if not _definitively_unpaid_expired(verified_payload):
        return False
    if payment.sumup_checkout_id and str(verified_payload.get("id") or payment.sumup_checkout_id) != str(payment.sumup_checkout_id):
        return False
    payment.reservation_state = "released"
    payment.status = "expired"
    payment.raw_last_status_response = verified_payload
    db.flush()
    return True


def _provider_request(org: Organization, *, method: str, path: str):
    from app.services.membership_payments import _sumup_request, decrypt_sumup_api_key
    return _sumup_request(method=method, path=path, api_key=decrypt_sumup_api_key(org.sumup_api_key_encrypted))


def _hosted_url(payload: dict[str, Any]) -> str | None:
    hosted = payload.get("hosted_checkout") or {}
    return (payload.get("hosted_checkout_url") or hosted.get("checkout_url")
            or hosted.get("hosted_checkout_url") or payload.get("checkout_url"))


def ensure_checkout_reference_recovered(db: Session, payment: MembershipPayment, org: Organization, *, now: datetime | None = None) -> bool:
    """Recover a lost POST response without ever repeating POST /checkouts."""
    payment = _lock_payment(db, payment)
    if payment.sumup_checkout_id:
        return True
    if not payment.checkout_reference:
        return False
    reference = payment.checkout_reference
    # Never keep the shared numbering-scope lock across a provider request.
    # The committed hold remains part of occupancy while I/O is outstanding.
    db.commit()
    payload = _provider_request(org, method="GET", path="checkouts?" + urlencode({"checkout_reference": reference}))
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict) and isinstance(payload.get("items"), list):
        rows = payload["items"]
        if payload.get("next_cursor") or payload.get("next"):
            raise HTTPException(status_code=502, detail="Risposta SumUp incompleta durante la verifica del pagamento.")
    else:
        raise HTTPException(status_code=502, detail="Risposta SumUp non valida durante la verifica del pagamento.")
    matches = [r for r in rows if isinstance(r, dict) and r.get("checkout_reference") == reference]
    if len(matches) > 1:
        raise HTTPException(status_code=409, detail="Più checkout associati al pagamento: verifica amministrativa necessaria.")
    if rows and not matches:
        raise HTTPException(status_code=502, detail="Risposta SumUp non coerente con il riferimento del pagamento.")
    payment = _lock_payment(db, payment)
    if payment.sumup_checkout_id:
        return True
    if payment.checkout_reference != reference:
        raise HTTPException(status_code=409, detail="Il tentativo di pagamento è cambiato durante la verifica.")
    if matches:
        found = matches[0]
        if not found.get("id"):
            raise HTTPException(status_code=502, detail="Risposta SumUp priva dell'identificativo checkout.")
        payment.sumup_checkout_id = str(found["id"])
        payment.hosted_checkout_url = _hosted_url(found)
        payment.raw_create_response = found
        db.flush()
        return True
    if (
        payment.reservation_state == "held" and payment.status not in PAID_STATUSES
        and payment.reservation_expires_at is not None and _utc(now) >= _utc(payment.reservation_expires_at)
    ):
        # The original POST always carries this absolute valid_until. Once it
        # has passed, an empty successful reference lookup cannot create a new
        # payable checkout. An error/unknown response never reaches this branch.
        payment.reservation_state = "released"
        payment.status = "expired"
        db.flush()
    return False


def reconcile_payment_reservation(db: Session, payment: MembershipPayment, org: Organization, *, request: Request | None = None, now: datetime | None = None) -> str:
    """Commit durable holds before I/O; caller commits the final verified state."""
    from app.services.membership_payments import update_payment_state_from_sumup, verify_sumup_checkout

    payment = _lock_payment(db, payment)
    if payment.reservation_state != "held":
        return payment.reservation_state or "legacy"
    if payment.status in PAID_STATUSES:
        # A paid reservation is not a timed lease. Re-attempt workflow delivery
        # even days later, retaining the number while approval is outstanding.
        if payment.payment_kind == "renewal":
            from app.services.renewals import complete_renewal_payment
            complete_renewal_payment(db, payment=payment, now=now)
        elif payment.member is not None:
            from app.services.membership_payments import maybe_fulfill_member_card
            maybe_fulfill_member_card(db=db, member=payment.member, org=org, payment=payment, request=request)
        return payment.reservation_state
    if not ensure_checkout_reference_recovered(db, payment, org, now=now):
        return payment.reservation_state or "legacy"
    checkout_id = payment.sumup_checkout_id
    db.commit()
    verified = verify_sumup_checkout(org, payment)
    payment = _lock_payment(db, payment)
    if payment.sumup_checkout_id != checkout_id:
        raise HTTPException(status_code=409, detail="Il tentativo di pagamento è cambiato durante la verifica.")
    update_payment_state_from_sumup(db=db, payment=payment, org=org, verified_payload=verified, request=request)
    if payment.status in PAID_STATUSES or payment.reservation_state != "held":
        return payment.reservation_state
    if payment.reservation_expires_at is None or _utc(now) < _utc(payment.reservation_expires_at):
        return "held"
    # Deactivation may race a successful payment or fail while a transaction is
    # processing. Always GET again, even when DELETE did not succeed.
    if not _definitively_unpaid_expired(verified):
        db.commit()
        try:
            _provider_request(org, method="DELETE", path=f"checkouts/{checkout_id}")
        except HTTPException:
            logger.warning("membership_checkout_deactivation_pending payment_id=%s", payment.id)
        verified = verify_sumup_checkout(org, payment)
        payment = _lock_payment(db, payment)
        update_payment_state_from_sumup(db=db, payment=payment, org=org, verified_payload=verified, request=request)
    release_payment_reservation(db, payment, verified_payload=verified)
    return payment.reservation_state


def _worker_request() -> Request:
    base = urlsplit(settings.BASE_URL)
    return Request({
        "type": "http", "http_version": "1.1", "method": "POST", "scheme": base.scheme or "https",
        "path": "/api/webhooks/sumup", "root_path": "", "query_string": b"",
        "headers": [(b"host", base.netloc.encode())], "server": (base.hostname or "localhost", base.port or (443 if base.scheme == "https" else 80)),
        "client": ("127.0.0.1", 0),
    })


def reconcile_membership_payments_once(*, limit: int = 50, heartbeat: Callable[[], Any] | None = None) -> dict[str, int]:
    if limit < 1:
        raise ValueError("limit must be positive")
    with SessionLocal() as db:
        ids = list(db.execute(
            select(MembershipPayment.id).where(MembershipPayment.reservation_state == "held")
            .order_by(MembershipPayment.updated_at.asc(), MembershipPayment.id.asc()).limit(limit)
        ).scalars())
    result = {"checked": 0, "held": 0, "consumed": 0, "released": 0, "errors": 0}
    for payment_id in ids:
        with SessionLocal() as db:
            try:
                payment = db.get(MembershipPayment, payment_id)
                if payment is None:
                    continue
                org = db.get(Organization, payment.org_id)
                if org is None:
                    continue
                state = reconcile_payment_reservation(db, payment, org, request=_worker_request())
                payment.updated_at = _utc()
                db.commit()
                result["checked"] += 1
                if state in {"held", "consumed", "released"}:
                    result[state] += 1
            except Exception as exc:
                db.rollback()
                result["errors"] += 1
                logger.error("membership_reservation_reconcile_failed payment_id=%s error_type=%s", payment_id, type(exc).__name__)
                # Keep failed jobs in rotation so an outage for one association
                # cannot starve every later hold in the batch queue.
                payment = db.get(MembershipPayment, payment_id)
                if payment is not None:
                    payment.updated_at = _utc()
                    db.commit()
            finally:
                if heartbeat is not None:
                    heartbeat()
    return result
