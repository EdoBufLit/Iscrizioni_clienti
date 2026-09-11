from __future__ import annotations

from datetime import datetime, timedelta
import uuid

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    CardBatch,
    EmailOutbox,
    OperationLog,
    Organization,
    OrgAdminToken,
    RechargeRequest,
    RechargeRequestAccountingEvent,
)
from app.security import get_password_hash
from app.services.card_lot_registry import ensure_recharge_request_batch
from app.services.card_replenishments import replenishment_summary
from app.services.numbering_scopes import (
    ensure_assonam_central_scope,
    ensure_dedicated_scope,
)
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _create_org(db, *, shared: bool) -> Organization:
    suffix = uuid.uuid4().hex[:10]
    central_scope = ensure_assonam_central_scope(db)
    org = Organization(
        name=f"Replenishment Club {suffix}",
        slug=f"replenishment-club-{suffix}",
        privacy_version="v1",
        is_active=True,
        numbering_scope_id=central_scope.id if shared else None,
    )
    db.add(org)
    db.flush()
    if not shared:
        dedicated = ensure_dedicated_scope(db, org)
        org.numbering_scope_id = dedicated.id
    db.commit()
    db.refresh(org)
    return org


def _create_org_admin(db, org: Organization) -> AdminUser:
    suffix = uuid.uuid4().hex[:10]
    admin = AdminUser(
        email=f"replenishment-{suffix}@example.com",
        password_hash=get_password_hash("Pass1234!"),
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


def _login_org_admin(client, db, admin: AdminUser) -> None:
    raw_token = f"replenishment-login-{uuid.uuid4().hex}"
    db.add(
        OrgAdminToken(
            admin_id=admin.id,
            token_hash=hash_token(raw_token),
            expires_at=datetime.utcnow() + timedelta(minutes=15),
        )
    )
    db.commit()
    response = client.get(
        f"/api/org-admin/auth/verify?token={raw_token}",
        follow_redirects=False,
    )
    assert response.status_code in (302, 307), response.text


def _login_super_admin(client) -> None:
    client.post("/api/super-admin/auth/logout")
    response = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "authenticated"


def _create_portal_request(
    client,
    db,
    *,
    quantity: int = 120,
    requested_year: int | None = None,
):
    org = _create_org(db, shared=True)
    admin = _create_org_admin(db, org)
    _login_org_admin(client, db, admin)
    key = f"replenishment-{uuid.uuid4().hex}"
    body = {"requested_cards": quantity, "notes": "Consegna lotto portale"}
    if requested_year is not None:
        body["requested_year"] = requested_year
    response = client.post(
        "/api/org-admin/cards/replenishments",
        headers={"Idempotency-Key": key},
        json=body,
    )
    assert response.status_code == 201, response.text
    return org, admin, key, response.json()


def test_portal_replenishment_creates_complete_lot_debt_and_notification(client, db):
    org, _admin, key, payload = _create_portal_request(client, db, quantity=125)
    item = payload["item"]

    assert payload["created"] is True
    assert item["requested_cards"] == 125
    assert item["requested_year"] == datetime.utcnow().year
    assert item["unit_price_cents"] == 100
    assert item["amount_due_cents"] == 12_500
    assert item["currency"] == "EUR"
    assert item["billing_status"] == "unpaid"
    assert item["allocation_status"] == "lot_created"
    assert item["card_batch_id"] is not None
    assert item["batch_range_end"] - item["batch_range_start"] + 1 == 125
    assert item["super_admin_notified_at"] is not None

    persisted = db.query(RechargeRequest).filter(RechargeRequest.id == item["id"]).one()
    batch = db.query(CardBatch).filter(CardBatch.id == persisted.card_batch_id).one()
    assert batch.org_id == org.id
    assert batch.year == item["requested_year"]
    assert batch.end_no - batch.start_no + 1 == 125
    assert persisted.idempotency_key == key
    assert persisted.notification_email_outbox_id is not None
    outbox = db.query(EmailOutbox).filter(EmailOutbox.id == persisted.notification_email_outbox_id).one()
    assert outbox.email_type == "card_replenishment_requested"
    assert outbox.dedupe_key == f"card_replenishment_requested:{persisted.id}"

    listing = client.get("/api/org-admin/cards/replenishments")
    assert listing.status_code == 200, listing.text
    matching = next(row for row in listing.json()["items"] if row["id"] == persisted.id)
    assert matching["billing_status"] == "unpaid"
    assert listing.json()["summary"]["outstanding_cents"] >= 12_500
    assert listing.json()["capability"]["can_auto_allocate"] is True
    assert listing.json()["capability"]["default_year"] == datetime.utcnow().year
    assert listing.json()["capability"]["allowed_years"] == [
        datetime.utcnow().year,
        datetime.utcnow().year + 1,
    ]


def test_portal_replenishment_can_snapshot_and_allocate_next_year_lot(client, db):
    next_year = datetime.utcnow().year + 1
    org, _admin, _key, payload = _create_portal_request(
        client,
        db,
        quantity=63,
        requested_year=next_year,
    )

    item = payload["item"]
    assert item["requested_year"] == next_year
    persisted = db.query(RechargeRequest).filter(RechargeRequest.id == item["id"]).one()
    batch = db.query(CardBatch).filter(CardBatch.id == persisted.card_batch_id).one()
    assert persisted.association_id == org.id
    assert persisted.requested_year == next_year
    assert batch.year == next_year
    assert batch.end_no - batch.start_no + 1 == 63


def test_portal_replenishment_rejects_year_outside_current_or_next(client, db):
    org = _create_org(db, shared=True)
    admin = _create_org_admin(db, org)
    _login_org_admin(client, db, admin)
    before = db.query(RechargeRequest).filter(
        RechargeRequest.association_id == org.id
    ).count()

    response = client.post(
        "/api/org-admin/cards/replenishments",
        headers={"Idempotency-Key": f"invalid-year-{uuid.uuid4().hex}"},
        json={
            "requested_cards": 25,
            "requested_year": datetime.utcnow().year + 2,
        },
    )

    assert response.status_code == 422, response.text
    assert "anno corrente" in response.json()["detail"].lower()
    assert (
        db.query(RechargeRequest)
        .filter(RechargeRequest.association_id == org.id)
        .count()
        == before
    )


def test_portal_replenishment_is_idempotent_and_does_not_duplicate_lot_or_debt(client, db):
    org, _admin, key, first = _create_portal_request(client, db, quantity=77)
    first_id = first["item"]["id"]
    first_batch_id = first["item"]["card_batch_id"]

    retry = client.post(
        "/api/org-admin/cards/replenishments",
        headers={"Idempotency-Key": key},
        json={
            "requested_cards": 77,
            "requested_year": datetime.utcnow().year + 1,
            "notes": "Ritrasmissione client",
        },
    )
    assert retry.status_code == 201, retry.text
    assert retry.json()["created"] is False
    assert retry.json()["item"]["id"] == first_id
    assert retry.json()["item"]["card_batch_id"] == first_batch_id
    assert retry.json()["item"]["requested_year"] == datetime.utcnow().year
    assert (
        db.query(RechargeRequest)
        .filter(
            RechargeRequest.association_id == org.id,
            RechargeRequest.source == "org_admin_portal",
        )
        .count()
        == 1
    )
    assert db.query(CardBatch).filter(CardBatch.id == first_batch_id).count() == 1


def test_dedicated_numbering_is_blocked_before_creating_debt_or_batch(client, db):
    org = _create_org(db, shared=False)
    admin = _create_org_admin(db, org)
    _login_org_admin(client, db, admin)
    requests_before = db.query(RechargeRequest).filter(RechargeRequest.association_id == org.id).count()
    batches_before = db.query(CardBatch).filter(CardBatch.org_id == org.id).count()

    response = client.post(
        "/api/org-admin/cards/replenishments",
        headers={"Idempotency-Key": f"dedicated-{uuid.uuid4().hex}"},
        json={"requested_cards": 50},
    )

    assert response.status_code == 409, response.text
    assert "numerazione dedicata" in response.json()["detail"].lower()
    assert db.query(RechargeRequest).filter(RechargeRequest.association_id == org.id).count() == requests_before
    assert db.query(CardBatch).filter(CardBatch.org_id == org.id).count() == batches_before


def test_org_admin_replenishment_registry_is_tenant_isolated(client, db):
    first_org, _first_admin, _key, first_payload = _create_portal_request(
        client,
        db,
        quantity=31,
    )
    first_request_id = first_payload["item"]["id"]

    second_org = _create_org(db, shared=True)
    second_admin = _create_org_admin(db, second_org)
    _login_org_admin(client, db, second_admin)
    second_listing = client.get("/api/org-admin/cards/replenishments")

    assert second_listing.status_code == 200, second_listing.text
    assert all(item["organization_id"] == second_org.id for item in second_listing.json()["items"])
    assert first_request_id not in {item["id"] for item in second_listing.json()["items"]}
    assert second_listing.json()["summary"]["outstanding_cents"] == 0
    assert first_org.id != second_org.id


def test_allocator_failure_rolls_back_request_debt_notification_and_lot(
    client,
    db,
    monkeypatch,
):
    org = _create_org(db, shared=True)
    admin = _create_org_admin(db, org)
    _login_org_admin(client, db, admin)
    request_count_before = db.query(RechargeRequest).filter(RechargeRequest.association_id == org.id).count()
    batch_count_before = db.query(CardBatch).filter(CardBatch.org_id == org.id).count()
    outbox_count_before = db.query(EmailOutbox).count()

    def _fail_allocation(_db, _request_id):
        raise RuntimeError("simulated allocator failure")

    monkeypatch.setattr(
        "app.services.card_replenishments.ensure_recharge_request_batch",
        _fail_allocation,
    )
    response = client.post(
        "/api/org-admin/cards/replenishments",
        headers={"Idempotency-Key": f"atomic-{uuid.uuid4().hex}"},
        json={"requested_cards": 99},
    )

    assert response.status_code == 409, response.text
    assert db.query(RechargeRequest).filter(RechargeRequest.association_id == org.id).count() == request_count_before
    assert db.query(CardBatch).filter(CardBatch.org_id == org.id).count() == batch_count_before
    assert db.query(EmailOutbox).count() == outbox_count_before


def test_super_admin_updates_paid_state_with_append_only_events_and_audit(client, db):
    org, _admin, _key, created = _create_portal_request(client, db, quantity=40)
    request_id = created["item"]["id"]
    _login_super_admin(client)

    paid = client.patch(
        f"/api/super-admin/recharge-credits/{request_id}/accounting",
        json={
            "billing_status": "paid",
            "payment_reference": "BON-2026-001",
            "accounting_note": "Bonifico verificato",
        },
    )
    assert paid.status_code == 200, paid.text
    assert paid.json()["item"]["billing_status"] == "paid"
    assert paid.json()["item"]["paid_at"] is not None
    assert paid.json()["item"]["payment_reference"] == "BON-2026-001"
    assert len(paid.json()["item"]["accounting_events"]) == 1

    unpaid = client.patch(
        f"/api/super-admin/recharge-credits/{request_id}/accounting",
        json={
            "billing_status": "unpaid",
            "accounting_note": "Pagamento stornato",
        },
    )
    assert unpaid.status_code == 200, unpaid.text
    assert unpaid.json()["item"]["billing_status"] == "unpaid"
    assert unpaid.json()["item"]["paid_at"] is None
    assert len(unpaid.json()["item"]["accounting_events"]) == 2

    events = (
        db.query(RechargeRequestAccountingEvent)
        .filter(RechargeRequestAccountingEvent.recharge_request_id == request_id)
        .order_by(RechargeRequestAccountingEvent.id.asc())
        .all()
    )
    assert [(event.previous_status, event.new_status) for event in events] == [
        ("unpaid", "paid"),
        ("paid", "unpaid"),
    ]
    assert all(event.changes_json.get("before") and event.changes_json.get("after") for event in events)
    assert (
        db.query(OperationLog)
        .filter(
            OperationLog.entity_type == "recharge_request",
            OperationLog.entity_id == request_id,
            OperationLog.action == "super_admin.cards.replenishment_accounting_updated",
            OperationLog.org_id == org.id,
        )
        .count()
        == 2
    )


def test_recharge_credit_mutation_requires_recent_super_admin_step_up(client, db, monkeypatch):
    _org, _admin, _key, created = _create_portal_request(client, db, quantity=10)
    request_id = created["item"]["id"]
    _login_super_admin(client)
    monkeypatch.setattr(settings, "SUPER_ADMIN_MFA_REQUIRED", True)

    blocked = client.patch(
        f"/api/super-admin/recharge-credits/{request_id}/accounting",
        json={"billing_status": "paid"},
    )
    assert blocked.status_code == 403, blocked.text
    db.expire_all()
    persisted = db.query(RechargeRequest).filter(RechargeRequest.id == request_id).one()
    assert persisted.billing_status == "unpaid"
    assert (
        db.query(RechargeRequestAccountingEvent)
        .filter(RechargeRequestAccountingEvent.recharge_request_id == request_id)
        .count()
        == 0
    )


def test_existing_whatsapp_replenishment_flow_remains_not_applicable(client, db):
    org = _create_org(db, shared=True)
    existing = RechargeRequest(
        association_id=org.id,
        association_name=org.name,
        requester_whatsapp="whatsapp:+393331234567",
        requester_profile_name="Mario Rossi",
        requested_cards=25,
        notes=None,
    )
    db.add(existing)
    db.flush()
    batch = ensure_recharge_request_batch(db, existing.id)
    db.commit()
    db.refresh(existing)

    assert batch is not None
    assert existing.source == "whatsapp"
    assert existing.billing_status == "not_applicable"
    assert existing.unit_price_cents == 100
    assert existing.amount_due_cents == 2_500
    assert existing.card_batch_id == batch.id


def test_org_card_totals_include_whatsapp_without_adding_debt_or_duplicate_lots(client, db):
    org, admin, _key, portal = _create_portal_request(client, db, quantity=120)
    other_org = _create_org(db, shared=True)
    whatsapp = RechargeRequest(
        association_id=org.id,
        association_name=org.name,
        requester_whatsapp="whatsapp:+393331234567",
        requested_cards=75,
    )
    pending = RechargeRequest(
        association_id=org.id,
        association_name=org.name,
        requester_whatsapp="whatsapp:+393331234568",
        requested_cards=25,
    )
    other = RechargeRequest(
        association_id=other_org.id,
        association_name=other_org.name,
        requester_whatsapp="whatsapp:+393331234569",
        requested_cards=900,
    )
    unlinked = RechargeRequest(
        association_id=None,
        association_name=org.name,
        requester_whatsapp="whatsapp:+393331234570",
        requested_cards=600,
    )
    db.add_all([whatsapp, pending, other, unlinked])
    db.flush()
    batch = ensure_recharge_request_batch(db, whatsapp.id)
    db.commit()
    assert batch is not None
    lots_before = db.query(CardBatch).filter(CardBatch.org_id == org.id).count()

    _login_org_admin(client, db, admin)
    for _ in range(2):
        response = client.get("/api/org-admin/cards/replenishments", params={"limit": 1})
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["total"] == 3
        assert len(payload["items"]) == 1
        assert payload["summary"] == {
            "total": 3,
            "requested_cards": 220,
            "whatsapp_cards": 100,
            "unpaid": 1,
            "paid": 0,
            "outstanding_cents": 12_000,
            "paid_cents": 0,
        }

    listing = client.get("/api/org-admin/cards/replenishments").json()
    assert {item["id"] for item in listing["items"]} == {
        portal["item"]["id"], whatsapp.id, pending.id,
    }
    assert {item["source"] for item in listing["items"]} == {"org_admin_portal", "whatsapp"}
    assert db.query(CardBatch).filter(CardBatch.org_id == org.id).count() == lots_before
    assert db.get(RechargeRequest, whatsapp.id).billing_status == "not_applicable"
    # The super-admin portal accounting summary retains its original scope.
    accounting = replenishment_summary(db, org_id=org.id)
    assert accounting["total"] == 1
    assert accounting["requested_cards"] == 120
    assert accounting["whatsapp_cards"] == 0


def test_org_card_totals_are_zero_for_no_requests(client, db):
    org = _create_org(db, shared=True)
    _login_org_admin(client, db, _create_org_admin(db, org))
    response = client.get("/api/org-admin/cards/replenishments")
    assert response.status_code == 200, response.text
    assert response.json()["items"] == []
    assert response.json()["summary"]["requested_cards"] == 0
    assert response.json()["summary"]["whatsapp_cards"] == 0
