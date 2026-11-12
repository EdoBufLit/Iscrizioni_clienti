"""Audited operator-only adoption of an already-issued paper membership card.

This module has no public route and never allocates stock, charges a fee,
copies another club's documents/consents, or sends an email.
"""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import audit
from app.models import Member, MemberAccount, MemberStatus, Organization
from app.services.annual_memberships import annual_membership_valid_through, as_rome_datetime, sync_annual_membership_term
from app.services.card_allocation import lock_card_allocation
from app.services.card_identity import PAPER_CARD_NAMESPACE
from app.services.member_accounts import link_member_to_account, lock_account


def import_paper_card_exception(db: Session, *, account: MemberAccount, org: Organization,
        card_number: int, card_year: int, first_name: str, last_name: str,
        email: str | None, audit_reason: str) -> Member:
    """Create exactly one manually verified paper reference; caller commits.

    The immutable import key also makes retries safe after a later digital
    renewal: an old paper import must never replace the current issued card.
    """
    today = as_rome_datetime().date()
    if type(card_number) is not int or card_number <= 0 or type(card_year) is not int or not 1900 <= card_year <= today.year:
        raise HTTPException(status_code=400, detail="Riferimento o annualità della tessera cartacea non validi.")
    if not first_name.strip() or not last_name.strip() or not audit_reason.strip():
        raise HTTPException(status_code=400, detail="Nome, cognome e motivazione dell'eccezione sono obbligatori.")
    account_id, org_id = account.id, org.id
    locked_account = lock_account(db, account_id)
    if locked_account is None:
        raise HTTPException(status_code=404, detail="Account personale non disponibile.")
    org = lock_card_allocation(db, org_id, card_year)
    if org.deleted_at is not None or not org.is_active:
        raise HTTPException(status_code=409, detail="Associazione non disponibile.")
    key = f"paper:{card_year}:{card_number}"
    existing = db.query(Member).filter(Member.org_id == org_id, Member.signup_source == PAPER_CARD_NAMESPACE,
        Member.external_customer_id == key, Member.deleted_at.is_(None)).with_for_update().first()
    if existing is not None:
        if existing.account_id != account_id:
            raise HTTPException(status_code=409, detail="Il riferimento cartaceo è già collegato a un altro account.")
        return existing
    collision = db.query(Member.id).filter(Member.org_id == org_id, Member.card_namespace == PAPER_CARD_NAMESPACE,
                                           Member.card_no == card_number).first()
    if collision:
        raise HTTPException(status_code=409, detail="Il riferimento cartaceo è già presente per questa associazione.")
    now = datetime.now(timezone.utc)
    member = Member(org_id=org_id, first_name=first_name.strip(), last_name=last_name.strip(),
        email=(email or "").strip().lower() or None, card_no=card_number, card_year=card_year,
        card_namespace=PAPER_CARD_NAMESPACE, numbering_scope_id=None, batch_id=None,
        status=MemberStatus.ACTIVE if today <= annual_membership_valid_through(card_year) else MemberStatus.EXPIRED,
        membership_type="annual", joined_at=now.replace(tzinfo=None), is_manual=True,
        signup_source=PAPER_CARD_NAMESPACE, external_customer_id=key,
        membership_fee_snapshot=Decimal("0.00"), payment_required=False, payment_status="not_required",
        card_is_paid=False, internal_notes=f"Digitalizzazione eccezionale di tessera cartacea già rilasciata. {audit_reason.strip()}")
    db.add(member)
    db.flush()
    term = sync_annual_membership_term(db, member, source=PAPER_CARD_NAMESPACE)
    term.fee_amount = Decimal("0.00")
    member = link_member_to_account(db, account=locked_account, member=member, trusted=True)
    audit.log_operation(db, action="member.paper_card_imported", entity_type="member", entity_id=member.id,
        actor_role="operator", org_id=org_id, metadata={"account_id": account_id, "card_namespace": PAPER_CARD_NAMESPACE,
        "card_number": card_number, "card_year": card_year, "reason": audit_reason.strip(),
        "new_charge_created": False, "historical_payment_verified": False})
    db.flush()
    return member
