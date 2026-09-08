from datetime import date, datetime
from uuid import uuid4

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AnnualMembershipTerm, CardBatch, CardMovement, Member, MembershipPayment,
    NumberingScope, OperationLog, Organization,
)
from app.services.card_lot_registry import AUTOMATIC_LOT_ACTION, preview_automatic_card_lot

YEAR = datetime.utcnow().year


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


def org(db, scope=None):
    item = Organization(name="Automatic lot test", slug=f"auto-lot-{uuid4().hex}", numbering_scope_id=scope)
    db.add(item)
    db.commit()
    return item


def scope(db, kind="dedicated"):
    item = NumberingScope(name=f"test-{uuid4().hex}", scope_type=kind)
    db.add(item)
    db.commit()
    return item.id


def batch(db, owner, start=1, end=100, **kwargs):
    item = CardBatch(org_id=owner.id, numbering_scope_id=owner.numbering_scope_id,
                     start_no=start, end_no=end, next_no=end + 1, year=kwargs.pop("year", YEAR), **kwargs)
    db.add(item)
    db.commit()
    return item


def login(client):
    client.post("/api/super-admin/auth/logout")
    response = client.post("/api/super-admin/auth/login", json={"email": "admin@assonam.it", "password": "admin"})
    assert response.status_code == 200, response.text


def payload(owner, **kwargs):
    return dict(organization_id=owner.id, quantity=100, year=YEAR, idempotency_key=str(uuid4()), **kwargs)


def test_preview_has_no_stock_side_effect_and_post_recomputes_then_reuses(client, db):
    login(client)
    owner = org(db, scope(db))
    data = payload(owner)
    preview = client.get("/api/super-admin/card-lots/preview", params={"organization_id": owner.id, "quantity": 100})
    assert preview.status_code == 200, preview.text
    assert (preview.json()["range_start"], preview.json()["range_end"]) == (1, 100)
    assert db.query(CardBatch).filter_by(org_id=owner.id).count() == 0
    batch(db, owner)  # A different administrator took the previewed range.
    first = client.post("/api/super-admin/card-lots", json=data)
    assert first.status_code == 200, first.text
    item = first.json()["item"]
    assert (item["range_start"], item["range_end"], item["next_no"]) == (101, 200, 101)
    assert (item["assigned"], item["reserved"], item["remaining"]) == (0, 0, 100)
    assert item["status_label"] == "Attivo"
    again = client.post("/api/super-admin/card-lots", json=data)
    assert again.status_code == 200, again.text
    assert again.json()["item"]["id"] == item["id"] and again.json()["reused"] is True
    assert db.query(CardBatch).filter_by(org_id=owner.id).count() == 2
    assert db.query(CardMovement).filter_by(org_id=owner.id, reason="batch_added").count() == 1
    receipt = db.query(OperationLog).filter_by(action=AUTOMATIC_LOT_ACTION, request_id=data["idempotency_key"]).one()
    assert receipt.entity_id == item["id"]
    assert receipt.metadata_json["quantity"] == 100
    assert client.post("/api/super-admin/card-lots", json={**data, "quantity": 101}).status_code == 409
    assert client.post("/api/super-admin/card-lots", json={**data, "organization_id": org(db, scope(db)).id}).status_code == 409


@pytest.mark.parametrize("kind,base", [("shared", 30000), ("dedicated", 0)])
def test_scope_high_water_includes_all_associations_years_and_released_lots(db, kind, base):
    scope_id = scope(db, kind)
    owner, other = org(db, scope_id), org(db, scope_id)
    def preview():
        return preview_automatic_card_lot(db, org=owner, quantity=300, year=YEAR)["range_start"]
    assert preview() == base + 1
    batch(db, other, 26001, 26300, year=YEAR - 1, is_enabled=False, released_at=datetime.utcnow())
    batch(db, org(db, scope(db)), 100000, 200000)  # Separate number domain.
    assert preview() == 26301
    batch(db, other, 27001, 28000, year=YEAR + 1)
    assert preview() == 28001


def test_unlinked_owned_scope_and_future_reservations_protect_numbers(db):
    scope_id = scope(db)
    owner, other = org(db, scope_id), org(db, scope_id)
    member = Member(org_id=other.id, email=f"lot-{uuid4().hex}@example.test", card_no=400,
                    numbering_scope_id=scope_id, deleted_at=datetime.utcnow())
    db.add(member)
    db.commit()
    term = AnnualMembershipTerm(member_id=member.id, org_id=other.id, membership_year=YEAR + 1,
                                starts_on=date(YEAR + 1, 1, 1), valid_through=date(YEAR + 1, 12, 31),
                                status="pending", card_no=500, numbering_scope_id=scope_id)
    historical = CardBatch(org_id=other.id, numbering_scope_id=scope(db), start_no=501, end_no=600, next_no=501, year=YEAR + 2)
    db.add(historical)
    db.flush()
    hold = MembershipPayment(org_id=other.id, amount=10, status="pending", source="sumup", membership_year=YEAR + 2,
                             reserved_batch_id=historical.id, reserved_card_year=YEAR + 2,
                             reserved_card_no=600, reserved_numbering_scope_id=scope_id,
                             reservation_state="held", reservation_expires_at=datetime(2020, 1, 1))
    db.add_all([term, hold])
    db.commit()
    def next_number():
        return preview_automatic_card_lot(db, org=owner, quantity=1, year=YEAR)["range_start"]
    assert next_number() == 601  # Local expiry never frees an unverified checkout.
    hold.reservation_state = "released"
    db.commit()
    assert next_number() == 501
    term.status = "cancelled"
    db.commit()
    assert next_number() == 401
    member.numbering_scope_id = scope(db)
    member.org_id = owner.id
    db.commit()
    assert next_number() == 401  # An owned historical number in a previous scope.


def test_legacy_domain_protects_other_legacy_associations(db):
    owner, other = org(db), org(db)
    batch(db, other, 900000, 900100, is_enabled=False)
    db.add(Member(org_id=other.id, email=f"legacy-{uuid4().hex}@example.test", card_no=900200))
    db.commit()
    preview = preview_automatic_card_lot(db, org=owner, quantity=100, year=YEAR)
    assert (preview["range_start"], preview["range_end"]) == (900201, 900300)


@pytest.mark.parametrize("changes", [
    {"quantity": 0}, {"quantity": -1}, {"quantity": 100001}, {"quantity": True},
    {"quantity": 1.5}, {"organization_id": 0}, {"organization_id": True},
    {"idempotency_key": "invalid"}, {"range_start": 1}, {"year": 1999},
])
def test_invalid_input_never_creates_stock(client, db, changes):
    login(client)
    owner = org(db, scope(db))
    response = client.post("/api/super-admin/card-lots", json={**payload(owner), **changes})
    assert response.status_code in (400, 422), response.text
    assert db.query(CardBatch).filter_by(org_id=owner.id).count() == 0


def test_missing_archived_and_overflow_are_rejected(client, db):
    login(client)
    owner = org(db, scope(db))
    assert client.post("/api/super-admin/card-lots", json={**payload(owner), "organization_id": 99999999}).status_code == 404
    owner.deleted_at = datetime.utcnow()
    db.commit()
    assert client.post("/api/super-admin/card-lots", json=payload(owner)).status_code == 409
    owner.deleted_at = None
    batch(db, owner, 2147483500, 2147483600)
    assert client.post("/api/super-admin/card-lots", json=payload(owner)).status_code == 409


def test_super_admin_and_recent_mfa_are_required(client, db, monkeypatch):
    owner = org(db, scope(db))
    client.post("/api/super-admin/auth/logout")
    assert client.get("/api/super-admin/card-lots/preview", params={"organization_id": owner.id, "quantity": 100}).status_code == 401
    assert client.post("/api/super-admin/card-lots", json=payload(owner)).status_code == 401
    login(client)
    monkeypatch.setattr(settings, "SUPER_ADMIN_MFA_REQUIRED", True)
    response = client.post("/api/super-admin/card-lots", json=payload(owner))
    assert response.status_code == 403, response.text
    assert db.query(CardBatch).filter_by(org_id=owner.id).count() == 0
