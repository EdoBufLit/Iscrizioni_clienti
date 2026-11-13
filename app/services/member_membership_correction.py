"""Administrative correction of an issued temporary card, without fulfillment."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import audit
from app.middleware import get_client_ip
from app.models import AdminRole, AdminUser, AnnualMembershipTerm, Member, MemberStatus, MembershipPayment, TemporaryMembershipPurchase
from app.services.annual_memberships import ROME_TIMEZONE, annual_membership_expiry_datetime, as_rome_datetime, reactivate_current_annual_membership_term, sync_annual_membership_term
from app.services.card_allocation import lock_card_allocation
from app.services.card_identity import card_namespace
from app.services.member_membership import resolve_member_membership_type


class MembershipTypeCorrectionBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    membership_type: Literal["annual"]


def can_correct_membership_type(member: Member) -> bool:
    status = member.status.value if hasattr(member.status, "value") else str(member.status or "").lower()
    return bool(member.deleted_at is None and resolve_member_membership_type(member) == "temporary"
                and status in {item.value for item in MemberStatus if item != MemberStatus.REJECTED})


def _correct_current_wallet_passes(db: Session, member: Member, now: datetime) -> None:
    """Keep saved object IDs while changing only this issuance's rendering kind."""
    from app.models_wallet import GoogleWalletPass
    from app.services.card_verification import parse_card_verification_token
    from app.services.google_wallet_sync import register_wallet_pass

    records = db.query(GoogleWalletPass).filter_by(member_id=member.id).order_by(GoogleWalletPass.id).with_for_update().all()
    if member.google_wallet_object_id and member.google_wallet_class_id and not any(record.object_id == member.google_wallet_object_id for record in records):
        # Register the legacy current pointer BEFORE changing its type, so the
        # before_flush wallet hook cannot materialize a stale temporary record.
        record = register_wallet_pass(db, member, class_id=member.google_wallet_class_id, object_id=member.google_wallet_object_id)
        # A pointer can still reference an older purchase. Its encoded purchase
        # ID is authoritative over whichever card is currently on the member.
        suffix = record.object_id.rsplit('.tmp.', 1)[-1] if '.tmp.' in record.object_id else ''
        if suffix.isdigit():
            historic_purchase = db.get(TemporaryMembershipPurchase, int(suffix))
            if historic_purchase is not None and historic_purchase.member_id == member.id:
                record.temporary_purchase_id = historic_purchase.id
        records.append(record)
    for record in records:
        if record.kind != "temporary" or record.revoked:
            continue
        purchase = db.get(TemporaryMembershipPurchase, record.temporary_purchase_id) if record.temporary_purchase_id else None
        if purchase is not None:
            matches_current = card_namespace(member) == 'digital' and (purchase.member_id, purchase.org_id, purchase.card_no, purchase.card_year) == (member.id, member.org_id, member.card_no, member.card_year)
        else:
            barcode = (record.payload_json or {}).get("barcode", {}).get("value", "")
            proof = parse_card_verification_token(barcode.rstrip("/").rsplit("/", 1)[-1]) if barcode else None
            if proof is not None:
                matches_current = (proof['member_id'],proof['org_id'],proof['card_number'],proof['card_year'],proof.get('card_namespace','digital')) == (member.id,member.org_id,member.card_no,member.card_year,card_namespace(member))
            elif '.tmp.legacy.' in record.object_id:
                matches_current = record.object_id.endswith(f'.tmp.legacy.{member.card_year}.{member.card_no}') and card_namespace(member) == 'digital'
            else:
                matches_current = record.object_id == member.google_wallet_object_id
        if matches_current:
            record.kind = "annual"
            record.temporary_purchase_id = None
            record.next_check_at = now


def correct_temporary_membership_to_annual(
    db: Session, *, member_id: int, actor: AdminUser, request: Request,
    now: datetime | None = None,
) -> Member:
    """Caller owns commit. Never allocate, create payments or touch an account.

    Match acquisition/fulfillment ordering: allocation domain, then Member.
    No Account lock/write is required because ownership and credentials stay intact.
    """
    query = db.query(Member).filter(Member.id == member_id, Member.deleted_at.is_(None))
    role = actor.role.value if hasattr(actor.role, "value") else str(actor.role)
    if role == AdminRole.ORG_ADMIN.value:
        query = query.filter(Member.org_id == actor.org_id)
    elif role != AdminRole.SUPER_ADMIN.value:
        raise HTTPException(403, "Operazione riservata agli amministratori.")
    candidate = query.first()
    if candidate is None:
        raise HTTPException(404, "Socio non trovato.")
    current_time = now or datetime.utcnow()
    expected_org_id = candidate.org_id
    org = lock_card_allocation(db, expected_org_id, int(candidate.card_year or as_rome_datetime(current_time).year))
    member = query.populate_existing().with_for_update().first()
    if member is None or member.org_id != expected_org_id:
        raise HTTPException(409, "Il socio è cambiato. Ricarica il dettaglio e riprova.")
    if org.deleted_at is not None or not org.is_active:
        raise HTTPException(409, "L'associazione non è attiva.")
    status = member.status.value if hasattr(member.status, "value") else str(member.status or "").lower()
    if status not in {item.value for item in MemberStatus if item != MemberStatus.REJECTED}:
        raise HTTPException(409, "La correzione non è disponibile per iscrizioni rigettate.")
    # A repeated confirmation is harmless and never adds another audit/history row.
    if resolve_member_membership_type(member) == "annual":
        return member
    issued = member.card_no is not None and member.card_year is not None
    annual_is_current = False
    if issued:
        try:
            annual_is_current = datetime(member.card_year, 1, 1, tzinfo=ROME_TIMEZONE) <= as_rome_datetime(current_time) <= annual_membership_expiry_datetime(member.card_year)
        except (TypeError, ValueError):
            raise HTTPException(409, "L'annualità della tessera deve essere verificata prima della correzione.")
        if status == MemberStatus.ACTIVE.value and member.card_year > as_rome_datetime(current_time).year:
            raise HTTPException(409, "La tessera appartiene a un'annualità futura. Verifica l'anno prima di correggere il tipo, senza anticiparne l'attivazione.")
    if status == MemberStatus.EXPIRED.value and annual_is_current and member.decision_at is None:
        raise HTTPException(409, "Verifica prima l'approvazione del socio: la correzione non può riattivare un'iscrizione senza una decisione precedente.")
    if db.query(TemporaryMembershipPurchase.id).filter(
        TemporaryMembershipPurchase.member_id == member.id,
        TemporaryMembershipPurchase.status.in_(("payment_pending", "manual_pending", "paid_waiting_card")),
    ).first():
        raise HTTPException(409, "Completa o annulla prima l'acquisto della tessera temporanea in corso.")
    if db.query(MembershipPayment.id).filter(
        MembershipPayment.socio_id == member.id,
        or_(MembershipPayment.reservation_state == "held", MembershipPayment.status == "pending"),
    ).first():
        raise HTTPException(409, "Un pagamento o checkout tessera è ancora in verifica. Risolvilo prima della correzione.")
    terms = db.query(AnnualMembershipTerm).filter(
        AnnualMembershipTerm.member_id == member.id,
    ).order_by(AnnualMembershipTerm.id).with_for_update().all()
    for term in terms:
        if term.status in ("due", "payment_pending", "approved_waiting_card", "paid_waiting_card", "scheduled"):
            raise HTTPException(409, "Completa o annulla prima il rinnovo annuale in corso.")
        if issued and term.membership_year == member.card_year and (
            term.card_no != member.card_no or term.card_namespace != card_namespace(member)
            or term.card_year != member.card_year
        ):
            raise HTTPException(409, "Esiste già una tessera diversa per questa annualità. Verifica lo storico prima di correggere il tipo.")
    before = {"membership_type":"temporary", "valid_until":member.valid_until.isoformat() if member.valid_until else None, "workflow_status":status}
    if issued:
        _correct_current_wallet_passes(db, member, current_time)
    member.membership_type = "annual"
    member.valid_until = None
    if status == MemberStatus.EXPIRED.value and annual_is_current:
        member.status = MemberStatus.ACTIVE
        member.expired_at = None
    # Annual history uses the already issued identity; no new number or payment.
    if issued and status in (MemberStatus.ACTIVE.value, MemberStatus.EXPIRED.value):
        current_term = next((term for term in terms if term.membership_year == member.card_year), None)
        if current_term is None:
            sync_annual_membership_term(db, member, source="membership_type_correction", now=current_time)
        else:
            # Preserve the existing issuance's fee, currency, source and stock identity.
            reactivate_current_annual_membership_term(db, member, now=current_time)
    audit.log_operation(db, action="member.membership_type.correct", entity_type="member", entity_id=member.id,
        actor_admin_id=actor.id, actor_role=role, org_id=member.org_id,
        metadata={"org_id":member.org_id, "before":before, "membership_type":"annual", "card_no":member.card_no,
                  "card_year":member.card_year, "card_namespace":card_namespace(member), "payment_unchanged":True},
        ip=get_client_ip(request), user_agent=request.headers.get("user-agent"))
    db.flush()
    return member
