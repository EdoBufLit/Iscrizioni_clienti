from __future__ import annotations

from datetime import datetime
import uuid

import pytest

from app.db import SessionLocal
from app.models import CardBatch, Member, MemberStatus, NumberingScope, OperationLog, Organization
from app.services.card_allocation import allocate_next_card, release_card_number
from app.services.numbering_scopes import ensure_assonam_central_scope, ensure_dedicated_scope


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


def _create_org(db, slug_prefix: str, *, numbering_scope_id: int | None = None) -> Organization:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"{slug_prefix} {suffix}",
        slug=f"{slug_prefix}-{suffix}",
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
    year: int,
    start_no: int,
    end_no: int,
    numbering_scope_id: int | None = None,
    next_no: int | None = None,
) -> CardBatch:
    batch = CardBatch(
        org_id=org_id,
        numbering_scope_id=numbering_scope_id,
        year=year,
        start_no=start_no,
        end_no=end_no,
        next_no=start_no if next_no is None else next_no,
        is_enabled=True,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def _create_member(
    db,
    *,
    org_id: int,
    card_no: int,
    year: int,
    batch_id: int | None = None,
    numbering_scope_id: int | None = None,
) -> Member:
    suffix = uuid.uuid4().hex[:6]
    member = Member(
        org_id=org_id,
        first_name="Mario",
        last_name="Rossi",
        email=f"numbering-{suffix}@example.com",
        status=MemberStatus.PENDING_DOCS,
        joined_at=datetime.utcnow(),
        card_no=card_no,
        card_year=year,
        batch_id=batch_id,
        numbering_scope_id=numbering_scope_id,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def test_allocate_uses_legacy_branch_when_scope_is_missing(db):
    year = datetime.utcnow().year
    org = _create_org(db, "numbering-legacy")
    _create_batch(db, org_id=org.id, year=year, start_no=500, end_no=505)

    first = allocate_next_card(db, org.id, year)
    db.commit()
    second = allocate_next_card(db, org.id, year)
    db.commit()

    assert first.card_no == 500
    assert second.card_no == 501
    assert first.numbering_scope_id is None
    assert second.numbering_scope_id is None


def test_allocate_shared_scope_uses_only_batches_of_the_emitting_org(db):
    year = datetime.utcnow().year
    central_scope = ensure_assonam_central_scope(db)
    db.commit()

    golden_age = _create_org(db, "numbering-shared-ga", numbering_scope_id=central_scope.id)
    tag = _create_org(db, "numbering-shared-tag", numbering_scope_id=central_scope.id)
    _create_batch(
        db,
        org_id=golden_age.id,
        numbering_scope_id=central_scope.id,
        year=year,
        start_no=1,
        end_no=10,
    )
    _create_batch(
        db,
        org_id=tag.id,
        numbering_scope_id=central_scope.id,
        year=year,
        start_no=100,
        end_no=110,
    )

    first = allocate_next_card(db, golden_age.id, year)
    db.commit()
    second = allocate_next_card(db, tag.id, year)
    db.commit()

    assert first.card_no == 1
    assert second.card_no == 100
    assert first.numbering_scope_id == central_scope.id
    assert second.numbering_scope_id == central_scope.id
    assert first.batch_id != second.batch_id


def test_allocate_dedicated_scope_starts_from_own_sequence(db):
    year = datetime.utcnow().year
    org = _create_org(db, "numbering-dedicated")
    dedicated_scope = ensure_dedicated_scope(db, org)
    org.numbering_scope_id = dedicated_scope.id
    db.commit()
    db.refresh(org)
    _create_batch(
        db,
        org_id=org.id,
        numbering_scope_id=dedicated_scope.id,
        year=year,
        start_no=1,
        end_no=20,
    )

    allocation = allocate_next_card(db, org.id, year)
    db.commit()

    assert allocation.card_no == 1
    assert allocation.numbering_scope_id == dedicated_scope.id


def test_scoped_allocator_skips_numbers_already_used_in_same_org(db):
    year = datetime.utcnow().year
    org = _create_org(db, "numbering-org-guard")
    dedicated_scope = ensure_dedicated_scope(db, org)
    org.numbering_scope_id = dedicated_scope.id
    db.commit()
    db.refresh(org)
    batch = _create_batch(
        db,
        org_id=org.id,
        numbering_scope_id=dedicated_scope.id,
        year=year,
        start_no=1,
        end_no=10,
    )
    _create_member(
        db,
        org_id=org.id,
        card_no=1,
        year=year,
        batch_id=batch.id,
    )

    allocation = allocate_next_card(db, org.id, year)
    db.commit()

    assert allocation.card_no == 2


def test_scoped_allocator_progresses_only_to_next_batch_of_same_org(db):
    year = datetime.utcnow().year
    central_scope = ensure_assonam_central_scope(db)
    db.commit()

    golden_age = _create_org(db, "numbering-shared-progress-ga", numbering_scope_id=central_scope.id)
    tag = _create_org(db, "numbering-shared-progress-tag", numbering_scope_id=central_scope.id)
    _create_batch(
        db,
        org_id=golden_age.id,
        numbering_scope_id=central_scope.id,
        year=year,
        start_no=1,
        end_no=10,
    )
    _create_batch(
        db,
        org_id=tag.id,
        numbering_scope_id=central_scope.id,
        year=year,
        start_no=100,
        end_no=101,
    )
    _create_batch(
        db,
        org_id=tag.id,
        numbering_scope_id=central_scope.id,
        year=year,
        start_no=200,
        end_no=201,
    )

    first = allocate_next_card(db, tag.id, year)
    db.commit()
    second = allocate_next_card(db, tag.id, year)
    db.commit()
    third = allocate_next_card(db, tag.id, year)
    db.commit()

    assert [first.card_no, second.card_no, third.card_no] == [100, 101, 200]


def test_release_card_number_never_rewinds_batch_of_other_org_in_same_scope(db):
    year = datetime.utcnow().year
    central_scope = ensure_assonam_central_scope(db)
    db.commit()

    golden_age = _create_org(db, "numbering-shared-release-ga", numbering_scope_id=central_scope.id)
    tag = _create_org(db, "numbering-shared-release-tag", numbering_scope_id=central_scope.id)
    golden_batch = _create_batch(
        db,
        org_id=golden_age.id,
        numbering_scope_id=central_scope.id,
        year=year,
        start_no=1,
        end_no=10,
        next_no=5,
    )
    _create_batch(
        db,
        org_id=tag.id,
        numbering_scope_id=central_scope.id,
        year=year,
        start_no=100,
        end_no=110,
        next_no=105,
    )

    release_card_number(
        db,
        org_id=tag.id,
        year=year,
        card_no=3,
        batch_id=golden_batch.id,
    )
    db.commit()
    db.expire_all()

    refreshed_batch = db.query(CardBatch).filter(CardBatch.id == golden_batch.id).first()
    assert refreshed_batch is not None
    assert refreshed_batch.next_no == 5


def test_patch_numbering_free_editable_reuses_dedicated_scope_and_backfills_unused_batches(client, db):
    _login_super_admin(client)
    year = datetime.utcnow().year
    central_scope = ensure_assonam_central_scope(db)
    db.commit()

    org = _create_org(db, "numbering-free-edit", numbering_scope_id=central_scope.id)
    reusable_scope = NumberingScope(
        name=f"ORG_{org.id}",
        scope_type="dedicated",
        owner_org_id=org.id,
        description="Scope dedicato riusabile",
        is_system=False,
    )
    db.add(reusable_scope)
    db.commit()
    db.refresh(reusable_scope)
    batch = _create_batch(
        db,
        org_id=org.id,
        numbering_scope_id=central_scope.id,
        year=year,
        start_no=1000,
        end_no=1010,
    )

    response = client.patch(
        f"/api/super-admin/organizations/{org.id}/numbering",
        json={"numbering_mode": "dedicated"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()

    db.expire_all()
    refreshed_org = db.query(Organization).filter(Organization.id == org.id).first()
    refreshed_batch = db.query(CardBatch).filter(CardBatch.id == batch.id).first()
    assert refreshed_org is not None
    assert refreshed_batch is not None

    assert payload["numbering_mode"] == "dedicated"
    assert payload["is_freely_editable"] is True
    assert payload["batch_backfill_count"] == 1
    assert refreshed_org.numbering_scope_id == reusable_scope.id
    assert refreshed_batch.numbering_scope_id == reusable_scope.id
    assert (
        db.query(NumberingScope)
        .filter(NumberingScope.owner_org_id == org.id, NumberingScope.scope_type == "dedicated")
        .count()
        == 1
    )

    audit_log = (
        db.query(OperationLog)
        .filter(
            OperationLog.action == "org.numbering_scope.updated",
            OperationLog.entity_type == "organization",
            OperationLog.entity_id == org.id,
        )
        .order_by(OperationLog.id.desc())
        .first()
    )
    assert audit_log is not None
    assert audit_log.metadata_json["new_scope_id"] == reusable_scope.id
    assert audit_log.metadata_json["batch_backfill_count"] == 1


def test_patch_numbering_sensitive_change_preserves_historical_members(client, db):
    _login_super_admin(client)
    year = datetime.utcnow().year
    central_scope = ensure_assonam_central_scope(db)
    db.commit()

    org = _create_org(db, "numbering-sensitive", numbering_scope_id=central_scope.id)
    batch = _create_batch(
        db,
        org_id=org.id,
        numbering_scope_id=central_scope.id,
        year=year,
        start_no=2000,
        end_no=2010,
        next_no=2001,
    )
    historical_member = _create_member(
        db,
        org_id=org.id,
        card_no=2000,
        year=year,
        batch_id=batch.id,
        numbering_scope_id=central_scope.id,
    )

    response = client.patch(
        f"/api/super-admin/organizations/{org.id}/numbering",
        json={"numbering_mode": "dedicated"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()

    db.expire_all()
    refreshed_member = db.query(Member).filter(Member.id == historical_member.id).first()
    refreshed_batch = db.query(CardBatch).filter(CardBatch.id == batch.id).first()
    refreshed_org = db.query(Organization).filter(Organization.id == org.id).first()
    assert refreshed_member is not None
    assert refreshed_batch is not None
    assert refreshed_org is not None

    assert payload["is_sensitive"] is True
    assert payload["warning_message"] is not None
    assert refreshed_member.card_no == 2000
    assert refreshed_member.numbering_scope_id == central_scope.id
    assert refreshed_batch.numbering_scope_id == central_scope.id
    assert refreshed_org.numbering_scope_id != central_scope.id


def test_super_admin_batches_listing_stays_scoped_to_selected_org(client, db):
    _login_super_admin(client)
    year = datetime.utcnow().year
    central_scope = ensure_assonam_central_scope(db)
    db.commit()

    golden_age = _create_org(db, "numbering-batches-ga", numbering_scope_id=central_scope.id)
    tag = _create_org(db, "numbering-batches-tag", numbering_scope_id=central_scope.id)
    ga_batch = _create_batch(
        db,
        org_id=golden_age.id,
        numbering_scope_id=central_scope.id,
        year=year,
        start_no=1000,
        end_no=1010,
    )
    _create_batch(
        db,
        org_id=tag.id,
        numbering_scope_id=central_scope.id,
        year=year,
        start_no=2000,
        end_no=2010,
    )

    response = client.get(f"/api/super-admin/organizations/{golden_age.id}/batches", params={"year": year})
    assert response.status_code == 200, response.text
    payload = response.json()

    assert [item["id"] for item in payload["batches"]] == [ga_batch.id]
    assert payload["summary"]["total"] == 11


def test_create_organization_defaults_to_shared_assonam(client, db):
    _login_super_admin(client)
    suffix = uuid.uuid4().hex[:8]

    response = client.post(
        "/api/super-admin/organizations",
        json={
            "name": f"Org shared default {suffix}",
            "slug": f"org-shared-default-{suffix}",
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()

    db.expire_all()
    created_org = db.query(Organization).filter(Organization.id == payload["id"]).first()
    central_scope = (
        db.query(NumberingScope).filter(NumberingScope.name == "ASSONAM_CENTRAL").first()
    )
    assert created_org is not None
    assert central_scope is not None
    assert payload["numbering_mode"] == "shared_assonam"
    assert payload["numbering_scope_name"] == "ASSONAM_CENTRAL"
    assert created_org.numbering_scope_id == central_scope.id
