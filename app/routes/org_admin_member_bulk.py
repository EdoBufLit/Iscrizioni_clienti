"""Org Admin endpoints for explicit, resumable member selections."""

from __future__ import annotations

import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import member_bulk
from app.services.member_exports import build_members_workbook
from app.services.org_admin_sessions import get_current_org_admin_from_request


router = APIRouter(prefix="/api/org-admin/member-bulk", tags=["org-admin-member-bulk"])


class MemberListFilters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    q: str | None = Field(default=None, max_length=254)
    status: Literal["all", "active", "pending", "expired", "deleted", "rejected", "suspended", "pending_verification", "pending_docs", "pending_cards"] | None = None
    access: Literal["with", "without"] | None = None
    source: Literal["manual", "online"] | None = None
    docs: Literal["pending", "rejected", "approved"] | None = None
    order: Literal["joined_at_desc", "joined_at_asc", "last_name_asc", "last_name_desc", "status_asc", "status_desc"] | None = None


class MemberSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["ids", "filtered"]
    member_ids: list[StrictInt] = Field(default_factory=list, max_length=member_bulk.MAX_SELECTION)
    excluded_ids: list[StrictInt] = Field(default_factory=list, max_length=member_bulk.MAX_SELECTION)
    filters: MemberListFilters | None = None

    @model_validator(mode="after")
    def selection_is_explicit(self):
        if any(type(value) is not int or value <= 0 for value in self.member_ids + self.excluded_ids):
            raise ValueError("Gli identificativi dei soci devono essere interi positivi.")
        if self.mode == "ids" and (not self.member_ids or self.filters is not None or self.excluded_ids):
            raise ValueError("La selezione esplicita richiede gli ID dei soci e nessun filtro.")
        if self.mode == "filtered" and (self.member_ids or self.filters is None):
            raise ValueError("La selezione filtrata richiede i filtri e nessun elenco di ID.")
        return self


class PreviewBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_key: str = Field(min_length=8, max_length=100)
    action: Literal["export", "send_access", "quote_reminder"]
    selection: MemberSelection
    membership_year: int | None = Field(default=None, strict=True, ge=2000, le=2200)

    @model_validator(mode="after")
    def year_matches_action(self):
        if (self.action == "quote_reminder") != (self.membership_year is not None):
            raise ValueError("L'annualità è richiesta soltanto per il sollecito quota.")
        return self


class OperationBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_key: str = Field(min_length=8, max_length=100)


def _admin(request: Request, db: Session):
    admin = get_current_org_admin_from_request(request, db)
    if admin is None:
        raise HTTPException(status_code=401, detail="Sessione non valida. Accedi nuovamente.")
    return admin


@router.get("")
def recent_runs(request: Request, limit: int = Query(default=10, ge=1, le=50), offset: int = Query(default=0, ge=0), db: Session = Depends(get_db)):
    return member_bulk.list_runs(db, admin=_admin(request, db), limit=limit, offset=offset)


@router.post("/preview")
def preview(request: Request, body: PreviewBody, db: Session = Depends(get_db)):
    run = member_bulk.preview_run(db, admin=_admin(request, db), payload=body.model_dump(mode="json"))
    return member_bulk.serialize_run(db, run)


@router.get("/{run_id}")
def read_run(request: Request, run_id: str, offset: int = Query(default=0, ge=0), limit: int = Query(default=50, ge=1, le=100), db: Session = Depends(get_db)):
    run = member_bulk.get_run(db, admin=_admin(request, db), run_id=run_id)
    return member_bulk.serialize_run(db, run, offset=offset, limit=limit)


@router.post("/{run_id}/execute")
def execute(request: Request, run_id: str, body: OperationBody, db: Session = Depends(get_db)):
    run = member_bulk.execute_run(db, admin=_admin(request, db), run_id=run_id, request_key=body.request_key, request=request)
    return member_bulk.serialize_run(db, run)


@router.post("/{run_id}/retry-failed")
def retry_failed(request: Request, run_id: str, body: OperationBody, db: Session = Depends(get_db)):
    run = member_bulk.retry_failed_run(db, admin=_admin(request, db), run_id=run_id, request_key=body.request_key)
    return member_bulk.serialize_run(db, run)


@router.get("/{run_id}/export.xlsx")
def download_export(request: Request, run_id: str, db: Session = Depends(get_db)):
    admin = _admin(request, db)
    run, members = member_bulk.export_run_members(db, admin=admin, run_id=run_id)
    payload = build_members_workbook(organization=admin.organization, members=members)
    slug = re.sub(r"[^a-z0-9-]+", "-", (admin.organization.slug or "associazione").lower()).strip("-") or "associazione"
    return StreamingResponse(payload, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="soci-selezionati-{slug}.xlsx"', "X-Exported-Count": str(len(members)), "Cache-Control": "no-store"})
