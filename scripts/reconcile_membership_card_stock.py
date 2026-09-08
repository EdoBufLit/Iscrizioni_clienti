"""Audit old SumUp links; --apply protects them with holds or closes obsolete links.

Run after the reservation migration. The default mode makes only provider GETs
and database reads. It does not issue cards, send email or cancel checkouts.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException
from sqlalchemy import select, text

from app.db import SessionLocal
from app.models import MembershipPayment, Organization
from app.services.card_allocation import lock_card_allocation
from app.services.card_reservations import (
    PAID_STATUSES, _definitively_unpaid_expired, _worker_request,
    reserve_payment_card,
)
from app.services.membership_payments import (
    _sumup_request, decrypt_sumup_api_key,
    update_payment_state_from_sumup, verify_sumup_checkout,
)


def _lock_current_payment(db, payment, checkout_id):
    lock_card_allocation(
        db, payment.org_id,
        payment.membership_year or datetime.now(timezone.utc).year,
    )
    db.refresh(payment, with_for_update=True)
    if payment.sumup_checkout_id != checkout_id:
        raise RuntimeError("Checkout identity changed during reconciliation")
    return payment


def _verify_snapshot(org, checkout_id):
    # Do not let an ORM refresh change the provider identity while I/O is
    # outstanding. Its identity is checked again under the allocation lock.
    return verify_sumup_checkout(org, SimpleNamespace(sumup_checkout_id=checkout_id))


def _apply_verified(db, payment, org, verified, *, checkout_id):
    payment = _lock_current_payment(db, payment, checkout_id)
    if verified.get("id") and str(verified["id"]) != checkout_id:
        raise RuntimeError("Provider returned a different checkout identity")
    update_payment_state_from_sumup(
        db=db, payment=payment, org=org,
        verified_payload=verified, request=_worker_request(),
    )
    return payment


def _close_unpaid_checkout(db, payment, org) -> str:
    checkout_id = payment.sumup_checkout_id
    api_key = decrypt_sumup_api_key(org.sumup_api_key_encrypted)
    # Persist the last verified state and release all stock/payment locks
    # before attempting deactivation. Provider uncertainty never frees stock.
    db.commit()
    try:
        _sumup_request(method="DELETE", path=f"checkouts/{checkout_id}", api_key=api_key)
    except HTTPException:
        pass
    verified = _verify_snapshot(org, checkout_id)
    payment = _apply_verified(db, payment, org, verified, checkout_id=checkout_id)
    if payment.status in PAID_STATUSES:
        return "paid_during_reconciliation"
    if not _definitively_unpaid_expired(verified):
        raise RuntimeError("Checkout remains uncertain or in flight; retained for manual review")
    payment.reservation_state = "released"
    payment.status = "expired"
    return "closed"


def _apply(db, payment, org, verified) -> str:
    checkout_id = payment.sumup_checkout_id
    payment = _lock_current_payment(db, payment, checkout_id)
    # The audit GET already ran without stock locks. Reloading local state
    # makes its application monotonic if a webhook arrived during that GET.
    if payment.reservation_state is not None:
        return "already_protected"
    payment = _apply_verified(db, payment, org, verified, checkout_id=checkout_id)
    if payment.status in PAID_STATUSES:
        return "paid_reconciled"
    if _definitively_unpaid_expired(verified):
        payment.reservation_state = "released"
        return "already_expired"
    other_paid = db.execute(select(MembershipPayment.id).where(
        MembershipPayment.socio_id == payment.socio_id,
        MembershipPayment.id != payment.id,
        MembershipPayment.payment_kind == payment.payment_kind,
        MembershipPayment.status.in_(PAID_STATUSES),
        (MembershipPayment.annual_term_id == payment.annual_term_id)
        if payment.payment_kind == "renewal" else MembershipPayment.payment_kind == "initial",
    ).limit(1)).first() if payment.socio_id is not None else None
    if payment.member is None or other_paid:
        return _close_unpaid_checkout(db, payment, org)
    payment.membership_year = (payment.membership_year
                               or (payment.annual_term.membership_year if payment.annual_term is not None else None)
                               or payment.created_at.year)
    try:
        reserve_payment_card(db, payment)
    except HTTPException as exc:
        if exc.status_code != 409:
            raise
        return _close_unpaid_checkout(db, payment, org)
    # The external update can be uncertain. The committed hold still protects
    # the number and the regular worker will verify/deactivate at its deadline.
    expires_at = payment.reservation_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    api_key = decrypt_sumup_api_key(org.sumup_api_key_encrypted)
    db.commit()
    expiry_update_uncertain = False
    try:
        _sumup_request(method="PATCH", path=f"checkouts/{checkout_id}", api_key=api_key,
                       json_payload={"valid_until": expires_at.astimezone(timezone.utc).isoformat()})
    except HTTPException:
        # An uncertain PATCH cannot undo the committed reservation. Verify
        # any concurrent payment now; the worker will retry at the deadline.
        expiry_update_uncertain = True
    verified = _verify_snapshot(org, checkout_id)
    payment = _apply_verified(db, payment, org, verified, checkout_id=checkout_id)
    if payment.status in PAID_STATUSES:
        return "paid_reconciled"
    if expiry_update_uncertain and payment.reservation_state == "held":
        return "reserved_expiry_update_pending"
    return "reserved" if payment.reservation_state == "held" else payment.reservation_state


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--org-id", type=int)
    args = parser.parse_args()
    with SessionLocal() as db:
        query = select(MembershipPayment.id).where(
            MembershipPayment.provider == "sumup", MembershipPayment.sumup_checkout_id.isnot(None),
            MembershipPayment.reservation_state.is_(None), MembershipPayment.status.notin_(PAID_STATUSES),
        )
        if args.org_id is not None:
            query = query.where(MembershipPayment.org_id == args.org_id)
        ids = list(db.execute(query.order_by(MembershipPayment.id)).scalars())
    print(json.dumps({"apply": args.apply, "candidates": len(ids)}), flush=True)
    errors = 0
    for payment_id in ids:
        with SessionLocal() as db:
            try:
                if not args.apply and db.get_bind().dialect.name == "postgresql":
                    db.execute(text("SET TRANSACTION READ ONLY"))
                payment = db.get(MembershipPayment, payment_id)
                org = db.get(Organization, payment.org_id)
                verified = verify_sumup_checkout(org, payment)
                result = {"payment_id": payment.id, "org_id": payment.org_id,
                          "provider_status": verified.get("status"), "valid_until": verified.get("valid_until")}
                if args.apply:
                    result["result"] = _apply(db, payment, org, verified)
                    db.commit()
                else:
                    db.rollback()
                print(json.dumps(result, default=str), flush=True)
            except Exception as exc:
                db.rollback()
                errors += 1
                print(json.dumps({"payment_id": payment_id, "error_type": type(exc).__name__}), flush=True)
    print(json.dumps({"checked": len(ids), "errors": errors}), flush=True)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
