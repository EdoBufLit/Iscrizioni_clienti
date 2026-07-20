from __future__ import annotations

import csv
import io
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app import audit
from app.db import get_db
from app.middleware import get_client_ip
from app.models import AdminRole, AnnualMembershipTerm, MemberNotification, Organization
from app.services.csv_safety import neutralize_csv_formula
from app.services.org_admin_sessions import get_current_org_admin_from_request
from app.services.renewals import (
    build_quote_center,
    confirm_unpaid_renewal,
    create_renewal_checkout,
    get_account_member_from_session,
    get_quote_member,
    record_manual_renewal_payment,
    request_renewal,
    send_manual_quote_reminders,
    serialize_annual_term,
    serialize_member_membership,
)
from app.services.sqlite_card_allocation_guard import sqlite_card_allocation_request_guard


router = APIRouter()


class ManualRenewalPaymentBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    membership_year: int = Field(..., ge=2000, le=9998)
    amount: Decimal = Field(..., gt=0, max_digits=10, decimal_places=2)
    method: str = Field(..., min_length=2, max_length=32)
    paid_at: date
    notes: str | None = Field(default=None, max_length=1000)


class ConfirmRenewalBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    membership_year: int = Field(..., ge=2000, le=9998)


class SendRenewalRemindersBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    membership_year: int = Field(..., ge=2000, le=9998)
    member_ids: list[int] = Field(default_factory=list, max_length=5000)


def _require_member(request: Request, db: Session):
    member = get_account_member_from_session(request, db)
    if member is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return member


def _require_org_admin(request: Request, db: Session):
    admin = get_current_org_admin_from_request(request, db)
    if admin is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return admin


def _get_org(db: Session, org_id: int) -> Organization:
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if org is None:
        raise HTTPException(status_code=404, detail="Associazione non trovata.")
    return org


@router.get("/api/member/membership")
def get_member_membership(
    request: Request,
    db: Session = Depends(get_db),
):
    member = _require_member(request, db)
    return serialize_member_membership(db, member=member)


@router.post(
    "/api/member/renewals",
    dependencies=[Depends(sqlite_card_allocation_request_guard)],
)
def create_member_renewal(
    request: Request,
    db: Session = Depends(get_db),
):
    member = _require_member(request, db)
    result = request_renewal(db, member=member)
    audit.log_operation(
        db,
        action="membership.renewal_requested",
        entity_type="annual_membership_term",
        entity_id=result.term.id,
        actor_member_id=member.id,
        actor_role="member",
        metadata={
            "org_id": member.org_id,
            "membership_year": result.term.membership_year,
            "action": result.action,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return {
        "ok": True,
        "action": result.action,
        "checkout_required": result.checkout_required,
        "term": serialize_annual_term(db, result.term),
    }


@router.post("/api/member/renewals/{term_id}/checkout")
def create_member_renewal_checkout(
    term_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    member = _require_member(request, db)
    term = (
        db.query(AnnualMembershipTerm)
        .filter(
            AnnualMembershipTerm.id == term_id,
            AnnualMembershipTerm.member_id == member.id,
            AnnualMembershipTerm.org_id == member.org_id,
        )
        .first()
    )
    if term is None:
        raise HTTPException(status_code=404, detail="Rinnovo non trovato.")
    payment = create_renewal_checkout(
        db,
        member=member,
        term=term,
        request=request,
    )
    audit.log_operation(
        db,
        action="membership.renewal_checkout_created",
        entity_type="membership_payment",
        entity_id=payment.id,
        actor_member_id=member.id,
        actor_role="member",
        metadata={
            "org_id": member.org_id,
            "annual_term_id": term.id,
            "membership_year": term.membership_year,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return {
        "payment_id": payment.id,
        "hosted_checkout_url": payment.hosted_checkout_url,
    }


@router.get("/api/member/notifications")
def list_member_notifications(
    request: Request,
    limit: int = Query(default=50, ge=1, le=100),
    unread_only: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    member = _require_member(request, db)
    query = db.query(MemberNotification).filter(
        MemberNotification.member_id == member.id,
        MemberNotification.org_id == member.org_id,
    )
    if unread_only:
        query = query.filter(MemberNotification.is_read.is_(False))
    items = query.order_by(MemberNotification.created_at.desc()).limit(limit).all()
    return {
        "items": [
            {
                "id": item.id,
                "type": item.type,
                "title": item.title,
                "body": item.body,
                "href": item.href,
                "is_read": bool(item.is_read),
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in items
        ],
        "unread_count": query.filter(MemberNotification.is_read.is_(False)).count(),
    }


@router.patch("/api/member/notifications/{notification_id}/read")
def mark_member_notification_read(
    notification_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    member = _require_member(request, db)
    notification = (
        db.query(MemberNotification)
        .filter(
            MemberNotification.id == notification_id,
            MemberNotification.member_id == member.id,
            MemberNotification.org_id == member.org_id,
        )
        .first()
    )
    if notification is None:
        raise HTTPException(status_code=404, detail="Notifica non trovata.")
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.utcnow()
        db.commit()
    return {"ok": True}


@router.get("/api/org-admin/quotes")
def get_org_admin_quotes(
    request: Request,
    year: int = Query(..., ge=2000, le=9998),
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, max_length=160),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    admin = _require_org_admin(request, db)
    org = _get_org(db, admin.org_id)
    return build_quote_center(
        db,
        org=org,
        year=year,
        status_filter=status_filter,
        search=q,
        limit=limit,
        offset=offset,
    )


@router.get("/api/org-admin/quotes.csv")
def export_org_admin_quotes(
    request: Request,
    year: int = Query(..., ge=2000, le=9998),
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, max_length=160),
    db: Session = Depends(get_db),
):
    admin = _require_org_admin(request, db)
    org = _get_org(db, admin.org_id)
    payload = build_quote_center(
        db,
        org=org,
        year=year,
        status_filter=status_filter,
        search=q,
        limit=100000,
        offset=0,
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "Nome",
            "Cognome",
            "Email",
            "Scadenza precedente",
            "Stato rinnovo",
            "Stato pagamento",
            "Quota",
            "Valuta",
            "Nuova tessera",
        ]
    )
    for item in payload["items"]:
        values = [
            item["first_name"] or "",
            item["last_name"] or "",
            item["email"] or "",
            item["previous_valid_through"] or "",
            item["renewal_status"],
            item["payment_state"],
            item["fee_amount"],
            item["currency"],
            item["new_card_no"] or "",
        ]
        writer.writerow([neutralize_csv_formula(value) for value in values])
    return Response(
        content="\ufeff" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="quote-rinnovi-{year}.csv"'
        },
    )


@router.post(
    "/api/org-admin/quotes/members/{member_id}/payments/manual",
    dependencies=[Depends(sqlite_card_allocation_request_guard)],
)
def create_org_admin_manual_renewal_payment(
    member_id: int,
    body: ManualRenewalPaymentBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _require_org_admin(request, db)
    member = get_quote_member(db, org_id=admin.org_id, member_id=member_id)
    method = body.method.strip().lower()
    if method not in {"contanti", "bonifico", "altro", "cash", "bank_transfer", "other"}:
        raise HTTPException(status_code=400, detail="Metodo di pagamento non valido.")
    paid_at = datetime.combine(body.paid_at, datetime.min.time())
    term, payment, issued = record_manual_renewal_payment(
        db,
        member=member,
        membership_year=body.membership_year,
        admin_id=admin.id,
        amount=body.amount,
        method=method,
        paid_at=paid_at,
        notes=body.notes.strip() if body.notes else None,
    )
    audit.log_operation(
        db,
        action="membership.renewal_manual_payment",
        entity_type="membership_payment",
        entity_id=payment.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        metadata={
            "org_id": admin.org_id,
            "member_id": member.id,
            "annual_term_id": term.id,
            "membership_year": term.membership_year,
            "method": method,
            "issued_card": issued,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return {
        "ok": True,
        "card_assigned": issued or term.card_no is not None,
        "term": serialize_annual_term(db, term),
    }


@router.post(
    "/api/org-admin/quotes/members/{member_id}/confirm",
    dependencies=[Depends(sqlite_card_allocation_request_guard)],
)
def confirm_org_admin_renewal(
    member_id: int,
    body: ConfirmRenewalBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _require_org_admin(request, db)
    member = get_quote_member(db, org_id=admin.org_id, member_id=member_id)
    term, issued = confirm_unpaid_renewal(
        db,
        member=member,
        membership_year=body.membership_year,
    )
    audit.log_operation(
        db,
        action="membership.renewal_confirmed",
        entity_type="annual_membership_term",
        entity_id=term.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        metadata={
            "org_id": admin.org_id,
            "member_id": member.id,
            "membership_year": term.membership_year,
            "issued_card": issued,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return {
        "ok": True,
        "card_assigned": issued or term.card_no is not None,
        "term": serialize_annual_term(db, term),
    }


@router.post("/api/org-admin/quotes/reminders")
def send_org_admin_renewal_reminders(
    body: SendRenewalRemindersBody,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _require_org_admin(request, db)
    queued = send_manual_quote_reminders(
        db,
        org_id=admin.org_id,
        membership_year=body.membership_year,
        member_ids=body.member_ids,
    )
    audit.log_operation(
        db,
        action="membership.renewal_reminders_sent",
        entity_type="annual_membership_term",
        actor_admin_id=admin.id,
        actor_role=AdminRole.ORG_ADMIN.value,
        metadata={
            "org_id": admin.org_id,
            "membership_year": body.membership_year,
            "requested_count": len(body.member_ids),
            "queued_count": queued,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return {"ok": True, "queued_count": queued}
