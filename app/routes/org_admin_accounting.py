from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Organization
from app.services import member_accounting as ledger
from app.services.annual_memberships import as_rome_datetime
from app.services.org_admin_sessions import get_current_org_admin_from_request
from app.services.sqlite_card_allocation_guard import sqlite_card_allocation_request_guard

router = APIRouter(prefix="/api/org-admin/accounting", tags=["org-admin-accounting"])
Money = Annotated[int, Field(strict=True, gt=0, le=ledger.MAX_CENTS)]


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MutationBody(StrictBody):
    request_key: str = Field(min_length=8, max_length=120, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")


class ReceiptBody(MutationBody):
    amount_cents: Money
    currency: Literal["EUR"] = "EUR"
    method: Literal["cash", "bank_transfer", "other"]
    paid_on: date
    payer: str | None = Field(default=None, max_length=255)
    reference: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=1000)

    @field_validator("paid_on")
    @classmethod
    def received_date(cls, value):
        if value > as_rome_datetime().date():
            raise ValueError("Un incasso ricevuto non può avere una data futura.")
        return value


class CsvPreviewBody(StrictBody):
    csv_text: str = Field(min_length=1, max_length=1_000_000)


class CsvImportBody(MutationBody):
    csv_text: str = Field(min_length=1, max_length=1_000_000)


class VersionBody(MutationBody):
    expected_version: int = Field(ge=1, strict=True)


class AllocationItem(StrictBody):
    target_key: str = Field(min_length=3, max_length=100)
    amount_cents: Money


class AllocationBody(VersionBody):
    items: list[AllocationItem] = Field(min_length=1, max_length=100)


class ReasonBody(VersionBody):
    reason: str = Field(min_length=3, max_length=1000)

    @field_validator("reason")
    @classmethod
    def meaningful_reason(cls, value):
        result = value.strip()
        if len(result) < 3:
            raise ValueError("Indica un motivo comprensibile per la correzione.")
        return result


class AdjustmentBody(ReasonBody):
    amount_cents: Money | None = None
    method: Literal["cash", "bank_transfer", "other"] | None = None
    paid_on: date | None = None
    payer: str | None = Field(default=None, max_length=255)
    reference: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_changes(self):
        fields = self.model_fields_set - {"request_key", "expected_version", "reason"}
        if not fields:
            raise ValueError("Indica almeno un campo da rettificare.")
        for name in ("amount_cents", "method", "paid_on"):
            if name in fields and getattr(self, name) is None:
                raise ValueError(f"Il campo {name} non può essere vuoto.")
        if self.paid_on and self.paid_on > as_rome_datetime().date():
            raise ValueError("Un incasso ricevuto non può avere una data futura.")
        return self


def _admin(request, db):
    admin = get_current_org_admin_from_request(request, db)
    if admin is None:
        raise HTTPException(401, "Not authenticated")
    org = db.query(Organization).filter(Organization.id == admin.org_id, Organization.is_active.is_(True), Organization.deleted_at.is_(None)).first()
    if org is None:
        raise HTTPException(403, "Associazione non attiva.")
    return admin


def _run(db, admin, body, operation, callback):
    result = ledger.mutate(db, org_id=admin.org_id, request_key=body.request_key, operation=operation,
                           payload=body.model_dump(mode="json", exclude={"request_key"}), callback=callback)
    db.commit()
    return result


@router.get("/receipts")
def receipts(request: Request, state: Literal["unmatched", "partial", "matched", "voided"] | None = None,
             q: str | None = Query(default=None, max_length=160), limit: int = Query(default=50, ge=1, le=100),
             offset: int = Query(default=0, ge=0), member_id: int | None = Query(default=None, gt=0), db: Session = Depends(get_db)):
    admin = _admin(request, db)
    return ledger.list_receipts(db, org_id=admin.org_id, state=state, search=q, limit=limit, offset=offset, member_id=member_id)


@router.post("/receipts/import/preview")
def import_preview(body: CsvPreviewBody, request: Request, db: Session = Depends(get_db)):
    admin = _admin(request, db)
    return ledger.preview_import(db, org_id=admin.org_id, csv_text=body.csv_text)


@router.post("/receipts/import", dependencies=[Depends(sqlite_card_allocation_request_guard)])
def import_receipts(body: CsvImportBody, request: Request, db: Session = Depends(get_db)):
    admin = _admin(request, db)
    return _run(db, admin, body, "import", lambda: ledger.commit_import(db, org_id=admin.org_id, admin_id=admin.id, csv_text=body.csv_text))


@router.post("/receipts/sync", dependencies=[Depends(sqlite_card_allocation_request_guard)])
def synchronize_receipts(body: MutationBody, request: Request, db: Session = Depends(get_db)):
    admin = _admin(request, db)
    def synchronize_batch():
        created = ledger.sync_legacy_receipts(db, org_id=admin.org_id, admin_id=admin.id)
        return {"created": created, "has_more": created == 100}
    return _run(db, admin, body, "sync", synchronize_batch)


@router.post("/receipts", dependencies=[Depends(sqlite_card_allocation_request_guard)])
def new_receipt(body: ReceiptBody, request: Request, db: Session = Depends(get_db)):
    admin = _admin(request, db)
    return _run(db, admin, body, "create", lambda: ledger.create_receipt(db, org_id=admin.org_id, admin_id=admin.id, values=body.model_dump(mode="json")))


@router.get("/receipts/{receipt_id}")
def receipt_detail(receipt_id: int, request: Request, db: Session = Depends(get_db)):
    admin = _admin(request, db)
    return ledger.detail(db, receipt=ledger.get_receipt(db, org_id=admin.org_id, receipt_id=receipt_id))


@router.get("/receipts/{receipt_id}/suggestions")
def receipt_suggestions(receipt_id: int, request: Request, query: str | None = Query(default=None, max_length=160),
                        year: int | None = Query(default=None, ge=2000, le=9998), limit: int = Query(default=25, ge=1, le=100),
                        offset: int = Query(default=0, ge=0), db: Session = Depends(get_db)):
    admin = _admin(request, db)
    receipt = ledger.get_receipt(db, org_id=admin.org_id, receipt_id=receipt_id)
    return ledger.suggestions(db, receipt=receipt, search=query, year=year, limit=limit, offset=offset)


@router.post("/receipts/{receipt_id}/allocations", dependencies=[Depends(sqlite_card_allocation_request_guard)])
def allocate_receipt(receipt_id: int, body: AllocationBody, request: Request, db: Session = Depends(get_db)):
    admin = _admin(request, db)
    return _run(db, admin, body, f"allocate:{receipt_id}", lambda: ledger.allocate(db, org_id=admin.org_id, receipt_id=receipt_id, admin_id=admin.id, version=body.expected_version, items=[i.model_dump() for i in body.items]))


@router.post("/receipts/{receipt_id}/adjustments", dependencies=[Depends(sqlite_card_allocation_request_guard)])
def adjust_receipt(receipt_id: int, body: AdjustmentBody, request: Request, db: Session = Depends(get_db)):
    admin = _admin(request, db)
    changes = body.model_dump(mode="json", exclude_unset=True, exclude={"request_key", "expected_version", "reason"})
    return _run(db, admin, body, f"adjust:{receipt_id}", lambda: ledger.adjust(db, org_id=admin.org_id, receipt_id=receipt_id, admin_id=admin.id, version=body.expected_version, reason=body.reason, changes=changes))


@router.post("/receipts/{receipt_id}/allocations/{allocation_id}/reverse", dependencies=[Depends(sqlite_card_allocation_request_guard)])
def reverse_allocation(receipt_id: int, allocation_id: int, body: ReasonBody, request: Request, db: Session = Depends(get_db)):
    admin = _admin(request, db)
    return _run(db, admin, body, f"reverse:{receipt_id}:{allocation_id}", lambda: ledger.reverse(db, org_id=admin.org_id, receipt_id=receipt_id, admin_id=admin.id, version=body.expected_version, reason=body.reason, allocation_id=allocation_id))


@router.post("/receipts/{receipt_id}/void", dependencies=[Depends(sqlite_card_allocation_request_guard)])
def void_receipt(receipt_id: int, body: ReasonBody, request: Request, db: Session = Depends(get_db)):
    admin = _admin(request, db)
    return _run(db, admin, body, f"void:{receipt_id}", lambda: ledger.reverse(db, org_id=admin.org_id, receipt_id=receipt_id, admin_id=admin.id, version=body.expected_version, reason=body.reason, void=True))


@router.get("/members/{member_id}")
def member_history(member_id: int, request: Request, year: int | None = Query(default=None, ge=2000, le=9998), db: Session = Depends(get_db)):
    admin = _admin(request, db)
    return ledger.member_accounting(db, org_id=admin.org_id, member_id=member_id, year=year or as_rome_datetime().year)
