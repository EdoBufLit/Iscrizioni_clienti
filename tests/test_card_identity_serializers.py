"""Paper references stay recognizable in history and exported member books."""

from datetime import date, datetime
from types import SimpleNamespace

from openpyxl import load_workbook

from app.models import MemberStatus
from app.services.attendance import serialize_attendance
from app.services.member_exports import build_members_workbook, member_export_values


def _member(**overrides):
    values = dict(first_name="Synthetic", last_name="Member", email="synthetic@example.test",
                  fiscal_code=None, phone=None, status=MemberStatus.ACTIVE,
                  card_no=31000, card_year=2027, card_namespace="digital",
                  joined_at=datetime(2026, 11, 12), annual_membership_terms=[])
    return SimpleNamespace(**(values | overrides))


def _attendance(member, *, number=28696, year=2026):
    return SimpleNamespace(id=1, member_id=11, member=member, scanner_station=None,
                           scanner_station_id=None, card_no=number, card_year=year,
                           membership_type="annual", attendance_date=date(2026, 11, 12),
                           checked_in_at=datetime(2026, 11, 12, 20), source="qr")


def test_attendance_keeps_paper_marker_after_the_member_renews_digitally():
    member = _member(annual_membership_terms=[SimpleNamespace(
        card_no=28696, card_year=2026, card_namespace="paper_exception")])
    historical = serialize_attendance(_attendance(member))
    current = serialize_attendance(_attendance(member, number=31000, year=2027))
    assert historical["card_no"] == 28696
    assert historical["card_namespace"] == "paper_exception"
    assert historical["card_number_label"] == "28696*"
    assert current["card_namespace"] == "digital"
    assert current["card_number_label"] == "31000"


def test_attendance_uses_the_matching_historical_card_instead_of_current_namespace():
    member = _member(card_no=28696, card_year=2026, card_namespace="paper_exception",
                     annual_membership_terms=[SimpleNamespace(
                         card_no=28696, card_year=2026, card_namespace="digital")])
    rendered = serialize_attendance(_attendance(member))
    assert rendered["card_namespace"] == "digital"
    assert rendered["card_number_label"] == "28696"


def test_exported_member_book_distinguishes_same_number_in_both_namespaces():
    paper = _member(card_no=28696, card_year=2026, card_namespace="paper_exception")
    digital = _member(card_no=28696, card_year=2026)
    assert member_export_values(paper)[6] == "28696*"
    assert member_export_values(digital)[6] == 28696
    payload = build_members_workbook(organization=SimpleNamespace(name="Synthetic Club"),
                                    members=[paper, digital], generated_at=datetime(2026, 11, 12))
    workbook = load_workbook(payload)
    sheet = workbook["Libro soci"]
    assert sheet["G5"].value == "28696*" and sheet["G5"].data_type == "s"
    assert sheet["G6"].value == 28696 and sheet["G6"].data_type == "n"


def test_paper_numbers_are_excluded_from_legacy_lot_counts_and_scope_migration_candidates():
    from uuid import uuid4

    from app.db import SessionLocal
    from app.models import CardBatch, Member, Organization
    from app.routes.super_admin import _count_linked_members_for_batch
    from app.services.shared_scope_migration import _batch_member_stats, _occupied_numbers_for_org

    with SessionLocal() as db:
        org = Organization(name="Synthetic stock namespace", slug=f"paper-stock-{uuid4().hex}")
        db.add(org)
        db.flush()
        batch = CardBatch(org_id=org.id, year=2026, start_no=87600, end_no=87610, next_no=87602)
        digital = Member(org_id=org.id, card_no=87601, card_year=2026, status=MemberStatus.ACTIVE)
        paper = Member(org_id=org.id, card_no=87600, card_year=2026, status=MemberStatus.ACTIVE,
                       card_namespace="paper_exception")
        db.add_all([batch, digital, paper])
        db.flush()
        assert _count_linked_members_for_batch(db, batch) == 1
        stats = _batch_member_stats(db, batch)
        assert stats["members_in_range_count"] == 1
        assert stats["range_card_numbers"] == [87601]
        assert _occupied_numbers_for_org(db, org_id=org.id, start_no=87600, end_no=87610) == {87601}
