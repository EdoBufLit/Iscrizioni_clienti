import uuid
from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException

from app.db import SessionLocal
from app.models import (
    AnnualMembershipTerm,
    AnnualMembershipTermStatus,
    CardBatch,
    Member,
    MemberStatus,
    Organization,
)
from app.security import get_password_hash
from app.services.annual_memberships import (
    AnnualDeactivationNotAllowedError,
    AnnualDeactivationPreviewChangedError,
    build_annual_deactivation_preview,
    execute_annual_deactivation,
    sync_annual_membership_term,
)
from app.services.card_verification import build_card_verification_token
from app.services.member_activity import (
    is_member_active,
    member_active_filters,
    member_expired_filters,
)
from app.routes import super_admin as super_admin_routes


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _create_expired_member(db, *, suffix: str) -> tuple[Organization, Member]:
    current_year = datetime.utcnow().year
    expired_year = current_year - 1

    org = Organization(
        name=f"Expired Org {suffix}",
        slug=f"expired-org-{suffix}",
        is_active=True,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    member = Member(
        org_id=org.id,
        first_name="Giulia",
        last_name="Neri",
        email=f"expired.member.{suffix}@example.com",
        phone="+390212345678",
        fiscal_code=f"FSC{suffix.upper()}",
        password_hash=get_password_hash("Pass1234!"),
        status=MemberStatus.ACTIVE,
        card_no=41000,
        card_year=expired_year,
        joined_at=datetime(expired_year, 5, 10),
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return org, member


def test_expired_annual_card_allows_renewal_login_but_qr_stays_inactive(client, db):
    suffix = uuid.uuid4().hex[:8]
    org, member = _create_expired_member(db, suffix=suffix)

    assert is_member_active(member, now=datetime.utcnow()) is False

    login_res = client.post(
        "/api/auth/login",
        data={"email": member.email, "password": "Pass1234!"},
    )
    assert login_res.status_code == 200, login_res.text
    assert login_res.json()["authenticated"] is True

    token = build_card_verification_token(
        member_id=member.id,
        org_id=org.id,
        card_number=member.card_no,
        card_year=member.card_year,
    )

    verify_json_res = client.get(f"/api/cards/verify/{token}?format=json")
    assert verify_json_res.status_code == 200, verify_json_res.text
    verify_json = verify_json_res.json()
    assert verify_json["valid"] is False
    assert verify_json["card"]["status"] == "non_attiva"
    assert verify_json["reason"] == "expired"

    verify_html_res = client.get(
        f"/api/cards/verify/{token}",
        headers={"Accept": "text/html"},
    )
    assert verify_html_res.status_code == 200, verify_html_res.text
    assert "TESSERA NON ATTIVA" in verify_html_res.text
    assert "Motivo: Scaduta" in verify_html_res.text


def test_annual_2026_card_remains_active_for_all_of_new_years_day(db):
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"New Year Org {suffix}",
        slug=f"new-year-org-{suffix}",
        is_active=True,
    )
    db.add(org)
    db.commit()
    member = Member(
        org_id=org.id,
        first_name="Giulia",
        last_name="Neri",
        email=f"new.year.{suffix}@example.com",
        status=MemberStatus.ACTIVE,
        card_no=42000,
        card_year=2026,
        membership_type="annual",
        joined_at=datetime(2026, 6, 1),
    )
    db.add(member)
    db.commit()

    rome = ZoneInfo("Europe/Rome")
    assert is_member_active(
        member,
        now=datetime(2027, 1, 1, 23, 59, 59, 999999, tzinfo=rome),
    ) is True
    assert is_member_active(
        member,
        now=datetime(2027, 1, 2, 0, 0, 0, tzinfo=rome),
    ) is False
    assert (
        db.query(Member)
        .filter(Member.id == member.id, *member_active_filters(
            datetime(2027, 1, 1, 23, 59, 59, tzinfo=rome)
        ))
        .count()
        == 1
    )
    assert (
        db.query(Member)
        .filter(Member.id == member.id, *member_expired_filters(
            datetime(2027, 1, 2, 0, 0, 0, tzinfo=rome)
        ))
        .count()
        == 1
    )


def test_safe_deactivation_preserves_member_pii_card_number_and_stock(db):
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Safe Expiry Org {suffix}",
        slug=f"safe-expiry-org-{suffix}",
        is_active=True,
        membership_fee_currency="EUR",
    )
    db.add(org)
    db.commit()

    batch = CardBatch(
        org_id=org.id,
        year=2026,
        start_no=52000,
        end_no=52020,
        next_no=52021,
    )
    db.add(batch)
    member = Member(
        org_id=org.id,
        first_name="Maria",
        last_name="Verdi",
        email=f"safe.expiry.{suffix}@example.com",
        phone="+390212345678",
        fiscal_code=f"SAFE{suffix.upper()}",
        password_hash=get_password_hash("Pass1234!"),
        status=MemberStatus.ACTIVE,
        card_no=52000,
        card_year=2026,
        batch_id=None,
        membership_type="annual",
        joined_at=datetime(2026, 5, 10),
        external_customer_id=f"external:{suffix}",
    )
    db.add(member)
    db.commit()
    member.batch_id = batch.id
    sync_annual_membership_term(
        db,
        member,
        source="test",
        now=datetime(2027, 1, 1, 12, 0, tzinfo=ZoneInfo("Europe/Rome")),
    )
    db.commit()

    preview_on_january_first = build_annual_deactivation_preview(
        db,
        membership_year=2026,
        now=datetime(2027, 1, 1, 23, 59, 59, tzinfo=ZoneInfo("Europe/Rome")),
    )
    assert preview_on_january_first["can_execute"] is False
    assert preview_on_january_first["total_count"] >= 1
    with pytest.raises(AnnualDeactivationNotAllowedError):
        execute_annual_deactivation(
            db,
            membership_year=2026,
            preview_hash=preview_on_january_first["preview_hash"],
            actor_admin_id=None,
            now=datetime(2027, 1, 1, 23, 59, 59, tzinfo=ZoneInfo("Europe/Rome")),
        )

    preview = build_annual_deactivation_preview(
        db,
        membership_year=2026,
        now=datetime(2027, 1, 2, 0, 0, tzinfo=ZoneInfo("Europe/Rome")),
    )
    result = execute_annual_deactivation(
        db,
        membership_year=2026,
        preview_hash=preview["preview_hash"],
        actor_admin_id=None,
        now=datetime(2027, 1, 2, 0, 0, tzinfo=ZoneInfo("Europe/Rome")),
    )
    db.commit()

    term = db.query(AnnualMembershipTerm).filter_by(member_id=member.id).one()
    db.refresh(member)
    db.refresh(batch)
    assert result["deactivated_count"] >= 1
    assert term.status == AnnualMembershipTermStatus.EXPIRED.value
    assert term.valid_through.isoformat() == "2027-01-01"
    assert term.deactivated_at is not None
    assert member.deleted_at is None
    assert member.purged_at is None
    assert member.status == MemberStatus.ACTIVE
    assert member.email == f"safe.expiry.{suffix}@example.com"
    assert member.phone == "+390212345678"
    assert member.fiscal_code == f"SAFE{suffix.upper()}"
    assert member.password_hash is not None
    assert member.card_no == 52000
    assert member.card_year == 2026
    assert member.batch_id == batch.id
    assert member.external_customer_id == f"external:{suffix}"
    assert batch.next_no == 52021

    repeated = execute_annual_deactivation(
        db,
        membership_year=2026,
        preview_hash=preview["preview_hash"],
        actor_admin_id=None,
        now=datetime(2027, 1, 2, 1, 0, tzinfo=ZoneInfo("Europe/Rome")),
    )
    assert repeated["already_executed"] is True
    assert repeated["run_id"] == result["run_id"]


def test_preview_hash_rejects_changed_annual_card_set(db):
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Preview Org {suffix}",
        slug=f"preview-org-{suffix}",
        is_active=True,
    )
    db.add(org)
    db.commit()
    first = Member(
        org_id=org.id,
        first_name="First",
        last_name="Member",
        email=f"first.{suffix}@example.com",
        status=MemberStatus.ACTIVE,
        card_no=61001,
        card_year=2026,
        membership_type="annual",
    )
    db.add(first)
    db.commit()
    sync_annual_membership_term(db, first, source="test")
    db.commit()
    preview = build_annual_deactivation_preview(db, membership_year=2026)

    second = Member(
        org_id=org.id,
        first_name="Second",
        last_name="Member",
        email=f"second.{suffix}@example.com",
        status=MemberStatus.ACTIVE,
        card_no=61002,
        card_year=2026,
        membership_type="annual",
    )
    db.add(second)
    db.commit()
    sync_annual_membership_term(db, second, source="test")
    db.commit()

    with pytest.raises(AnnualDeactivationPreviewChangedError):
        execute_annual_deactivation(
            db,
            membership_year=2026,
            preview_hash=preview["preview_hash"],
            actor_admin_id=None,
            now=datetime(2027, 1, 2, tzinfo=ZoneInfo("Europe/Rome")),
        )


def test_temporary_cards_are_excluded_from_annual_history(db):
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Temporary Org {suffix}",
        slug=f"temporary-org-{suffix}",
        is_active=True,
    )
    db.add(org)
    db.commit()
    member = Member(
        org_id=org.id,
        first_name="Temporary",
        last_name="Member",
        email=f"temporary.{suffix}@example.com",
        status=MemberStatus.ACTIVE,
        card_no=62001,
        card_year=2026,
        membership_type="temporary",
        valid_until=datetime(2026, 7, 20, 12, 0),
    )
    db.add(member)
    db.commit()

    assert sync_annual_membership_term(db, member, source="test") is None
    assert (
        db.query(AnnualMembershipTerm)
        .filter(AnnualMembershipTerm.member_id == member.id)
        .count()
        == 0
    )


def test_legacy_destructive_endpoint_is_gone_and_preview_is_read_only(client, db):
    client.post("/api/super-admin/auth/logout")
    login = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )
    assert login.status_code == 200, login.text

    before = db.query(AnnualMembershipTerm).filter_by(membership_year=2026).count()
    preview = client.post(
        "/api/super-admin/annual-cards/deactivation/preview",
        json={"membership_year": 2026},
    )
    assert preview.status_code == 200, preview.text
    payload = preview.json()
    assert payload["valid_through"] == "2027-01-01"
    assert "term_ids" not in payload
    assert db.query(AnnualMembershipTerm).filter_by(membership_year=2026).count() == before

    legacy = client.post(
        "/api/super-admin/maintenance/run",
        json={"purge_pii": True},
    )
    assert legacy.status_code == 410, legacy.text
    assert db.query(AnnualMembershipTerm).filter_by(membership_year=2026).count() == before


def test_annual_deactivation_requires_exact_server_side_confirmation(db, monkeypatch):
    membership_year = datetime.utcnow().year - 2
    preview = build_annual_deactivation_preview(db, membership_year=membership_year)
    monkeypatch.setattr(
        super_admin_routes,
        "require_recent_step_up",
        lambda request, session: SimpleNamespace(admin=SimpleNamespace(id=None)),
    )
    body = super_admin_routes.AnnualCardDeactivationExecuteBody(
        membership_year=membership_year,
        preview_hash=preview["preview_hash"],
        confirmation=f"DISATTIVA {membership_year} ",
    )

    with pytest.raises(HTTPException) as error:
        super_admin_routes.run_annual_card_deactivation(None, body, db)

    assert error.value.status_code == 409
    assert f"DISATTIVA {membership_year}" in str(error.value.detail)
