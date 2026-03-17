from __future__ import annotations

from datetime import datetime
import uuid

import pytest

from app.db import SessionLocal
from app.models import CardBatch, Member, MemberStatus, Organization
from app.services.card_allocation import allocate_next_card
from app.services.numbering_scopes import ensure_assonam_central_scope
from app.services.shared_scope_migration import run_shared_scope_migration

TEST_SLUG_PREFIX = "migscope"


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture(autouse=True)
def cleanup_shared_scope_artifacts():
    session = SessionLocal()
    try:
        org_ids = [
            org_id
            for (org_id,) in (
                session.query(Organization.id)
                .filter(Organization.slug.like(f"{TEST_SLUG_PREFIX}-%"))
                .all()
            )
        ]
        if org_ids:
            session.query(Member).filter(Member.org_id.in_(org_ids)).delete(
                synchronize_session=False
            )
            session.query(CardBatch).filter(CardBatch.org_id.in_(org_ids)).delete(
                synchronize_session=False
            )
            session.query(Organization).filter(Organization.id.in_(org_ids)).delete(
                synchronize_session=False
            )
            session.commit()
        else:
            session.rollback()
    finally:
        session.close()

    yield

    session = SessionLocal()
    try:
        org_ids = [
            org_id
            for (org_id,) in (
                session.query(Organization.id)
                .filter(Organization.slug.like(f"{TEST_SLUG_PREFIX}-%"))
                .all()
            )
        ]
        if org_ids:
            session.query(Member).filter(Member.org_id.in_(org_ids)).delete(
                synchronize_session=False
            )
            session.query(CardBatch).filter(CardBatch.org_id.in_(org_ids)).delete(
                synchronize_session=False
            )
            session.query(Organization).filter(Organization.id.in_(org_ids)).delete(
                synchronize_session=False
            )
            session.commit()
        else:
            session.rollback()
    finally:
        session.close()


def _create_org(db, slug_prefix: str, *, numbering_scope_id: int | None = None) -> Organization:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"{slug_prefix} {suffix}",
        slug=f"{TEST_SLUG_PREFIX}-{slug_prefix}-{suffix}",
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
    next_no: int | None = None,
    numbering_scope_id: int | None = None,
    is_enabled: bool = True,
    released: bool = False,
) -> CardBatch:
    batch = CardBatch(
        org_id=org_id,
        year=year,
        start_no=start_no,
        end_no=end_no,
        next_no=start_no if next_no is None else next_no,
        numbering_scope_id=numbering_scope_id,
        is_enabled=is_enabled,
        released_at=datetime.utcnow() if released else None,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def _create_member(
    db,
    *,
    org_id: int,
    batch_id: int | None,
    year: int,
    card_no: int,
    numbering_scope_id: int | None = None,
) -> Member:
    suffix = uuid.uuid4().hex[:6]
    member = Member(
        org_id=org_id,
        first_name="Mario",
        last_name="Rossi",
        email=f"shared-scope-{suffix}@example.com",
        status=MemberStatus.PENDING_DOCS,
        joined_at=datetime.utcnow(),
        batch_id=batch_id,
        card_year=year,
        card_no=card_no,
        numbering_scope_id=numbering_scope_id,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def _unique_year() -> int:
    return 100000 + int(uuid.uuid4().hex[:6], 16)


def test_dry_run_reports_safe_apply_for_single_org(db):
    year = _unique_year()
    ensure_assonam_central_scope(db)
    db.commit()
    org = _create_org(db, "shared-safe-org")
    batch = _create_batch(db, org_id=org.id, year=year, start_no=100, end_no=110)

    report = run_shared_scope_migration(
        db,
        allowlist_entries=[{"org_id": org.id, "slug": org.slug, "name": org.name}],
        apply=False,
    )

    assert report["mode"] == "dry-run"
    assert report["summary"]["safe_to_apply_org_count"] == 1
    assert report["summary"]["candidate_batch_count"] == 1
    selected = report["selected_orgs"][0]
    assert selected["safe_to_apply"] is True
    assert selected["candidate_batch_ids"] == [batch.id]
    behavior_check = selected["projected_behavior_checks"][0]
    assert behavior_check["behavior_identical"] is True

    db.expire_all()
    refreshed_org = db.query(Organization).filter(Organization.id == org.id).first()
    refreshed_batch = db.query(CardBatch).filter(CardBatch.id == batch.id).first()
    assert refreshed_org is not None
    assert refreshed_batch is not None
    assert refreshed_org.numbering_scope_id is None
    assert refreshed_batch.numbering_scope_id is None


def test_dry_run_detects_scope_overlap_and_blocks_apply(db):
    year = _unique_year()
    central_scope = ensure_assonam_central_scope(db)
    db.commit()
    scoped_org = _create_org(db, "shared-central-owner", numbering_scope_id=central_scope.id)
    _create_batch(
        db,
        org_id=scoped_org.id,
        year=year,
        start_no=100,
        end_no=120,
        numbering_scope_id=central_scope.id,
    )
    org = _create_org(db, "shared-overlap-org")
    batch = _create_batch(db, org_id=org.id, year=year, start_no=110, end_no=130)

    report = run_shared_scope_migration(
        db,
        allowlist_entries=[{"org_id": org.id}],
        apply=False,
    )

    assert report["summary"]["conflict_count"] == 1
    assert report["summary"]["ambiguous_batch_count"] == 1
    selected = report["selected_orgs"][0]
    assert selected["safe_to_apply"] is False
    assert "ambiguous_legacy_batches_present" in selected["reasons"]
    assert report["ambiguous_batches"][0]["batch_id"] == batch.id

    db.expire_all()
    refreshed_org = db.query(Organization).filter(Organization.id == org.id).first()
    refreshed_batch = db.query(CardBatch).filter(CardBatch.id == batch.id).first()
    assert refreshed_org.numbering_scope_id is None
    assert refreshed_batch.numbering_scope_id is None


def test_dry_run_reports_released_sensitive_batches_that_block_auto_apply(db):
    year = _unique_year()
    ensure_assonam_central_scope(db)
    db.commit()
    org = _create_org(db, "shared-released-sensitive")
    released_batch = _create_batch(
        db,
        org_id=org.id,
        year=year,
        start_no=100,
        end_no=105,
        next_no=106,
        released=True,
    )
    active_batch = _create_batch(
        db,
        org_id=org.id,
        year=year,
        start_no=100,
        end_no=120,
    )
    _create_member(
        db,
        org_id=org.id,
        batch_id=released_batch.id,
        year=year,
        card_no=103,
    )

    report = run_shared_scope_migration(
        db,
        allowlist_entries=[{"org_id": org.id}],
        apply=False,
    )

    assert report["summary"]["released_sensitive_batch_count"] == 1
    released_row = report["released_sensitive_batches"][0]
    assert released_row["batch_id"] == released_batch.id
    assert released_row["blocks_auto_apply"] is True
    assert any(
        reason == "released_batch_cards_overlap_projected_active_shared_domain"
        for reason in released_row["reasons"]
    )
    selected = report["selected_orgs"][0]
    assert selected["safe_to_apply"] is False
    assert "released_sensitive_batches_require_manual_review" in selected["reasons"]
    assert active_batch.id in selected["candidate_batch_ids"]


def test_apply_updates_only_org_and_eligible_batches_and_is_idempotent(db):
    year = _unique_year()
    central_scope = ensure_assonam_central_scope(db)
    db.commit()
    org = _create_org(db, "shared-apply-org")
    active_batch = _create_batch(db, org_id=org.id, year=year, start_no=200, end_no=210)
    inactive_unused_batch = _create_batch(
        db,
        org_id=org.id,
        year=year,
        start_no=300,
        end_no=305,
        next_no=306,
        is_enabled=True,
    )
    member = _create_member(
        db,
        org_id=org.id,
        batch_id=active_batch.id,
        year=year,
        card_no=205,
    )

    first_report = run_shared_scope_migration(
        db,
        allowlist_entries=[{"org_id": org.id}],
        apply=True,
    )
    assert first_report["summary"]["migrated_org_count"] == 1
    assert first_report["summary"]["migrated_batch_count"] == 1

    db.expire_all()
    refreshed_org = db.query(Organization).filter(Organization.id == org.id).first()
    refreshed_active = db.query(CardBatch).filter(CardBatch.id == active_batch.id).first()
    refreshed_inactive = (
        db.query(CardBatch).filter(CardBatch.id == inactive_unused_batch.id).first()
    )
    refreshed_member = db.query(Member).filter(Member.id == member.id).first()
    assert refreshed_org.numbering_scope_id == central_scope.id
    assert refreshed_active.numbering_scope_id == central_scope.id
    assert refreshed_inactive.numbering_scope_id is None
    assert refreshed_member.card_no == 205
    assert refreshed_member.batch_id == active_batch.id
    assert refreshed_member.card_year == year
    assert refreshed_member.numbering_scope_id is None

    second_report = run_shared_scope_migration(
        db,
        allowlist_entries=[{"org_id": org.id}],
        apply=True,
    )
    assert second_report["summary"]["migrated_org_count"] == 0
    assert second_report["summary"]["migrated_batch_count"] == 0


def test_apply_preserves_batch_progression_behavior_for_single_org_shared_migration(db):
    year = _unique_year()
    ensure_assonam_central_scope(db)
    db.commit()
    org = _create_org(db, "shared-progression-org")
    _create_batch(db, org_id=org.id, year=year, start_no=10, end_no=11)
    _create_batch(db, org_id=org.id, year=year, start_no=20, end_no=21)

    report = run_shared_scope_migration(
        db,
        allowlist_entries=[{"org_id": org.id}],
        apply=True,
    )
    assert report["summary"]["migrated_org_count"] == 1
    assert report["summary"]["migrated_batch_count"] == 2

    first = allocate_next_card(db, org.id, year)
    db.commit()
    second = allocate_next_card(db, org.id, year)
    db.commit()
    third = allocate_next_card(db, org.id, year)
    db.commit()

    assert [first.card_no, second.card_no, third.card_no] == [10, 11, 20]


def test_apply_with_fail_on_ambiguous_raises_without_writing(db):
    year = _unique_year()
    central_scope = ensure_assonam_central_scope(db)
    db.commit()
    existing_shared_org = _create_org(
        db,
        "shared-fail-existing",
        numbering_scope_id=central_scope.id,
    )
    _create_batch(
        db,
        org_id=existing_shared_org.id,
        year=year,
        start_no=500,
        end_no=520,
        numbering_scope_id=central_scope.id,
    )
    org = _create_org(db, "shared-fail-overlap")
    batch = _create_batch(db, org_id=org.id, year=year, start_no=510, end_no=530)

    with pytest.raises(RuntimeError):
        run_shared_scope_migration(
            db,
            allowlist_entries=[{"org_id": org.id}],
            apply=True,
            fail_on_ambiguous=True,
        )

    db.expire_all()
    refreshed_org = db.query(Organization).filter(Organization.id == org.id).first()
    refreshed_batch = db.query(CardBatch).filter(CardBatch.id == batch.id).first()
    assert refreshed_org.numbering_scope_id is None
    assert refreshed_batch.numbering_scope_id is None


def test_dry_run_keeps_tag_safe_when_golden_is_already_migrated(db):
    year = _unique_year()
    central_scope = ensure_assonam_central_scope(db)
    db.commit()

    golden_age = _create_org(
        db,
        "shared-golden-migrated",
        numbering_scope_id=central_scope.id,
    )
    tag = _create_org(db, "shared-tag-pending")

    _create_batch(
        db,
        org_id=golden_age.id,
        numbering_scope_id=central_scope.id,
        year=year,
        start_no=18401,
        end_no=18701,
        next_no=18662,
    )
    _create_batch(
        db,
        org_id=golden_age.id,
        numbering_scope_id=central_scope.id,
        year=year,
        start_no=25701,
        end_no=26000,
        next_no=25701,
    )
    _create_batch(
        db,
        org_id=tag.id,
        year=year,
        start_no=25201,
        end_no=25400,
        next_no=25401,
    )
    tag_active = _create_batch(
        db,
        org_id=tag.id,
        year=year,
        start_no=25401,
        end_no=25700,
        next_no=25660,
    )

    report = run_shared_scope_migration(
        db,
        allowlist_entries=[{"org_id": tag.id}],
        apply=False,
    )

    selected = report["selected_orgs"][0]
    behavior_check = selected["projected_behavior_checks"][0]
    assert selected["safe_to_apply"] is True
    assert behavior_check["behavior_identical"] is True
    assert behavior_check["current_next"]["card_no"] == 25660
    assert behavior_check["current_next"]["batch_id"] == tag_active.id
    assert behavior_check["projected_next"]["card_no"] == 25660
    assert behavior_check["projected_next"]["batch_id"] == tag_active.id
