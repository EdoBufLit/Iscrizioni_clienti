from __future__ import annotations

from datetime import datetime
import uuid

import pytest
from sqlalchemy import func

from app.db import SessionLocal
from app.models import CardBatch, RechargeRequest, Organization
from app.services.card_lot_registry import (
    RECHARGE_REQUEST_STATUS_BLOCKED_NON_SHARED,
    RECHARGE_REQUEST_STATUS_LOT_CREATED,
    compute_next_lot,
    ensure_recharge_request_batch,
    format_card_number,
    parse_card_number,
)
from app.services.numbering_scopes import ensure_assonam_central_scope, ensure_dedicated_scope


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _create_org(
    db,
    *,
    name_prefix: str,
    numbering_scope_id: int | None = None,
) -> Organization:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"{name_prefix} {suffix}",
        slug=f"{name_prefix.lower().replace(' ', '-')}-{suffix}",
        privacy_version="v1",
        is_active=True,
        numbering_scope_id=numbering_scope_id,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _create_batch(
    db,
    *,
    org_id: int,
    numbering_scope_id: int | None,
    start_no: int,
    end_no: int,
) -> CardBatch:
    batch = CardBatch(
        org_id=org_id,
        numbering_scope_id=numbering_scope_id,
        year=datetime.utcnow().year,
        start_no=start_no,
        end_no=end_no,
        next_no=start_no,
        is_enabled=True,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def _create_recharge_request(db, *, org: Organization, requested_cards: int) -> RechargeRequest:
    request = RechargeRequest(
        association_id=org.id,
        association_name=org.name,
        requester_whatsapp=f"whatsapp:+39{uuid.uuid4().int % 1000000000:09d}",
        requester_profile_name="Mario Rossi",
        requested_cards=requested_cards,
        notes=None,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


def test_card_lot_registry_helpers_cover_requested_example():
    assert parse_card_number("26.301") == 26301
    assert parse_card_number("26301") == 26301
    assert parse_card_number(26301) == 26301
    assert format_card_number(26301) == "26.301"
    assert compute_next_lot(26300, 300) == (26301, 26600)


def test_ensure_recharge_request_batch_creates_shared_assonam_lot(db):
    central_scope = ensure_assonam_central_scope(db)
    db.commit()

    shared_org = _create_org(
        db,
        name_prefix="CHICCO CLUB",
        numbering_scope_id=central_scope.id,
    )
    _create_batch(
        db,
        org_id=shared_org.id,
        numbering_scope_id=central_scope.id,
        start_no=26001,
        end_no=26300,
    )
    expected_max_end = (
        db.query(func.max(CardBatch.end_no))
        .filter(CardBatch.numbering_scope_id == central_scope.id)
        .scalar()
    )
    assert expected_max_end is not None
    request = _create_recharge_request(db, org=shared_org, requested_cards=300)

    batch = ensure_recharge_request_batch(db, request.id)
    db.commit()
    db.refresh(request)

    assert batch is not None
    assert batch.numbering_scope_id == central_scope.id
    assert batch.org_id == shared_org.id
    assert batch.start_no == int(expected_max_end) + 1
    assert batch.end_no == batch.start_no + 299
    assert batch.next_no == batch.start_no
    assert request.card_batch_id == batch.id
    assert request.status == RECHARGE_REQUEST_STATUS_LOT_CREATED


def test_ensure_recharge_request_batch_is_idempotent_for_same_request(db):
    central_scope = ensure_assonam_central_scope(db)
    db.commit()

    shared_org = _create_org(
        db,
        name_prefix="Shared Retry Club",
        numbering_scope_id=central_scope.id,
    )
    request = _create_recharge_request(db, org=shared_org, requested_cards=50)

    first_batch = ensure_recharge_request_batch(db, request.id)
    second_batch = ensure_recharge_request_batch(db, request.id)
    db.commit()

    assert first_batch is not None
    assert second_batch is not None
    assert first_batch.id == second_batch.id
    assert (
        db.query(CardBatch)
        .filter(CardBatch.numbering_scope_id == central_scope.id, CardBatch.org_id == shared_org.id)
        .count()
        >= 1
    )
    assert (
        db.query(RechargeRequest)
        .filter(RechargeRequest.id == request.id, RechargeRequest.card_batch_id == first_batch.id)
        .count()
        == 1
    )


def test_ensure_recharge_request_batch_blocks_non_shared_org(db):
    non_shared_org = _create_org(db, name_prefix="Legacy Club")
    request = _create_recharge_request(db, org=non_shared_org, requested_cards=80)

    batch = ensure_recharge_request_batch(db, request.id)
    db.commit()
    db.refresh(request)

    assert batch is None
    assert request.card_batch_id is None
    assert request.status == RECHARGE_REQUEST_STATUS_BLOCKED_NON_SHARED


def test_super_admin_card_lot_registry_and_export(client, db):
    client.post("/api/super-admin/auth/logout")
    login_response = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )
    assert login_response.status_code == 200, login_response.text

    central_scope = ensure_assonam_central_scope(db)
    db.commit()
    shared_org = _create_org(
        db,
        name_prefix="Registro Lotti Club",
        numbering_scope_id=central_scope.id,
    )
    request = _create_recharge_request(db, org=shared_org, requested_cards=25)
    batch = ensure_recharge_request_batch(db, request.id)
    db.commit()
    assert batch is not None

    registry_response = client.get("/api/super-admin/card-lots")
    assert registry_response.status_code == 200, registry_response.text
    payload = registry_response.json()
    matching_item = next((item for item in payload["items"] if item["batch_id"] == batch.id), None)
    assert matching_item is not None
    assert matching_item["organization_name"] == shared_org.name
    assert matching_item["range_start_label"] == format_card_number(batch.start_no)
    assert matching_item["range_end_label"] == format_card_number(batch.end_no)
    assert matching_item["recharge_request_id"] == request.id

    export_response = client.get("/api/super-admin/card-lots/export.xlsx")
    assert export_response.status_code == 200, export_response.text
    assert (
        export_response.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert export_response.content[:2] == b"PK"
