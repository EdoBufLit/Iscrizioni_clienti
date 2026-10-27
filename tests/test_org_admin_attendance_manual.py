from __future__ import annotations

from datetime import date, datetime, timedelta
import uuid

import pytest

from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    AnnualMembershipTerm,
    Member,
    MemberAttendance,
    MemberStatus,
    OperationLog,
    Organization,
    TemporaryMembershipPurchase,
)
from app.services import attendance, attendance_manual
from app.services.card_verification import build_card_verification_token
from app.services.org_admin_sessions import create_org_admin_persistent_session


BASE = "/api/org-admin/attendances"


@pytest.fixture
def context(client):
    client.cookies.clear()
    db = SessionLocal()
    suffix = uuid.uuid4().hex
    org = Organization(name=f"Manual {suffix}", slug=f"manual-{suffix}", is_active=True)
    db.add(org)
    db.flush()
    admin = AdminUser(
        email=f"manual-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.flush()
    _, raw_token = create_org_admin_persistent_session(db, admin)
    db.commit()
    client.cookies.set("org_admin_session", raw_token)
    yield db, org, admin
    client.cookies.clear()
    db.close()


def _member(db, org, **overrides):
    now = datetime.utcnow()
    suffix = uuid.uuid4().hex
    values = dict(
        org_id=org.id,
        first_name="Anna Maria",
        last_name="De Rossi",
        email=f"manual-{suffix}@example.com",
        status=MemberStatus.ACTIVE,
        membership_type="temporary",
        card_no=int(suffix[:7], 16),
        card_year=now.year,
        valid_from=now - timedelta(hours=1),
        valid_until=now + timedelta(hours=12),
        joined_at=now - timedelta(hours=1),
    )
    values.update(overrides)
    member = Member(**values)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def _qr(member):
    return build_card_verification_token(
        member_id=member.id,
        org_id=member.org_id,
        card_number=member.card_no,
        card_year=member.card_year,
    )


def _check_in(client, member, source="manual"):
    if source == "qr":
        return client.post(f"{BASE}/check-in", json={"qr_value": _qr(member)})
    return client.post(f"{BASE}/manual-check-in", json={"member_id": member.id})


def _search(client, q):
    return client.get(f"{BASE}/members", params={"q": q})


def _annual_term(db, member, **overrides):
    year = member.card_year
    values = dict(
        member_id=member.id,
        org_id=member.org_id,
        membership_year=year,
        card_no=member.card_no,
        card_year=year,
        starts_on=date(year, 1, 1),
        valid_through=date(year + 1, 1, 1),
        status="active",
    )
    values.update(overrides)
    term = AnnualMembershipTerm(**values)
    db.add(term)
    db.commit()
    return term


def test_search_is_tenant_scoped_excludes_deleted_and_has_minimal_fields(client, context):
    db, org, _ = context
    member = _member(db, org)
    other = Organization(name="Other manual", slug=f"other-manual-{uuid.uuid4().hex}")
    db.add(other)
    db.commit()
    foreign = _member(db, other)
    deleted = _member(db, org, deleted_at=datetime.utcnow())

    for q in ["  Rossi   Anna  ", member.email, str(member.card_no)]:
        response = _search(client, q)
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["total"] == 1
        assert payload["items"] == [{
            "id": member.id,
            "name": "Anna Maria De Rossi",
            "email": member.email,
            "card_no": member.card_no,
            "card_year": member.card_year,
            "membership_type": "temporary",
            "is_active": True,
            "already_checked_in": False,
        }]

    for unavailable in [foreign, deleted]:
        response = _check_in(client, unavailable)
        assert response.status_code == 404, response.text
        assert db.query(MemberAttendance).filter_by(member_id=unavailable.id).count() == 0


def test_search_is_bounded_and_escapes_sql_wildcards(client, context):
    db, org, _ = context
    for index in range(24):
        _member(db, org, first_name="Ricerca", last_name=f"Limitata {index:02}")
    response = _search(client, "Ricerca Limitata")
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 24
    assert len(response.json()["items"]) == 20
    assert _search(client, "%%").json() == {"items": [], "total": 0}
    assert _search(client, "__").json() == {"items": [], "total": 0}


@pytest.mark.parametrize("q", ["", "a", "  ", " a ", "a" * 121])
def test_search_rejects_short_blank_and_oversized_queries(client, context, q):
    assert _search(client, q).status_code == 422


@pytest.mark.parametrize("member_id", [0, -1, True, "1", 1.5])
def test_manual_check_in_requires_positive_integer(client, context, member_id):
    assert client.post(f"{BASE}/manual-check-in", json={"member_id": member_id}).status_code == 422


@pytest.mark.parametrize("restriction", ["anonymous", "wrong_role", "inactive", "deleted"])
def test_search_and_manual_check_in_require_current_org_admin(client, context, restriction):
    db, org, admin = context
    member = _member(db, org)
    if restriction == "anonymous":
        client.cookies.clear()
    elif restriction == "wrong_role":
        admin.role = AdminRole.SUPER_ADMIN
    elif restriction == "inactive":
        admin.is_active = False
    else:
        admin.deleted_at = datetime.utcnow()
    db.commit()
    assert _search(client, "Anna").status_code == 401
    assert _check_in(client, member).status_code == 401


@pytest.mark.parametrize("first_source", ["manual", "qr"])
def test_manual_and_qr_share_daily_deduplication_and_single_audit(client, context, first_source):
    db, org, admin = context
    member = _member(db, org)
    first = _check_in(client, member, source=first_source)
    assert first.status_code == 200, first.text
    assert first.json()["created"] is True
    assert first.json()["item"]["source"] == first_source

    second_source = "qr" if first_source == "manual" else "manual"
    for source in [second_source, "manual"]:
        duplicate = _check_in(client, member, source=source)
        assert duplicate.status_code == 200, duplicate.text
        assert duplicate.json()["created"] is False
        assert duplicate.json()["item"]["id"] == first.json()["item"]["id"]
    assert db.query(MemberAttendance).filter_by(member_id=member.id).count() == 1
    stored = db.query(MemberAttendance).filter_by(member_id=member.id).one()
    assert stored.checked_in_by_admin_id == admin.id
    assert stored.scanner_station_id is None
    logs = db.query(OperationLog).filter_by(
        action="member.attendance_check_in", entity_id=member.id, org_id=org.id,
    ).all()
    assert len(logs) == 1
    assert logs[0].actor_admin_id == admin.id
    assert logs[0].metadata_json["source"] == first_source
    assert _search(client, member.email).json()["items"][0]["already_checked_in"] is True


@pytest.mark.parametrize("reason", ["expired", "pending", "no_card", "old_year"])
def test_manual_check_in_rejects_inactive_members(client, context, reason):
    db, org, _ = context
    changes = {
        "expired": {"valid_until": datetime.utcnow() - timedelta(seconds=1)},
        "pending": {"status": MemberStatus.PENDING_DOCS},
        "no_card": {"card_no": None},
        "old_year": {"membership_type": "annual", "valid_until": None, "card_year": datetime.utcnow().year - 2},
    }[reason]
    member = _member(db, org, **changes)
    assert _search(client, member.email).json()["items"][0]["is_active"] is False
    response = _check_in(client, member)
    assert response.status_code == 409, response.text
    assert response.json()["detail"] == "Tessera non attiva"
    assert db.query(MemberAttendance).filter_by(member_id=member.id).count() == 0


@pytest.mark.parametrize("term_state", ["active", "expired", "cancelled", "future", "elapsed"])
def test_manual_check_in_respects_current_annual_term(client, context, term_state):
    db, org, _ = context
    member = _member(db, org, membership_type="annual", valid_until=None)
    overrides = {}
    if term_state in {"expired", "cancelled"}:
        overrides["status"] = term_state
    elif term_state == "future":
        overrides = {"status": "scheduled", "starts_on": datetime.utcnow().date() + timedelta(days=2)}
    elif term_state == "elapsed":
        overrides["valid_through"] = datetime.utcnow().date() - timedelta(days=2)
    _annual_term(db, member, **overrides)
    if term_state == "active":
        # A renewed identity must use the current issued card, not an old term.
        _annual_term(
            db, member, membership_year=member.card_year - 1,
            card_year=member.card_year - 1, card_no=member.card_no + 1,
            starts_on=date(member.card_year - 1, 1, 1),
            valid_through=date(member.card_year, 1, 1), status="expired",
        )
    assert _search(client, member.email).json()["items"][0]["is_active"] is (term_state == "active")
    response = _check_in(client, member)
    assert response.status_code == (200 if term_state == "active" else 409), response.text
    if term_state == "active":
        assert response.json()["item"]["card_no"] == member.card_no
        assert response.json()["item"]["card_year"] == member.card_year
        assert response.json()["item"]["membership_type"] == "annual"


@pytest.mark.parametrize("purchase_status", ["active", "expired", "payment_pending", "elapsed"])
def test_manual_check_in_respects_temporary_purchase_ledger(client, context, purchase_status):
    db, org, _ = context
    member = _member(db, org)
    db.add(TemporaryMembershipPurchase(
        member_id=member.id, org_id=org.id,
        status="active" if purchase_status == "elapsed" else purchase_status,
        method="cash", card_no=member.card_no, card_year=member.card_year,
        valid_from=member.valid_from,
        valid_until=(datetime.utcnow() - timedelta(seconds=1))
        if purchase_status == "elapsed" else member.valid_until,
    ))
    db.commit()
    assert _search(client, member.email).json()["items"][0]["is_active"] is (purchase_status == "active")
    response = _check_in(client, member)
    assert response.status_code == (200 if purchase_status == "active" else 409), response.text
    if purchase_status == "active":
        assert response.json()["item"]["membership_type"] == "temporary"


def test_manual_rechecks_membership_after_search(client, context):
    db, org, _ = context
    member = _member(db, org)
    assert _search(client, member.email).json()["items"][0]["is_active"] is True
    member.status = MemberStatus.EXPIRED
    db.commit()
    assert _check_in(client, member).status_code == 409
    assert db.query(MemberAttendance).filter_by(member_id=member.id).count() == 0


def test_manual_check_in_honors_inclusive_annual_expiry_in_rome(client, context, monkeypatch):
    db, org, _ = context

    class FrozenDateTime(datetime):
        value = datetime(2027, 1, 1, 22, 30)  # January 1, 23:30 in Rome.

        @classmethod
        def utcnow(cls):
            return cls.value

    monkeypatch.setattr(attendance, "datetime", FrozenDateTime)
    monkeypatch.setattr(attendance_manual, "datetime", FrozenDateTime)
    member = _member(db, org, membership_type="annual", card_year=2026, valid_until=None)
    _annual_term(db, member)
    assert _search(client, member.email).json()["items"][0]["is_active"] is True
    first = _check_in(client, member)
    assert first.status_code == 200, first.text
    assert first.json()["item"]["attendance_date"] == "2027-01-01"
    FrozenDateTime.value = datetime(2027, 1, 1, 23, 30)  # January 2 in Rome.
    assert _search(client, member.email).json()["items"][0]["is_active"] is False
    assert _check_in(client, member).status_code == 409


def test_manual_and_qr_use_rome_day_for_deduplication_and_search(client, context, monkeypatch):
    db, org, _ = context

    class FrozenDateTime(datetime):
        value = datetime(2026, 10, 26, 23, 30)  # Already October 27 in Rome.

        @classmethod
        def utcnow(cls):
            return cls.value

    monkeypatch.setattr(attendance, "datetime", FrozenDateTime)
    monkeypatch.setattr(attendance_manual, "datetime", FrozenDateTime)
    member = _member(
        db, org, card_year=2026,
        valid_from=datetime(2026, 10, 26), valid_until=datetime(2026, 10, 30),
    )
    first = _check_in(client, member)
    assert first.status_code == 200, first.text
    assert first.json()["item"]["attendance_date"] == "2026-10-27"
    FrozenDateTime.value = datetime(2026, 10, 27, 1, 30)
    same_day = _check_in(client, member, source="qr")
    assert same_day.status_code == 200, same_day.text
    assert same_day.json()["created"] is False
    assert _search(client, member.email).json()["items"][0]["already_checked_in"] is True
    FrozenDateTime.value = datetime(2026, 10, 27, 23, 30)
    assert _search(client, member.email).json()["items"][0]["already_checked_in"] is False
    next_day = _check_in(client, member, source="qr")
    assert next_day.status_code == 200, next_day.text
    assert next_day.json()["created"] is True
    assert next_day.json()["item"]["attendance_date"] == "2026-10-28"
    assert db.query(MemberAttendance).filter_by(member_id=member.id).count() == 2
