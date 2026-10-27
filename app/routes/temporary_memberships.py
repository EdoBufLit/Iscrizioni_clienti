from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app import audit
from app.db import get_db
from app.models import TemporaryMembershipPurchase
from app.services.org_admin_sessions import get_current_org_admin_from_request
from app.services.renewals import get_account_member_from_session
from app.services.sqlite_card_allocation_guard import sqlite_card_allocation_request_guard
from app.services.temporary_memberships import (
    OPEN_STATUSES, cancel_purchase, confirm_manual, create_or_resume, offer, serialize_purchase,
)

router = APIRouter()


class CreateTemporaryPurchaseBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    method: Literal["sumup", "bonifico", "contanti"]


class ConfirmTemporaryPaymentBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    paid_at: date
    notes: str | None = Field(default=None, max_length=1000)


def _member(request: Request, db: Session):
    member = get_account_member_from_session(request, db)
    if member is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return member


def _admin(request: Request, db: Session):
    admin = get_current_org_admin_from_request(request, db)
    if admin is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return admin


@router.get("/api/member/temporary-memberships/offer")
def get_temporary_offer(request: Request, db: Session = Depends(get_db)):
    return offer(db, _member(request, db))


@router.post("/api/member/temporary-memberships", dependencies=[Depends(sqlite_card_allocation_request_guard)])
def create_temporary_purchase(body: CreateTemporaryPurchaseBody, request: Request, db: Session = Depends(get_db)):
    member = _member(request, db)
    purchase = create_or_resume(db, member=member, method=body.method, request=request)
    audit.log_operation(
        db, action="temporary_membership.requested", entity_type="temporary_membership_purchase",
        entity_id=purchase.id, actor_member_id=member.id, actor_role="member",
        metadata={"org_id": member.org_id, "method": purchase.method},
    )
    db.commit()
    payload = serialize_purchase(db, purchase)
    return {"purchase": payload, "hosted_checkout_url": payload["hosted_checkout_url"]}


@router.get("/api/member/temporary-memberships/{purchase_id}")
def get_temporary_purchase(purchase_id: int, request: Request, db: Session = Depends(get_db)):
    member = _member(request, db)
    purchase = db.query(TemporaryMembershipPurchase).filter(
        TemporaryMembershipPurchase.id == purchase_id,
        TemporaryMembershipPurchase.member_id == member.id,
        TemporaryMembershipPurchase.org_id == member.org_id,
    ).first()
    if purchase is None:
        raise HTTPException(status_code=404, detail="Acquisto non trovato.")
    return {"purchase": serialize_purchase(db, purchase)}


@router.get("/api/org-admin/temporary-memberships")
def list_temporary_purchases(request: Request, status: str | None = None,
                             member_id: int | None = None,
                             limit: int = Query(default=50, ge=1, le=100),
                             offset: int = Query(default=0, ge=0), db: Session = Depends(get_db)):
    admin = _admin(request, db)
    query = db.query(TemporaryMembershipPurchase).filter(TemporaryMembershipPurchase.org_id == admin.org_id)
    if member_id is not None:
        query = query.filter(TemporaryMembershipPurchase.member_id == member_id)
    if status == "pending":
        query = query.filter(TemporaryMembershipPurchase.status.in_(OPEN_STATUSES))
    elif status:
        query = query.filter(TemporaryMembershipPurchase.status == status)
    total = query.count()
    purchases = query.order_by(TemporaryMembershipPurchase.id.desc()).offset(offset).limit(limit).all()
    return {"items": [serialize_purchase(db, item) for item in purchases], "total": total}


@router.post("/api/member/temporary-memberships/{purchase_id}/cancel",
             dependencies=[Depends(sqlite_card_allocation_request_guard)])
def cancel_temporary_purchase(purchase_id: int, request: Request, db: Session = Depends(get_db)):
    member = _member(request, db)
    purchase = db.query(TemporaryMembershipPurchase).filter(
        TemporaryMembershipPurchase.id == purchase_id,
        TemporaryMembershipPurchase.member_id == member.id,
        TemporaryMembershipPurchase.org_id == member.org_id,
    ).first()
    if purchase is None:
        raise HTTPException(status_code=404, detail="Acquisto non trovato.")
    purchase = cancel_purchase(db, purchase=purchase)
    audit.log_operation(
        db, action="temporary_membership.cancelled", entity_type="temporary_membership_purchase",
        entity_id=purchase.id, actor_member_id=member.id, actor_role="member", metadata={"org_id": member.org_id},
    )
    db.commit()
    return {"purchase": serialize_purchase(db, purchase)}


@router.post("/api/org-admin/temporary-memberships/{purchase_id}/confirm-manual",
             dependencies=[Depends(sqlite_card_allocation_request_guard)])
def confirm_temporary_payment(purchase_id: int, body: ConfirmTemporaryPaymentBody,
                              request: Request, db: Session = Depends(get_db)):
    admin = _admin(request, db)
    purchase = db.query(TemporaryMembershipPurchase).filter(
        TemporaryMembershipPurchase.id == purchase_id,
        TemporaryMembershipPurchase.org_id == admin.org_id,
    ).first()
    if purchase is None:
        raise HTTPException(status_code=404, detail="Acquisto non trovato.")
    purchase = confirm_manual(db, purchase=purchase, admin_id=admin.id,
                              paid_at=datetime.combine(body.paid_at, datetime.min.time()), notes=body.notes)
    audit.log_operation(
        db, action="temporary_membership.manual_payment", entity_type="temporary_membership_purchase",
        entity_id=purchase.id, actor_admin_id=admin.id, actor_role="org_admin",
        metadata={"org_id": admin.org_id, "method": purchase.method},
    )
    db.commit()
    return {"purchase": serialize_purchase(db, purchase)}
