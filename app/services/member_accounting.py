"""Explicit reconciliation of real receipts; never a payment-provider client.

Receipts and immutable before/after events preserve the original evidence. Only
manual MembershipPayment/MemberPayment rows are accounting projections. Issued
cards are never revoked by an accounting correction.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import unicodedata
import uuid
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException
from sqlalchemy import and_, case, extract, func, literal, or_, select, union_all
from sqlalchemy.orm import Session, joinedload

from app import audit
from app.models import AnnualMembershipTerm, Member, MemberPayment, MemberStatus, MembershipPayment, OperationLog, Organization, TemporaryMembershipPurchase
from app.models_accounting import AccountingAllocation, AccountingEvent, AccountingMutation, AccountingReceipt
from app.services.annual_memberships import as_rome_datetime

PAID = ("completed", "manual_completed")
MAX_CENTS = 1_000_000_000
METHODS = {"cash": "cash", "contanti": "cash", "bank_transfer": "bank_transfer", "bonifico": "bank_transfer", "other": "other", "altro": "other", "sumup": "sumup"}


def _now():
    return datetime.now(timezone.utc)


def _iso(value):
    return value.isoformat() if value is not None else None


def _name(member):
    return " ".join(part for part in (member.first_name, member.last_name) if part).strip() or f"Socio #{member.id}"


def _amount(value) -> int:
    try:
        amount = Decimal(str(value or 0))
        if not amount.is_finite() or abs(amount) > Decimal(MAX_CENTS) / 100 or amount != amount.quantize(Decimal("0.01")):
            raise InvalidOperation()
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(422, "Importo non valido: usare al massimo due decimali.")
    return int(amount * 100)


def _clean(value, limit=1000):
    return (str(value).strip()[:limit] or None) if value is not None else None


def _method(value):
    result = METHODS.get(str(value or "").strip().lower())
    if result is None:
        raise HTTPException(422, "Metodo di incasso non valido.")
    return result


def _payment_year(payment, member=None):
    return int(payment.membership_year or (payment.annual_term.membership_year if payment.annual_term else 0)
               or (payment.confirmed_at or payment.created_at).year or (member.card_year if member else as_rome_datetime().date().year))


def _payment_key(payment, member=None):
    if payment.payment_kind == "temporary" and payment.temporary_purchase_id:
        return f"temporary:{payment.temporary_purchase_id}"
    kind = "renewal" if payment.payment_kind == "renewal" else "initial"
    return f"{kind}:{payment.socio_id}:{_payment_year(payment, member)}"


def _context(db, members, year):
    """Bounded batch read shared by the ledger, Quote and bulk previews."""
    if not members:
        return {}, {}, {}, {}, {}
    ids = [m.id for m in members]
    terms = db.query(AnnualMembershipTerm).filter(AnnualMembershipTerm.member_id.in_(ids)).all()
    payments = db.query(MembershipPayment).options(joinedload(MembershipPayment.annual_term)).filter(
        MembershipPayment.socio_id.in_(ids), MembershipPayment.payment_kind != "temporary",
        or_(MembershipPayment.membership_year == year, MembershipPayment.membership_year.is_(None)),
    ).all()
    allocations = db.query(AccountingAllocation).options(joinedload(AccountingAllocation.receipt)).join(AccountingReceipt).filter(
        AccountingAllocation.member_id.in_(ids), AccountingAllocation.membership_year == year,
        AccountingAllocation.kind != "temporary",
    ).all()
    orgs = {o.id: o for o in db.query(Organization).filter(Organization.id.in_({m.org_id for m in members})).all()}
    term_map, payment_map, allocation_map = defaultdict(list), defaultdict(list), defaultdict(list)
    for item in terms:
        term_map[item.member_id].append(item)
    for item in payments:
        payment_map[item.socio_id].append(item)
    for item in allocations:
        allocation_map[item.member_id].append(item)
    return term_map, payment_map, allocation_map, orgs, {m.id: m for m in members}


def _annual_target(member, year, ctx):
    terms, payments, allocations, orgs, _ = ctx
    org = orgs.get(member.org_id)
    if org is None:
        return None
    history = terms.get(member.id, [])
    term = next((t for t in history if t.membership_year == year and t.org_id == member.org_id), None)
    if member.membership_type == "temporary" and term is None:
        return None
    first_year = min([t.membership_year for t in history] or [int(member.card_year or (member.joined_at.year if member.joined_at else year))])
    if year < first_year or year > max(first_year, as_rome_datetime().date().year) + 1:
        return None
    year_payments = [p for p in payments.get(member.id, []) if p.org_id == member.org_id and _payment_year(p, member) == year]
    kind = "renewal" if year > first_year or any(p.payment_kind == "renewal" for p in year_payments) else "initial"
    target_key = f"{kind}:{member.id}:{year}"
    matching = [a for a in allocations.get(member.id, []) if a.org_id == member.org_id and a.target_key == target_key]
    fee = term.fee_amount if term is not None and term.fee_amount is not None else member.membership_fee_snapshot if kind == "initial" and member.membership_fee_snapshot is not None else org.membership_fee_amount
    expected = max([a.expected_cents for a in matching] or [_amount(fee)])
    covered_ids = {a.payment_id for a in matching if a.payment_id is not None}
    paid = sum(a.amount_cents for a in matching if a.reversed_at is None and not a.receipt.voided)
    paid += sum(_amount(p.amount) for p in year_payments if p.status in PAID and p.id not in covered_ids and _payment_key(p, member) == target_key)
    return dict(target_key=target_key, kind=kind, target_id=term.id if term else None,
                member_id=member.id, member_name=_name(member), email=member.email,
                membership_year=year, label=f"{'Prima quota' if kind == 'initial' else 'Quota annuale'} {year}",
                currency=(term.currency if term else org.membership_fee_currency) or "EUR",
                expected_cents=expected, paid_cents=paid, outstanding_cents=max(0, expected - paid),
                already_paid=paid >= expected and expected > 0, exact_match=False, reasons=[])


def member_year_balances(db: Session, *, members: list[Member], year: int) -> dict[int, dict]:
    result = {}
    for start in range(0, len(members), 500):
        batch = members[start:start + 500]
        ctx = _context(db, batch, year)
        for member in batch:
            target = _annual_target(member, year, ctx)
            result[member.id] = {k: target[k] if target else ("EUR" if k == "currency" else 0)
                                 for k in ("expected_cents", "paid_cents", "outstanding_cents", "currency")}
    return result


def member_year_balance(db: Session, *, member: Member, year: int) -> dict:
    return member_year_balances(db, members=[member], year=year)[member.id]


def guard_partial_manual_payment(db: Session, *, member: Member, year: int | None = None,
                                 purchase: TemporaryMembershipPurchase | None = None):
    target = _temporary_target(db, purchase) if purchase else _annual_target(member, year or as_rome_datetime().year, _context(db, [member], year or as_rome_datetime().year))
    if target and 0 < target["paid_cents"] < target["expected_cents"]:
        raise HTTPException(409, "Quota parzialmente riconciliata: completa il saldo dal registro incassi.")


def _temporary_target(db, purchase):
    member = purchase.member
    key = f"temporary:{purchase.id}"
    allocations = db.query(AccountingAllocation).join(AccountingReceipt).filter(
        AccountingAllocation.org_id == purchase.org_id, AccountingAllocation.target_key == key,
        AccountingAllocation.member_id == member.id,
    ).all()
    covered = {a.payment_id for a in allocations if a.payment_id is not None}
    paid = sum(a.amount_cents for a in allocations if a.reversed_at is None and not a.receipt.voided)
    paid += sum(_amount(p.amount) for p in db.query(MembershipPayment).filter(
        MembershipPayment.org_id == purchase.org_id, MembershipPayment.temporary_purchase_id == purchase.id,
        MembershipPayment.status.in_(PAID),
    ).all() if p.id not in covered)
    expected = max([a.expected_cents for a in allocations] or [_amount(purchase.amount)])
    return dict(target_key=key, kind="temporary", target_id=purchase.id,
                member_id=member.id, member_name=_name(member), email=member.email,
                membership_year=None, label=f"Tessera temporanea #{purchase.id}", currency=purchase.currency,
                expected_cents=expected, paid_cents=paid, outstanding_cents=max(0, expected - paid),
                already_paid=paid >= expected and expected > 0, exact_match=False, reasons=[],
                card_no=purchase.card_no, card_year=purchase.card_year)


def receipt_payload(receipt, allocations=None, allocated_cents=None):
    rows = allocations if allocations is not None else receipt.allocations
    allocated = allocated_cents if allocated_cents is not None else sum(a.amount_cents for a in rows if a.reversed_at is None)
    remaining = 0 if receipt.voided else max(0, receipt.amount_cents - allocated)
    state = "voided" if receipt.voided else "unmatched" if allocated == 0 else "matched" if remaining == 0 else "partial"
    mutable = receipt.source != "provider" and not receipt.voided
    return dict(id=receipt.id, version=receipt.version, amount_cents=receipt.amount_cents,
                currency=receipt.currency, method=receipt.method, paid_on=_iso(receipt.paid_on),
                payer=receipt.payer, reference=receipt.reference, description=receipt.description,
                source=receipt.source, source_key=receipt.source_key, status=state,
                allocated_cents=allocated, unallocated_cents=remaining, created_at=_iso(receipt.created_at),
                permissions=dict(can_adjust=mutable, can_void=mutable,
                                 reason="Il pagamento online è un fatto del provider: nessuna rettifica o rimborso da questa schermata." if receipt.source == "provider" else "Ricevuta annullata." if receipt.voided else None))


def _allocation_payload(item):
    return dict(id=item.id, receipt_id=item.receipt_id, target_key=item.target_key, kind=item.kind,
                target_id=item.target_id, member_id=item.member_id, member_name=item.member_name,
                membership_year=item.membership_year, amount_cents=item.amount_cents,
                net_cents=item.amount_cents if item.reversed_at is None else 0,
                reversed_at=_iso(item.reversed_at), payment_id=item.payment_id, created_at=_iso(item.created_at))


def detail(db, *, receipt):
    allocations = db.query(AccountingAllocation).filter(AccountingAllocation.receipt_id == receipt.id).order_by(AccountingAllocation.id).all()
    events = db.query(AccountingEvent).filter(AccountingEvent.receipt_id == receipt.id).order_by(AccountingEvent.id).all()
    return dict(receipt=receipt_payload(receipt, allocations), allocations=[_allocation_payload(a) for a in allocations],
                events=[dict(id=e.id, action=e.action, reason=e.reason, actor_admin_id=e.actor_admin_id,
                             created_at=_iso(e.created_at), before=e.before_json, after=e.after_json) for e in events])


def get_receipt(db, *, org_id, receipt_id, lock=False):
    query = db.query(AccountingReceipt).filter(AccountingReceipt.id == receipt_id, AccountingReceipt.org_id == org_id)
    if lock:
        query = query.with_for_update().populate_existing()
    receipt = query.first()
    if receipt is None:
        raise HTTPException(404, "Incasso non trovato.")
    return receipt


def _snapshot(db, receipt):
    data = detail(db, receipt=receipt)
    data.pop("events")
    payment_ids = {a["payment_id"] for a in data["allocations"] if a["payment_id"] is not None}
    data["payments"] = [dict(id=p.id, amount_cents=_amount(p.amount), status=p.status, source=p.source,
                             confirmed_at=_iso(p.confirmed_at), notes=p.notes)
                         for p in db.query(MembershipPayment).filter(MembershipPayment.id.in_(payment_ids)).all()]
    data["manual_receipts"] = [dict(id=p.id, membership_payment_id=p.membership_payment_id,
                                     amount_cents=p.amount_cents, method=p.method, paid_at=_iso(p.paid_at), notes=p.notes)
                               for p in db.query(MemberPayment).filter(MemberPayment.membership_payment_id.in_(payment_ids)).all()]
    return data


def _event(db, receipt, *, action, admin_id, before=None, reason=None):
    db.flush()
    after = _snapshot(db, receipt)
    db.add(AccountingEvent(org_id=receipt.org_id, receipt_id=receipt.id, action=action, reason=reason,
                           actor_admin_id=admin_id, actor_snapshot={"admin_id": admin_id, "role": "org_admin" if admin_id else "system"},
                           before_json=before, after_json=after))
    audit.log_operation(db, action=f"accounting.{action}", entity_type="accounting_receipt", entity_id=receipt.id,
                        actor_admin_id=admin_id, actor_role="org_admin" if admin_id else "system", org_id=receipt.org_id,
                        metadata={"org_id": receipt.org_id, "receipt_id": receipt.id, "version": receipt.version, "reason": reason})
    db.flush()


def _lock_org(db, org_id):
    org = db.query(Organization).filter(Organization.id == org_id).with_for_update().populate_existing().first()
    if org is None:
        raise HTTPException(404, "Associazione non trovata.")
    return org


def mutate(db, *, org_id, request_key, operation, payload, callback):
    """Serialize tenant mutations, then claim a payload-bound idempotency key."""
    from app.services.card_allocation import lock_card_allocation
    lock_card_allocation(db, org_id, as_rome_datetime().date().year)
    _lock_org(db, org_id)
    fingerprint = hashlib.sha256(json.dumps({"operation": operation, "payload": payload}, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()
    previous = db.query(AccountingMutation).filter(AccountingMutation.org_id == org_id, AccountingMutation.request_key == request_key).first()
    if previous:
        if previous.payload_hash != fingerprint:
            raise HTTPException(409, "Chiave richiesta già usata con dati diversi.")
        return previous.response_json
    result = callback()
    db.flush()
    db.add(AccountingMutation(org_id=org_id, request_key=request_key, payload_hash=fingerprint, response_json=result))
    db.flush()
    return result


def _assert_mutable(receipt, version):
    if receipt.version != version:
        raise HTTPException(409, "L'incasso è stato aggiornato. Ricarica prima di continuare.")
    if receipt.source == "provider":
        raise HTTPException(409, "I pagamenti online non si rettificano o rimborsano da questa schermata.")
    if receipt.voided:
        raise HTTPException(409, "Incasso già annullato contabilmente.")


def create_receipt(db, *, org_id, admin_id, values, source="manual", source_key=None):
    receipt = AccountingReceipt(org_id=org_id, amount_cents=values["amount_cents"], currency="EUR",
                                method=_method(values["method"]), paid_on=date.fromisoformat(str(values["paid_on"])),
                                payer=_clean(values.get("payer"), 255), reference=_clean(values.get("reference"), 255),
                                description=_clean(values.get("description")), source=source, source_key=source_key,
                                created_by_admin_id=admin_id)
    db.add(receipt)
    db.flush()
    _event(db, receipt, action="created", admin_id=admin_id)
    return detail(db, receipt=receipt)


def list_receipts(db, *, org_id, state=None, search=None, limit=50, offset=0, member_id=None):
    sums = db.query(AccountingAllocation.receipt_id.label("rid"), func.sum(AccountingAllocation.amount_cents).label("allocated")).filter(
        AccountingAllocation.org_id == org_id, AccountingAllocation.reversed_at.is_(None),
    ).group_by(AccountingAllocation.receipt_id).subquery()
    allocated = func.coalesce(sums.c.allocated, 0)
    base = db.query(AccountingReceipt, allocated).outerjoin(sums, sums.c.rid == AccountingReceipt.id).filter(AccountingReceipt.org_id == org_id)
    totals = base.with_entities(
        func.coalesce(func.sum(case((AccountingReceipt.voided.is_(False), AccountingReceipt.amount_cents), else_=0)), 0),
        func.coalesce(func.sum(case((AccountingReceipt.voided.is_(False), allocated), else_=0)), 0),
        func.coalesce(func.sum(case(((AccountingReceipt.voided.is_(False)) & (allocated < AccountingReceipt.amount_cents), 1), else_=0)), 0),
    ).one()
    query = base
    if state == "voided":
        query = query.filter(AccountingReceipt.voided.is_(True))
    elif state:
        query = query.filter(AccountingReceipt.voided.is_(False))
        if state == "unmatched":
            query = query.filter(allocated == 0)
        elif state == "matched":
            query = query.filter(allocated >= AccountingReceipt.amount_cents)
        elif state == "partial":
            query = query.filter(allocated > 0, allocated < AccountingReceipt.amount_cents)
    if search:
        text = func.lower(func.coalesce(AccountingReceipt.payer, "") + " " + func.coalesce(AccountingReceipt.reference, "") + " " + func.coalesce(AccountingReceipt.description, ""))
        query = query.filter(text.contains(search.strip().lower(), autoescape=True))
    if member_id is not None:
        query = query.filter(db.query(AccountingAllocation.id).filter(
            AccountingAllocation.receipt_id == AccountingReceipt.id, AccountingAllocation.member_id == member_id,
            AccountingAllocation.org_id == org_id,
        ).exists())
    total = query.count()
    page = query.order_by(AccountingReceipt.paid_on.desc(), AccountingReceipt.id.desc()).offset(offset).limit(limit).all()
    return {"items": [receipt_payload(r, [], int(n)) for r, n in page], "total": total,
            "kpis": {"total_cents": int(totals[0]), "allocated_cents": int(totals[1]),
                     "unallocated_cents": int(totals[0] - totals[1]), "unmatched_count": int(totals[2])}}


def suggestions(db, *, receipt, search=None, year=None, limit=25, offset=0):
    year = year or as_rome_datetime().date().year
    member_filters = [Member.org_id == receipt.org_id, Member.deleted_at.is_(None), Member.status != MemberStatus.REJECTED]
    if search:
        text = func.lower(func.coalesce(Member.first_name, "") + " " + func.coalesce(Member.last_name, "") + " " + func.coalesce(Member.email, "") + " " + func.coalesce(Member.fiscal_code, ""))
        member_filters.append(text.contains(search.strip().lower(), autoescape=True))
    annual = select(Member.id.label("member_id"), literal(None).label("purchase_id"), Member.last_name.label("last_name"), Member.first_name.label("first_name")).where(
        *member_filters,
        or_(Member.membership_type != "temporary", Member.membership_type.is_(None), db.query(AnnualMembershipTerm.id).filter(
            AnnualMembershipTerm.member_id == Member.id, AnnualMembershipTerm.membership_year == year,
            AnnualMembershipTerm.org_id == receipt.org_id,
        ).exists()),
        or_(Member.card_year.is_(None), Member.card_year <= year),
    )
    temporary = select(Member.id.label("member_id"), TemporaryMembershipPurchase.id.label("purchase_id"), Member.last_name.label("last_name"), Member.first_name.label("first_name")).join(
        TemporaryMembershipPurchase, TemporaryMembershipPurchase.member_id == Member.id,
    ).where(*member_filters, TemporaryMembershipPurchase.org_id == receipt.org_id, TemporaryMembershipPurchase.status != "cancelled")
    candidates = union_all(annual, temporary).subquery()
    total = db.query(func.count()).select_from(candidates).scalar()
    rows = db.execute(select(candidates).order_by(func.lower(candidates.c.last_name), func.lower(candidates.c.first_name), candidates.c.member_id, candidates.c.purchase_id).offset(offset).limit(limit)).all()
    members = db.query(Member).filter(Member.id.in_({r.member_id for r in rows}), Member.org_id == receipt.org_id).all()
    ctx = _context(db, members, year)
    member_map = {m.id: m for m in members}
    purchases = {p.id: p for p in db.query(TemporaryMembershipPurchase).options(joinedload(TemporaryMembershipPurchase.member)).filter(TemporaryMembershipPurchase.id.in_({r.purchase_id for r in rows if r.purchase_id})).all()}
    result = []
    for row in rows:
        target = _temporary_target(db, purchases[row.purchase_id]) if row.purchase_id else _annual_target(member_map[row.member_id], year, ctx)
        if target is None:
            continue
        target["exact_match"] = target["outstanding_cents"] == receipt.amount_cents and target["outstanding_cents"] > 0
        if target["exact_match"]:
            target["reasons"].append("Importo uguale alla quota residua")
        evidence = " ".join(filter(None, (receipt.payer, receipt.reference, receipt.description))).casefold()
        if target["member_name"].casefold() in evidence or (target["email"] and target["email"].casefold() in evidence):
            target["reasons"].append("Nome o email presenti nella descrizione")
        if target["already_paid"]:
            target["reasons"].append("Quota già coperta: non registrare un secondo incasso")
        result.append(target)
    return {"items": result, "total": int(total)}


def _resolve_target(db, *, org_id, key, lock=False, allow_archived=False):
    parts = str(key).split(":")
    try:
        if parts[0] == "temporary" and len(parts) == 2:
            purchase_query = db.query(TemporaryMembershipPurchase).filter(TemporaryMembershipPurchase.id == int(parts[1]), TemporaryMembershipPurchase.org_id == org_id)
            purchase = purchase_query.with_for_update().populate_existing().first() if lock else purchase_query.first()
            if purchase is None or (purchase.status == "cancelled" and not allow_archived):
                raise HTTPException(404, "Acquisto temporaneo non disponibile.")
            member_id, year = purchase.member_id, None
        elif parts[0] in {"initial", "renewal"} and len(parts) == 3:
            member_id, year = int(parts[1]), int(parts[2])
            purchase = None
        else:
            raise ValueError()
    except (ValueError, IndexError):
        raise HTTPException(422, "Destinazione dell'incasso non valida.")
    query = db.query(Member).filter(Member.id == member_id, Member.org_id == org_id)
    if not allow_archived:
        query = query.filter(Member.deleted_at.is_(None), Member.status != MemberStatus.REJECTED)
    member = query.with_for_update().populate_existing().first() if lock else query.first()
    if member is None:
        raise HTTPException(404, "Socio non disponibile per questa associazione.")
    target = _temporary_target(db, purchase) if purchase else _annual_target(member, year, _context(db, [member], year))
    if target is None or target["target_key"] != key:
        raise HTTPException(409, "Quota non disponibile. Ricarica i suggerimenti.")
    org = db.query(Organization).filter(Organization.id == org_id).one()
    return target, member, org, purchase


def _set_member_projection(member, target, *, net, expected, paid_at, paid_status="manual_completed"):
    current = target["kind"] == "initial" and (member.card_year is None or member.card_year == target["membership_year"])
    current = current or (target["kind"] == "renewal" and member.card_year == target["membership_year"])
    current = current or (target["kind"] == "temporary" and member.membership_type == "temporary"
                          and target.get("card_no") is not None and target.get("card_no") == member.card_no
                          and target.get("card_year") == member.card_year)
    if not current:
        return
    paid = net >= expected and expected > 0
    member.payment_status = paid_status if paid else "manual_partial" if net > 0 else "manual_reversed"
    member.payment_completed_at = paid_at if paid else None
    member.card_is_paid = paid
    member.card_paid_at = paid_at if paid else None
    member.card_payment_status = member.payment_status


def _reproject_target(db, *, target, member, org, purchase, admin_id, allow_fulfill=True):
    sync_legacy_receipts(db, org_id=org.id, admin_id=admin_id, target_keys=[target["target_key"]], limit=None)
    rows = db.query(AccountingAllocation).options(joinedload(AccountingAllocation.receipt)).filter(
        AccountingAllocation.org_id == org.id, AccountingAllocation.target_key == target["target_key"],
        AccountingAllocation.member_id == member.id,
    ).order_by(AccountingAllocation.id).all()
    active = [a for a in rows if a.reversed_at is None and not a.receipt.voided]
    manual = [a for a in active if a.receipt.source != "provider"]
    net = sum(a.amount_cents for a in active)
    manual_net = sum(a.amount_cents for a in manual)
    expected = target["expected_cents"]
    ids = {a.payment_id for a in rows if a.payment_id is not None}
    projections = db.query(MembershipPayment).filter(MembershipPayment.id.in_(ids), MembershipPayment.org_id == org.id, MembershipPayment.source == "manual").order_by(MembershipPayment.id.desc()).all()
    payment = projections[0] if projections else None
    paid_at = datetime.combine(max(a.receipt.paid_on for a in manual), datetime.min.time()) if manual else None
    paid = net >= expected and expected > 0
    newly_completed = paid and (payment is None or payment.status not in PAID)
    if payment is None and paid and manual_net > 0:
        term = None
        if target["kind"] == "renewal":
            from app.services.renewals import ensure_renewal_term
            term, _ = ensure_renewal_term(db, member=member, membership_year=target["membership_year"])
        payment = MembershipPayment(
            org_id=org.id, socio_id=member.id, payment_kind=target["kind"],
            membership_year=target["membership_year"] or as_rome_datetime().date().year,
            annual_term_id=term.id if term else target["target_id"] if target["kind"] == "initial" else None,
            temporary_purchase_id=purchase.id if purchase else None,
            provider="none", source="manual", status="manual_completed", amount=Decimal(manual_net) / 100,
            currency=target["currency"], confirmed_at=paid_at, manual_marked_paid_by_user_id=admin_id,
            payment_reason=target["label"], notes="Registrato tramite riconciliazione incassi.",
        )
        db.add(payment)
        db.flush()
    if payment is not None:
        payment.amount = Decimal(manual_net) / 100
        payment.status = "manual_completed" if paid and manual_net else "manual_partial" if manual_net else "manual_reversed"
        payment.confirmed_at = paid_at
        payment.manual_marked_paid_by_user_id = admin_id
        for old in projections[1:]:
            old.amount, old.status = Decimal(0), "manual_reversed"
            old_receipt = db.query(MemberPayment).filter(MemberPayment.membership_payment_id == old.id).first()
            if old_receipt is not None:
                old_receipt.amount_cents = 0
        for allocation in manual:
            allocation.payment_id = payment.id
        methods = {a.receipt.method for a in manual}
        method = next(iter(methods)) if len(methods) == 1 else "other"
        legacy = db.query(MemberPayment).filter(MemberPayment.membership_payment_id == payment.id).first()
        if legacy is not None:
            legacy.amount_cents, legacy.method = manual_net, method
            if paid_at:
                legacy.paid_at = paid_at
        elif manual_net > 0:
            db.add(MemberPayment(member_id=member.id, org_id=org.id, admin_id=admin_id,
                                 amount_cents=manual_net, method=method, paid_at=paid_at,
                                 membership_payment_id=payment.id, notes=payment.notes))
    effective_paid_at = datetime.combine(max(a.receipt.paid_on for a in active), datetime.min.time()) if active else None
    _set_member_projection(member, target, net=net, expected=expected, paid_at=effective_paid_at,
                           paid_status="manual_completed" if manual_net else "completed")
    db.flush()
    if newly_completed and allow_fulfill and payment is not None:
        if purchase is not None:
            from app.services.temporary_memberships import fulfill_purchase
            fulfill_purchase(db, purchase=purchase, payment=payment)
        elif target["kind"] == "renewal":
            from app.services.renewals import complete_renewal_payment
            complete_renewal_payment(db, payment=payment)
        else:
            from app.services.membership_payments import maybe_fulfill_member_card
            maybe_fulfill_member_card(db=db, member=member, org=org, request=None, payment=payment)
            # Fulfillment may have added the annual term to this no-autoflush
            # session; make it visible before looking it up again.
            db.flush()
            from app.services.annual_memberships import sync_annual_membership_term
            term = sync_annual_membership_term(db, member, source="accounting")
            if term is not None:
                db.flush()
                payment.annual_term_id = term.id
    db.flush()


def _block_open_checkout(db, target):
    query = db.query(MembershipPayment).filter(MembershipPayment.org_id == target["org_id"], MembershipPayment.socio_id == target["member_id"], MembershipPayment.source != "manual", or_(MembershipPayment.status == "pending", MembershipPayment.reservation_state == "held"))
    if target["kind"] == "temporary":
        query = query.filter(MembershipPayment.temporary_purchase_id == target["target_id"])
    else:
        query = query.filter(MembershipPayment.payment_kind == target["kind"], MembershipPayment.membership_year == target["membership_year"])
    if query.filter(or_(MembershipPayment.sumup_checkout_id.isnot(None), MembershipPayment.checkout_reference.isnot(None))).first():
        raise HTTPException(409, "È presente un checkout online ancora aperto. Verificarne prima la chiusura per evitare un doppio incasso.")


def allocate(db, *, org_id, receipt_id, admin_id, version, items):
    # Bridge only these obligations. Importing a tenant's whole history during
    # every allocation would make a small reconciliation grow with its archive.
    sync_legacy_receipts(db, org_id=org_id, admin_id=admin_id, target_keys=[item["target_key"] for item in items], limit=None)
    receipt = get_receipt(db, org_id=org_id, receipt_id=receipt_id, lock=True)
    _assert_mutable(receipt, version)
    before = _snapshot(db, receipt)
    available = receipt_payload(receipt)["unallocated_cents"]
    if sum(i["amount_cents"] for i in items) > available:
        raise HTTPException(409, "Gli abbinamenti superano il residuo dell'incasso.")
    keys = [i["target_key"] for i in items]
    if len(keys) != len(set(keys)):
        raise HTTPException(422, "Una quota può comparire una sola volta nella richiesta.")
    resolved = []
    for item in sorted(items, key=lambda i: i["target_key"]):
        target, member, org, purchase = _resolve_target(db, org_id=org_id, key=item["target_key"], lock=True)
        _block_open_checkout(db, {**target, "org_id": org_id})
        if target["currency"] != receipt.currency or item["amount_cents"] > target["outstanding_cents"]:
            raise HTTPException(409, "Importo superiore alla quota residua o valuta non compatibile. Ricarica i saldi.")
        if purchase is not None and purchase.method == "sumup" and purchase.status != "active":
            raise HTTPException(409, "La richiesta temporanea prevede un pagamento online: verificarlo tramite il relativo flusso.")
        db.add(AccountingAllocation(org_id=org_id, receipt_id=receipt.id, target_key=target["target_key"],
                                   kind=target["kind"], target_id=target["target_id"], member_id=member.id,
                                   member_name=_name(member), membership_year=target["membership_year"],
                                   expected_cents=target["expected_cents"], amount_cents=item["amount_cents"]))
        resolved.append((target, member, org, purchase))
    db.flush()
    for target, member, org, purchase in resolved:
        _reproject_target(db, target=target, member=member, org=org, purchase=purchase, admin_id=admin_id)
    receipt.version += 1
    _event(db, receipt, action="allocated", admin_id=admin_id, before=before)
    return detail(db, receipt=receipt)


def adjust(db, *, org_id, receipt_id, admin_id, version, reason, changes):
    receipt = get_receipt(db, org_id=org_id, receipt_id=receipt_id, lock=True)
    _assert_mutable(receipt, version)
    before = _snapshot(db, receipt)
    if changes.get("amount_cents", receipt.amount_cents) < receipt_payload(receipt)["allocated_cents"]:
        raise HTTPException(409, "L'importo non può scendere sotto il già abbinato: storna prima gli abbinamenti interessati.")
    for key, value in changes.items():
        if key == "paid_on":
            value = date.fromisoformat(str(value))
        elif key == "method":
            value = _method(value)
        elif key in {"payer", "reference", "description"}:
            value = _clean(value, 1000 if key == "description" else 255)
        setattr(receipt, key, value)
    db.flush()
    keys = {a.target_key for a in receipt.allocations if a.reversed_at is None and a.member_id is not None}
    for key in sorted(keys):
        target, member, org, purchase = _resolve_target(db, org_id=org_id, key=key, lock=True, allow_archived=True)
        _reproject_target(db, target=target, member=member, org=org, purchase=purchase, admin_id=admin_id, allow_fulfill=False)
    receipt.version += 1
    _event(db, receipt, action="adjusted", admin_id=admin_id, before=before, reason=reason)
    return detail(db, receipt=receipt)


def reverse(db, *, org_id, receipt_id, admin_id, version, reason, allocation_id=None, void=False):
    receipt = get_receipt(db, org_id=org_id, receipt_id=receipt_id, lock=True)
    _assert_mutable(receipt, version)
    before = _snapshot(db, receipt)
    rows = db.query(AccountingAllocation).filter(AccountingAllocation.receipt_id == receipt.id, AccountingAllocation.org_id == org_id, AccountingAllocation.reversed_at.is_(None))
    if allocation_id is not None:
        rows = rows.filter(AccountingAllocation.id == allocation_id)
    allocations = rows.order_by(AccountingAllocation.id).all()
    if allocation_id is not None and not allocations:
        raise HTTPException(404, "Abbinamento attivo non trovato.")
    resolved = {}
    for allocation in allocations:
        if allocation.member_id is not None:
            resolved[allocation.target_key] = _resolve_target(db, org_id=org_id, key=allocation.target_key, lock=True, allow_archived=True)
        allocation.reversed_at = _now()
    if void:
        receipt.voided = True
    db.flush()
    for target, member, org, purchase in resolved.values():
        _reproject_target(db, target=target, member=member, org=org, purchase=purchase, admin_id=admin_id, allow_fulfill=False)
    receipt.version += 1
    _event(db, receipt, action="voided" if void else "allocation_reversed", admin_id=admin_id, before=before, reason=reason)
    return detail(db, receipt=receipt)


def sync_legacy_receipts(db: Session, *, org_id: int, admin_id: int | None = None,
                         target_keys: list[str] | None = None, limit: int | None = 100) -> int:
    """Bring authoritative paid rows into the ledger, without fuzzy links or I/O."""
    from app.services.card_allocation import lock_card_allocation
    lock_card_allocation(db, org_id, as_rome_datetime().date().year)
    org = _lock_org(db, org_id)
    covered = db.query(AccountingAllocation.id).filter(AccountingAllocation.payment_id == MembershipPayment.id).exists()
    imported = db.query(AccountingReceipt.id).filter(AccountingReceipt.legacy_payment_id == MembershipPayment.id).exists()
    query = db.query(MembershipPayment).join(Member, Member.id == MembershipPayment.socio_id).options(joinedload(MembershipPayment.member), joinedload(MembershipPayment.annual_term)).filter(
        MembershipPayment.org_id == org_id, MembershipPayment.socio_id.isnot(None), MembershipPayment.status.in_(PAID),
        Member.org_id == org_id, MembershipPayment.currency == "EUR", MembershipPayment.amount > 0, ~covered, ~imported,
    )
    if target_keys is not None:
        clauses = []
        payment_year = func.coalesce(MembershipPayment.membership_year, AnnualMembershipTerm.membership_year,
                                     extract("year", func.coalesce(MembershipPayment.confirmed_at, MembershipPayment.created_at)))
        query = query.outerjoin(AnnualMembershipTerm, AnnualMembershipTerm.id == MembershipPayment.annual_term_id)
        for key in set(target_keys):
            parts = key.split(":")
            try:
                if len(parts) == 2 and parts[0] == "temporary":
                    clauses.append(MembershipPayment.temporary_purchase_id == int(parts[1]))
                elif len(parts) == 3 and parts[0] in {"initial", "renewal"}:
                    clauses.append(and_(MembershipPayment.payment_kind == parts[0], MembershipPayment.socio_id == int(parts[1]), payment_year == int(parts[2])))
                else:
                    raise ValueError()
            except ValueError:
                raise HTTPException(422, "Destinazione dell'incasso non valida.")
        if not clauses:
            return 0
        query = query.filter(or_(*clauses))
    query = query.order_by(MembershipPayment.id)
    if limit is not None:
        query = query.limit(limit)
    payments = query.all()
    count = 0
    for payment in payments:
        member = payment.member
        if member is None or member.org_id != org_id:
            continue
        legacy = db.query(MemberPayment).filter(MemberPayment.membership_payment_id == payment.id, MemberPayment.org_id == org_id, MemberPayment.member_id == member.id).first()
        if legacy is None:
            # Pre-migration receipts can be linked only by their exact audit ID.
            legacy = db.query(MemberPayment).join(OperationLog, OperationLog.entity_id == MemberPayment.id).filter(
                MemberPayment.org_id == org_id, MemberPayment.member_id == member.id,
                MemberPayment.membership_payment_id.is_(None), OperationLog.action == "member.payment.manual",
                OperationLog.entity_type == "member_payment",
                OperationLog.metadata_json["membership_payment_id"].as_integer() == payment.id,
            ).order_by(MemberPayment.id).first()
            if legacy is not None:
                legacy.membership_payment_id = payment.id
        method = legacy.method if legacy else "other"
        if payment.source != "manual":
            method = "sumup"
        elif legacy is None:
            audit_row = db.query(OperationLog).filter(OperationLog.entity_type == "membership_payment", OperationLog.entity_id == payment.id,
                                                     OperationLog.org_id == org_id).order_by(OperationLog.id.desc()).first()
            if audit_row and isinstance(audit_row.metadata_json, dict):
                method = audit_row.metadata_json.get("method") or "other"
            elif payment.notes and payment.notes.startswith("Metodo: "):
                method = payment.notes.split(".", 1)[0].removeprefix("Metodo: ")
        method = METHODS.get(str(method).lower(), "other")
        paid_on = as_rome_datetime(payment.confirmed_at or payment.created_at).date()
        receipt = AccountingReceipt(org_id=org_id, amount_cents=_amount(payment.amount), currency=payment.currency,
                                    method=method, paid_on=paid_on, payer=_name(member),
                                    reference=payment.checkout_reference, description=payment.notes,
                                    source="legacy_manual" if payment.source == "manual" else "provider",
                                    source_key=f"membership-payment:{payment.id}:{uuid.uuid4().hex}", legacy_payment_id=payment.id,
                                    created_by_admin_id=admin_id or payment.manual_marked_paid_by_user_id)
        db.add(receipt)
        db.flush()
        kind = payment.payment_kind if payment.payment_kind in {"renewal", "temporary"} else "initial"
        expected = _amount(payment.annual_term.fee_amount) if payment.annual_term is not None and payment.annual_term.fee_amount is not None else _amount(member.membership_fee_snapshot if member.membership_fee_snapshot is not None else org.membership_fee_amount)
        if kind == "temporary" and payment.temporary_purchase_id:
            purchase = db.get(TemporaryMembershipPurchase, payment.temporary_purchase_id)
            expected = _amount(purchase.amount) if purchase else _amount(payment.amount)
        db.add(AccountingAllocation(org_id=org_id, receipt_id=receipt.id, target_key=_payment_key(payment, member),
                                   kind=kind, target_id=payment.temporary_purchase_id if kind == "temporary" else payment.annual_term_id,
                                   member_id=member.id, member_name=_name(member), membership_year=None if kind == "temporary" else _payment_year(payment, member),
                                   expected_cents=expected, amount_cents=_amount(payment.amount), payment_id=payment.id))
        _event(db, receipt, action="legacy_imported", admin_id=admin_id or payment.manual_marked_paid_by_user_id)
        count += 1
    db.flush()
    return count


_HEADERS = {
    "date": "paid_on", "data": "paid_on", "paid_on": "paid_on", "data_operazione": "paid_on", "data_valuta": "paid_on",
    "amount": "amount", "importo": "amount", "entrata": "amount", "accredito": "amount",
    "reference": "reference", "riferimento": "reference", "trn": "reference", "cro": "reference", "id_operazione": "reference",
    "payer": "payer", "ordinante": "payer", "pagante": "payer", "description": "description", "descrizione": "description", "causale": "description",
    "currency": "currency", "valuta": "currency", "method": "method", "metodo": "method",
}


def _header(value):
    normalized = unicodedata.normalize("NFKD", value.strip().lower().lstrip("\ufeff"))
    normalized = "".join(c for c in normalized if not unicodedata.combining(c))
    return _HEADERS.get(re.sub(r"[^a-z0-9]+", "_", normalized).strip("_"))


def _csv_money(value):
    raw = str(value or "").strip().replace("€", "").replace("EUR", "").replace(" ", "").replace("\xa0", "")
    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".") if raw.rfind(",") > raw.rfind(".") else raw.replace(",", "")
    elif "," in raw:
        raw = raw.replace(",", ".")
    if not re.fullmatch(r"\+?\d+(?:\.\d{1,2})?", raw):
        raise ValueError("Importo non valido: usare un'entrata positiva con massimo due decimali.")
    cents = _amount(raw)
    if cents <= 0:
        raise ValueError("L'importo deve essere positivo.")
    return cents


def _csv_date(value):
    raw = str(value or "").strip()
    try:
        result = date.fromisoformat(raw) if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw) else datetime.strptime(raw, "%d/%m/%Y").date()
    except ValueError:
        raise ValueError("Data non valida: usare YYYY-MM-DD o GG/MM/AAAA.")
    if result > as_rome_datetime().date():
        raise ValueError("Un incasso ricevuto non può avere una data futura.")
    return result.isoformat()


def preview_import(db, *, org_id, csv_text):
    if len(csv_text.encode("utf-8")) > 1_000_000:
        raise HTTPException(422, "CSV troppo grande: massimo 1 MB.")
    digest = hashlib.sha256(csv_text.encode("utf-8")).hexdigest()
    try:
        dialect = csv.Sniffer().sniff(csv_text[:8192], delimiters=",;\t")
        reader = csv.DictReader(io.StringIO(csv_text), dialect=dialect)
        headers = reader.fieldnames or []
    except csv.Error:
        raise HTTPException(422, "CSV non leggibile: usare un'intestazione e un separatore coerente.")
    mapped = {name: _header(name) for name in headers}
    if "paid_on" not in mapped.values() or "amount" not in mapped.values():
        raise HTTPException(422, "Il CSV deve contenere le colonne date/data e amount/importo.")
    meaningful = [v for v in mapped.values() if v]
    if len(meaningful) != len(set(meaningful)):
        raise HTTPException(422, "Il CSV contiene più colonne per lo stesso campo.")
    rows = []
    try:
        for index, row in enumerate(reader, start=2):
            if index > 1001:
                raise HTTPException(422, "Massimo 1000 righe per importazione.")
            values = {mapped[k]: v for k, v in row.items() if k in mapped and mapped[k]}
            errors, receipt = [], None
            try:
                if None in row:
                    raise ValueError("Numero di colonne non coerente con l'intestazione.")
                currency = (values.get("currency") or "EUR").strip().upper()
                if currency != "EUR":
                    raise ValueError("L'importazione supporta soltanto EUR.")
                method = _method(values.get("method") or "bank_transfer")
                if method == "sumup":
                    raise ValueError("I pagamenti provider si acquisiscono con Aggiorna pagamenti, non dal CSV.")
                reference = _clean(values.get("reference"), 255)
                identity = "reference:" + hashlib.sha256(reference.casefold().encode()).hexdigest() if reference else f"csv:{digest}:{index}"
                receipt = dict(amount_cents=_csv_money(values.get("amount")), currency="EUR", method=method,
                               paid_on=_csv_date(values.get("paid_on")), payer=_clean(values.get("payer"), 255),
                               reference=reference, description=_clean(values.get("description")), source_key=identity)
            except (ValueError, HTTPException) as exc:
                errors.append(str(exc.detail) if isinstance(exc, HTTPException) else str(exc))
            rows.append(dict(row_number=index, valid=not errors, duplicate=False, errors=errors, receipt=receipt))
    except csv.Error:
        raise HTTPException(422, "CSV non leggibile: verificare virgolette e separatori.")
    if not rows:
        raise HTTPException(422, "Il CSV non contiene righe da importare.")
    keys = [r["receipt"]["source_key"] for r in rows if r["receipt"]]
    existing = {}
    for start in range(0, len(keys), 500):
        existing.update({r.source_key: receipt_payload(r, []) for r in db.query(AccountingReceipt).filter(AccountingReceipt.org_id == org_id, AccountingReceipt.source_key.in_(keys[start:start + 500])).all()})
    seen = {}
    compare = ("amount_cents", "currency", "method", "paid_on", "payer", "description")
    for row in rows:
        item = row["receipt"]
        if not row["valid"] or item is None:
            continue
        other = existing.get(item["source_key"]) or seen.get(item["source_key"])
        if other:
            if any(item[k] != other[k] for k in compare):
                row["valid"] = False
                row["errors"].append("Riferimento già presente con dati diversi: verificare il movimento originale.")
            else:
                row["duplicate"] = True
        seen[item["source_key"]] = item
    return dict(rows=rows, valid_count=sum(r["valid"] for r in rows), invalid_count=sum(not r["valid"] for r in rows), duplicate_count=sum(r["duplicate"] for r in rows))


def commit_import(db, *, org_id, admin_id, csv_text):
    preview = preview_import(db, org_id=org_id, csv_text=csv_text)
    if preview["invalid_count"]:
        raise HTTPException(422, "CSV non importato: correggere tutte le righe non valide nella preview.")
    items = []
    for row in preview["rows"]:
        if row["duplicate"]:
            continue
        values = row["receipt"]
        result = create_receipt(db, org_id=org_id, admin_id=admin_id, values=values, source="csv", source_key=values["source_key"])
        items.append(result["receipt"])
    return {"created": len(items), "duplicates": preview["duplicate_count"], "items": items}


def member_accounting(db, *, org_id, member_id, year):
    member = db.query(Member).filter(Member.id == member_id, Member.org_id == org_id, Member.deleted_at.is_(None)).first()
    if member is None:
        raise HTTPException(404, "Socio non trovato.")
    receipt_ids = select(AccountingAllocation.receipt_id).where(AccountingAllocation.member_id == member_id, AccountingAllocation.org_id == org_id)
    receipts = db.query(AccountingReceipt).options(joinedload(AccountingReceipt.allocations)).filter(AccountingReceipt.org_id == org_id, AccountingReceipt.id.in_(receipt_ids)).order_by(AccountingReceipt.paid_on.desc(), AccountingReceipt.id.desc()).limit(100).all()
    events = db.query(AccountingEvent).filter(AccountingEvent.org_id == org_id, AccountingEvent.receipt_id.in_(receipt_ids)).order_by(AccountingEvent.id.desc()).limit(100).all()
    return dict(balance=member_year_balance(db, member=member, year=year), receipts=[receipt_payload(r) for r in receipts],
                events=[dict(id=e.id, action=e.action, reason=e.reason, actor_admin_id=e.actor_admin_id, created_at=_iso(e.created_at), before=e.before_json, after=e.after_json) for e in events])
