from datetime import date, datetime, timedelta
import uuid

import pytest
from sqlalchemy import event, func
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import AnnualMembershipTerm, CardBatch, Member, MemberStatus, MembershipPayment, OperationLog, Organization


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_super_admin(client):
    client.post("/api/super-admin/auth/logout")
    response = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )
    assert response.status_code == 200, response.text


def _create_org(db, slug_prefix: str) -> Organization:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"{slug_prefix} {suffix}",
        slug=f"{slug_prefix}-{suffix}",
        privacy_version="v1",
        is_active=True,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _next_free_range(db, *, size: int = 40) -> tuple[int, int]:
    max_end = db.query(func.max(CardBatch.end_no)).scalar()
    base = int(max_end) if max_end is not None else 30000
    start_no = base + 100
    end_no = start_no + size - 1
    return start_no, end_no


def _set_card_range(client, org_id: int, start_no: int, end_no: int):
    response = client.post(
        f"/api/super-admin/organizations/{org_id}/card-range",
        json={"from_no": start_no, "to_no": end_no},
    )
    assert response.status_code == 200, response.text


def _latest_batch(db, org_id: int) -> CardBatch:
    batch = (
        db.query(CardBatch)
        .filter(CardBatch.org_id == org_id, CardBatch.released_at.is_(None))
        .order_by(CardBatch.id.desc())
        .first()
    )
    assert batch is not None
    return batch


def _create_assigned_member(db, org_id: int, batch: CardBatch) -> Member:
    suffix = uuid.uuid4().hex[:6]
    member = Member(
        org_id=org_id,
        first_name="Mario",
        last_name="Rossi",
        email=f"lot-member-{suffix}@example.com",
        status=MemberStatus.PENDING_DOCS,
        joined_at=datetime.utcnow(),
        card_no=batch.start_no,
        card_year=batch.year,
        batch_id=batch.id,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def test_super_admin_can_update_empty_card_lot_and_audit_it(client, db):
    _login_super_admin(client)
    org = _create_org(db, "lot-update-org")
    start_no, end_no = _next_free_range(db)
    _set_card_range(client, org.id, start_no, end_no)
    batch = _latest_batch(db, org.id)
    original_year = batch.year
    batch_id = batch.id

    next_start, next_end = _next_free_range(db)
    response = client.patch(
        f"/api/admin/organizations/{org.id}/card-lots/{batch_id}",
        json={
            "status": "inactive",
            "year": original_year + 1,
            "notes": "Lotto test super admin",
            "range_start": next_start,
            "range_end": next_end,
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ok"] is True
    assert payload["item"]["status_label"] == "Disattivo"
    assert payload["item"]["notes"] == "Lotto test super admin"
    assert payload["item"]["start_no"] == next_start
    assert payload["item"]["end_no"] == next_end
    assert payload["item"]["year"] == original_year + 1

    db.expire_all()
    refreshed = db.query(CardBatch).filter(CardBatch.id == batch_id).first()
    assert refreshed is not None
    assert refreshed.is_enabled is False
    assert refreshed.notes == "Lotto test super admin"
    assert refreshed.year == original_year + 1
    assert refreshed.start_no == next_start
    assert refreshed.end_no == next_end
    assert refreshed.next_no == next_start

    audit_log = (
        db.query(OperationLog)
        .filter(
            OperationLog.action == "org.cards.batch_updated",
            OperationLog.entity_type == "card_batch",
            OperationLog.entity_id == batch_id,
        )
        .order_by(OperationLog.id.desc())
        .first()
    )
    assert audit_log is not None
    assert audit_log.actor_admin_id is not None
    assert audit_log.created_at is not None
    assert audit_log.metadata_json["changes"]["status"] == "inactive"


def test_super_admin_blocks_range_update_on_assigned_lot_but_allows_status_and_notes(client, db):
    _login_super_admin(client)
    org = _create_org(db, "lot-assigned-org")
    start_no, end_no = _next_free_range(db)
    _set_card_range(client, org.id, start_no, end_no)
    batch = _latest_batch(db, org.id)
    _create_assigned_member(db, org.id, batch)

    allowed_response = client.patch(
        f"/api/admin/organizations/{org.id}/card-lots/{batch.id}",
        json={"status": "inactive", "notes": "Lotto congelato"},
    )
    assert allowed_response.status_code == 200, allowed_response.text
    allowed_payload = allowed_response.json()
    assert allowed_payload["item"]["status_label"] == "Disattivo"
    assert allowed_payload["item"]["notes"] == "Lotto congelato"

    blocked_response = client.patch(
        f"/api/admin/organizations/{org.id}/card-lots/{batch.id}",
        json={"range_start": batch.start_no + 10},
    )
    assert blocked_response.status_code == 409, blocked_response.text
    assert "tessere già assegnate" in blocked_response.json()["detail"]


def test_super_admin_can_delete_empty_card_lot_and_audit_it(client, db):
    _login_super_admin(client)
    org = _create_org(db, "lot-delete-org")
    start_no, end_no = _next_free_range(db)
    _set_card_range(client, org.id, start_no, end_no)
    batch = _latest_batch(db, org.id)
    batch_id = batch.id

    response = client.delete(f"/api/admin/organizations/{org.id}/card-lots/{batch_id}")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ok"] is True
    assert payload["deleted_lot_id"] == batch_id
    assert payload["released_at"] is not None

    db.expire_all()
    released_batch = db.query(CardBatch).filter(CardBatch.id == batch_id).first()
    assert released_batch is not None
    assert released_batch.released_at is not None

    audit_log = (
        db.query(OperationLog)
        .filter(
            OperationLog.action == "org.cards.batch_deleted",
            OperationLog.entity_type == "card_batch",
            OperationLog.entity_id == batch_id,
        )
        .order_by(OperationLog.id.desc())
        .first()
    )
    assert audit_log is not None
    assert audit_log.actor_admin_id is not None
    assert audit_log.created_at is not None
    assert audit_log.metadata_json["batch_id"] == batch_id


def test_super_admin_blocks_delete_when_lot_has_assigned_cards(client, db):
    _login_super_admin(client)
    org = _create_org(db, "lot-delete-blocked-org")
    start_no, end_no = _next_free_range(db)
    _set_card_range(client, org.id, start_no, end_no)
    batch = _latest_batch(db, org.id)
    _create_assigned_member(db, org.id, batch)

    response = client.delete(f"/api/admin/organizations/{org.id}/card-lots/{batch.id}")
    assert response.status_code == 409, response.text
    assert response.json()["detail"] == "Impossibile eliminare: esistono tessere già assegnate"

    db.expire_all()
    assert db.query(CardBatch).filter(CardBatch.id == batch.id).first() is not None


def test_live_checkout_hold_blocks_lot_release_resize_year_change_and_disable(client, db):
    _login_super_admin(client)
    org = _create_org(db, "lot-hold")
    start_no, end_no = _next_free_range(db)
    _set_card_range(client, org.id, start_no, end_no)
    batch = _latest_batch(db, org.id)
    payment = MembershipPayment(
        org_id=org.id, amount=10, currency="EUR", status="pending", source="sumup",
        reserved_card_no=start_no, reserved_batch_id=batch.id,
        reserved_card_year=batch.year, reservation_state="held",
        reservation_expires_at=datetime.utcnow() - timedelta(days=1),
    )
    db.add(payment)
    db.commit()
    url = f"/api/admin/organizations/{org.id}/card-lots/{batch.id}"
    for payload in ({"range_start": start_no + 1}, {"year": batch.year + 1}, {"status": "inactive"}):
        response = client.patch(url, json=payload)
        assert response.status_code == 409, response.text
    assert client.delete(url).status_code == 409
    notes = client.patch(url, json={"notes": "Checkout in corso"})
    assert notes.status_code == 200, notes.text
    assert notes.json()["item"]["reserved"] == 1
    assert notes.json()["item"]["remaining"] == end_no - start_no
    assert notes.json()["item"]["deletable"] is False


def test_scheduled_annual_card_protects_lot_without_current_member_card(client, db):
    _login_super_admin(client)
    org = _create_org(db, "lot-scheduled")
    start_no, end_no = _next_free_range(db)
    _set_card_range(client, org.id, start_no, end_no)
    batch = _latest_batch(db, org.id)
    member = Member(org_id=org.id, email=f"term-{uuid.uuid4().hex}@example.com")
    db.add(member)
    db.flush()
    db.add(AnnualMembershipTerm(
        member_id=member.id, org_id=org.id, membership_year=batch.year,
        starts_on=date(batch.year, 1, 1), valid_through=date(batch.year + 1, 1, 1),
        status="scheduled", card_no=start_no, card_year=batch.year, batch_id=batch.id,
    ))
    db.commit()
    url = f"/api/admin/organizations/{org.id}/card-lots/{batch.id}"
    assert client.patch(url, json={"range_start": start_no + 1}).status_code == 409
    assert client.delete(url).status_code == 409


def test_range_update_does_not_release_reservation_lock_before_saving_new_range(client, db):
    _login_super_admin(client)
    org = _create_org(db, "lot-atomic-resize")
    start_no, end_no = _next_free_range(db)
    _set_card_range(client, org.id, start_no, end_no)
    batch = _latest_batch(db, org.id)
    batch_id = batch.id
    new_range = (start_no + 1, end_no)
    committed_ranges = []

    def record_lot_at_commit(session):
        # A commit ends the allocation lock. Once the guarded lot has been
        # read, the first such boundary must already contain the new range;
        # otherwise a checkout can reserve its old first number in between.
        for entity in session.identity_map.values():
            if isinstance(entity, CardBatch) and entity.id == batch_id:
                committed_ranges.append((entity.start_no, entity.end_no))

    event.listen(Session, "before_commit", record_lot_at_commit)
    try:
        response = client.patch(
            f"/api/admin/organizations/{org.id}/card-lots/{batch_id}",
            json={"range_start": new_range[0]},
        )
    finally:
        event.remove(Session, "before_commit", record_lot_at_commit)

    assert response.status_code == 200, response.text
    assert committed_ranges == [new_range]
    db.refresh(batch)
    assert (batch.start_no, batch.end_no) == new_range
