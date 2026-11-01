from datetime import date, datetime, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest

from app.db import SessionLocal
from app.models import (
    AnnualCardDeactivationRun,
    AnnualMembershipTerm,
    CardBatch,
    Member,
    MemberDocument,
    Organization,
)
from app.services import member_maintenance
from app.services.annual_memberships import annual_membership_valid_through
from app.services.member_activity import is_member_active, member_active_filters, member_expired_filters
from app.services.member_filters import member_expiring_filters
from app.services.member_membership import is_member_membership_expired, resolve_member_valid_until


ROME = ZoneInfo("Europe/Rome")


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


def _issued_card(db, *, year, status="active", membership_type="annual"):
    suffix = uuid4().hex
    org = Organization(name=f"Rollover {suffix}", slug=f"rollover-{suffix}", is_active=True)
    db.add(org)
    db.flush()
    batch = CardBatch(org_id=org.id, year=year, start_no=100, end_no=200, next_no=101)
    db.add(batch)
    db.flush()
    member = Member(
        org_id=org.id,
        first_name="Socio",
        last_name="Da conservare",
        email=f"rollover-{suffix}@example.com",
        password_hash="existing-credential-hash",
        fiscal_code=f"FISCAL-{suffix}",
        phone="+390212345678",
        status="active",
        membership_type=membership_type,
        card_year=year,
        card_no=100,
        batch_id=batch.id,
        joined_at=datetime(year, 4, 2),
        valid_until=datetime(2027, 5, 1) if membership_type == "temporary" else None,
    )
    db.add(member)
    db.flush()
    document = MemberDocument(
        member_id=member.id,
        doc_type="identity",
        rel_path=f"{suffix}/identity.pdf",
        original_filename="identity.pdf",
        status="approved",
        review_notes="Documento già verificato",
    )
    db.add(document)
    term = None
    if membership_type == "annual":
        term = AnnualMembershipTerm(
            member_id=member.id,
            org_id=org.id,
            membership_year=year,
            starts_on=date(year, 1, 1),
            valid_through=annual_membership_valid_through(year),
            status=status,
            card_no=100,
            card_year=year,
            batch_id=batch.id,
        )
        db.add(term)
    db.flush()
    return member, term, batch, document


def _columns(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}


def test_rollover_catches_up_old_years_and_preserves_accounts_and_new_cards(db):
    expired_member, overdue, batch, document = _issued_card(db, year=2026)
    _, older, _, _ = _issued_card(db, year=2024)
    renewed_member, current, _, _ = _issued_card(db, year=2027)
    _, scheduled, _, _ = _issued_card(db, year=2028, status="scheduled")
    _, cancelled, _, _ = _issued_card(db, year=2025, status="cancelled")
    temporary, _, _, _ = _issued_card(db, year=2026, membership_type="temporary")
    db.commit()
    snapshots = [(row, _columns(row)) for row in (expired_member, renewed_member, batch, document, temporary)]
    now = datetime(2027, 1, 2, 0, 0, tzinfo=ROME)

    result = member_maintenance.run_annual_membership_maintenance_job_once(now=now)
    db.expire_all()

    assert result["ok"] is True
    assert result["purged_count"] == 0
    assert {overdue.id, older.id}.issubset(result["term_ids"])
    assert overdue.status == older.status == "expired"
    assert overdue.deactivated_at is not None
    assert current.status == "active"
    assert scheduled.status == "scheduled"
    assert cancelled.status == "cancelled"
    for row, snapshot in snapshots:
        assert _columns(row) == snapshot
    assert expired_member.card_year == 2026  # History is not relabelled as a renewal.
    assert is_member_active(expired_member, now=now) is False
    assert is_member_active(renewed_member, now=now) is True
    assert is_member_active(temporary, now=now) is True
    receipts = db.query(AnnualCardDeactivationRun).all()
    assert any(overdue.id in run.term_ids_json for run in receipts)
    run_count = len(receipts)

    retry = member_maintenance.run_annual_membership_maintenance_job_once(now=now)
    assert retry["ok"] is True
    assert retry["deactivated_count"] == 0
    assert retry["term_ids"] == []
    assert db.query(AnnualCardDeactivationRun).count() == run_count


@pytest.mark.parametrize(
    ("now", "expected"),
    [
        (datetime(2026, 12, 31, 23, 0, tzinfo=timezone.utc), "active"),
        (datetime(2027, 1, 1, 22, 59, 59, 999999, tzinfo=timezone.utc), "active"),
        (datetime(2027, 1, 1, 23, 0, tzinfo=timezone.utc), "expired"),
        (datetime(2027, 1, 1, 23, 0), "expired"),  # Legacy naive timestamps are UTC.
    ],
)
def test_automatic_closing_obeys_rome_calendar_and_grace_day(db, now, expected):
    member, term, _, _ = _issued_card(db, year=2026)
    db.commit()

    result = member_maintenance.run_annual_membership_maintenance_job_once(now=now)
    db.expire_all()

    assert result["ok"] is True
    assert term.status == expected
    assert (term.id in result["term_ids"]) is (expected == "expired")
    assert member.deleted_at is None


def test_closing_rolls_back_every_year_and_retries_after_database_failure(db, monkeypatch):
    _, term, _, _ = _issued_card(db, year=2026)
    _, older, _, _ = _issued_card(db, year=2024)
    db.commit()

    def fail_audit(*args, **kwargs):
        raise RuntimeError("test storage failure")

    with monkeypatch.context() as context:
        context.setattr(member_maintenance.audit, "log_operation", fail_audit)
        result = member_maintenance.run_annual_membership_maintenance_job_once(
            now=datetime(2027, 1, 2, tzinfo=ROME),
        )
    db.expire_all()
    assert result["ok"] is False
    assert term.status == older.status == "active"
    assert term.deactivated_at is older.deactivated_at is None
    assert not any(
        term.id in run.term_ids_json or older.id in run.term_ids_json
        for run in db.query(AnnualCardDeactivationRun).all()
    )

    retry = member_maintenance.run_annual_membership_maintenance_job_once(
        now=datetime(2027, 1, 2, tzinfo=ROME),
    )
    db.expire_all()
    assert retry["ok"] is True
    assert term.status == older.status == "expired"


def test_connection_failure_does_not_stop_the_persistent_worker(monkeypatch):
    def fail_connection():
        raise RuntimeError("test unavailable database")

    monkeypatch.setattr(member_maintenance, "SessionLocal", fail_connection)
    assert member_maintenance.run_annual_membership_maintenance_job_once()["ok"] is False


def test_empty_or_already_closed_year_does_not_create_worker_receipts(db):
    member, term, _, _ = _issued_card(db, year=2023, status="expired")
    db.commit()
    before = db.query(AnnualCardDeactivationRun).count()

    result = member_maintenance.deactivate_expired_annual_memberships(
        db=db, membership_year=2023, now=datetime(2027, 1, 2, tzinfo=ROME),
    )
    db.commit()

    assert result["deactivated_count"] == 0
    assert result["run_id"] is None
    assert db.query(AnnualCardDeactivationRun).count() == before
    assert term.status == "expired"
    assert member.deleted_at is None


def test_annual_explicit_extension_cannot_outlive_calendar_but_temporary_can(db):
    annual, _, _, _ = _issued_card(db, year=2026)
    temporary, _, _, _ = _issued_card(db, year=2026, membership_type="temporary")
    extension = datetime(2027, 2, 10, 12, 0)
    annual.valid_until = temporary.valid_until = extension
    db.commit()
    now = datetime(2027, 1, 2, tzinfo=ROME)

    assert resolve_member_valid_until(annual) == datetime(2027, 1, 1, 23, 59, 59, 999999, tzinfo=ROME)
    assert resolve_member_valid_until(temporary) == extension
    assert is_member_active(annual, now=now) is False
    assert is_member_active(temporary, now=now) is True
    ids = [annual.id, temporary.id]
    active = db.query(Member).filter(Member.id.in_(ids), *member_active_filters(now=now)).all()
    expired = db.query(Member).filter(Member.id.in_(ids), *member_expired_filters(now=now)).all()
    assert [member.id for member in active] == [temporary.id]
    assert [member.id for member in expired] == [annual.id]

    soon = db.query(Member).filter(
        Member.id.in_(ids),
        *member_expiring_filters(now=datetime(2026, 12, 15, 12, tzinfo=ROME)),
    ).all()
    assert [member.id for member in soon] == [annual.id]


@pytest.mark.parametrize(
    "explicit",
    [
        datetime(2026, 12, 28, 12),  # Legacy UTC.
        datetime(2026, 12, 28, 12, tzinfo=timezone.utc),
        datetime(2026, 12, 28, 13, tzinfo=ROME),
    ],
)
def test_earlier_explicit_expiry_remains_authoritative_across_timezones(explicit):
    member = Member(card_year=2026, membership_type="annual", valid_until=explicit)
    assert resolve_member_valid_until(member) is explicit
    assert is_member_membership_expired(member, now=datetime(2026, 12, 28, 12, tzinfo=timezone.utc)) is False
    assert is_member_membership_expired(member, now=datetime(2026, 12, 28, 12, 0, 0, 1, tzinfo=timezone.utc)) is True


def test_wallet_and_public_card_use_same_clamped_annual_expiry(db):
    from app.routes.public import _term_valid_until
    from app.services.google_wallet import _build_generic_object_payload

    member, _, _, _ = _issued_card(db, year=2026)
    member.valid_until = datetime(2027, 2, 10, 12)
    db.commit()
    expected = datetime(2027, 1, 1, 23, 59, 59, 999999, tzinfo=ROME)
    assert _term_valid_until(None, member) == expected
    payload = _build_generic_object_payload(member=member, class_id="test.class", object_id="test.object")
    wallet_expiry = datetime.fromisoformat(payload["validTimeInterval"]["end"]["date"])
    assert wallet_expiry == expected


def test_public_annual_snapshot_expiry_is_rome_aware_and_respects_current_shortening():
    from app.routes.public import _term_valid_until

    member = Member(card_no=100, card_year=2026, membership_type="annual")
    term = AnnualMembershipTerm(membership_year=2026, card_no=100, card_year=2026, valid_through=date(2027, 1, 1))
    expiry = _term_valid_until(term, member)
    assert expiry == datetime(2027, 1, 1, 22, 59, 59, 999999, tzinfo=timezone.utc)
    assert expiry.isoformat() == "2027-01-01T23:59:59.999999+01:00"

    member.valid_until = datetime(2026, 12, 28, 12)  # Legacy stored UTC.
    shortened = _term_valid_until(term, member)
    assert shortened.isoformat() == "2026-12-28T13:00:00+01:00"
    member.valid_until = datetime(2027, 2, 10, 12)
    assert _term_valid_until(term, member) == expiry


@pytest.mark.parametrize(("card_no", "card_year"), [(100, 2027), (101, 2026)])
def test_public_historical_snapshot_ignores_current_member_explicit_expiry(card_no, card_year):
    from app.routes.public import _term_valid_until

    historical = AnnualMembershipTerm(membership_year=2026, card_no=100, card_year=2026, valid_through=date(2027, 1, 1))
    member = Member(
        card_no=card_no,
        card_year=card_year,
        membership_type="annual",
        valid_until=datetime(2026, 12, 28, 12),
    )
    assert _term_valid_until(historical, member).isoformat() == "2027-01-01T23:59:59.999999+01:00"


def test_public_temporary_snapshot_keeps_its_own_expiry():
    from app.models import TemporaryMembershipPurchase
    from app.routes.public import _term_valid_until

    snapshot = TemporaryMembershipPurchase(valid_until=datetime(2027, 2, 10, 12))
    member = Member(card_year=2026, membership_type="annual", valid_until=datetime(2026, 12, 28, 12))
    assert _term_valid_until(snapshot, member).isoformat() == "2027-02-10T13:00:00+01:00"


@pytest.mark.parametrize("now", [
    datetime(2026, 12, 27, 12, tzinfo=ROME),
    datetime(2027, 1, 1, 23, 59, 59, 999999, tzinfo=ROME),
    datetime(2027, 1, 2, 0, 0, tzinfo=ROME),
])
def test_sql_member_filters_match_runtime_for_explicit_and_legacy_expiries(db, now):
    suffix = uuid4().hex
    org = Organization(name="Filter consistency", slug=f"filter-consistency-{suffix}", is_active=True)
    db.add(org)
    db.flush()
    rows = [
        Member(
            org_id=org.id,
            email=f"filter-{suffix}-{index}@example.com",
            status="active",
            membership_type=kind,
            card_no=500 + index,
            card_year=year,
            valid_until=expiry,
        )
        for index, (kind, year, expiry) in enumerate(
            (kind, year, expiry)
            for kind in ("annual", "temporary", None)
            for year in (2026, 2027)
            for expiry in (None, datetime(2026, 12, 28, 12), datetime(2027, 2, 10, 12))
        )
    ]
    db.add_all(rows)
    db.commit()
    expected_active = {row.id for row in rows if is_member_active(row, now=now)}
    expected_expired = {row.id for row in rows if is_member_membership_expired(row, now=now)}
    active = db.query(Member).filter(Member.org_id == org.id, *member_active_filters(now=now)).all()
    expired = db.query(Member).filter(Member.org_id == org.id, *member_expired_filters(now=now)).all()
    assert {row.id for row in active} == expected_active
    assert {row.id for row in expired} == expected_expired
