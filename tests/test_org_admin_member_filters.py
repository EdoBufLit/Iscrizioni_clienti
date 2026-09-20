import pytest
from datetime import datetime, timedelta

from app.db import SessionLocal
from app.models import (
    Organization,
    AdminUser,
    AdminRole,
    Member,
    MemberStatus,
    MemberDocument,
    DocStatus,
    OrgAdminToken,
    MemberPayment,
    SignupSource,
)
from app.security import get_password_hash
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_org_admin(client, db, admin_id: int):
    token_str = f"filtertoken-{admin_id}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)


def _cleanup_member(db, email: str):
    member = db.query(Member).filter_by(email=email).first()
    if member:
        db.query(MemberDocument).filter_by(member_id=member.id).delete()
        db.query(MemberPayment).filter_by(member_id=member.id).delete()
        db.delete(member)
        db.commit()


def test_org_admin_member_filters(client, db):
    org = db.query(Organization).filter_by(slug="filter-org").first()
    if not org:
        org = Organization(name="Filter Org", slug="filter-org", is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    other_org = db.query(Organization).filter_by(slug="filter-org-b").first()
    if not other_org:
        other_org = Organization(name="Filter Org B", slug="filter-org-b", is_active=True)
        db.add(other_org)
        db.commit()
        db.refresh(other_org)

    admin = db.query(AdminUser).filter_by(email="filter_admin@example.com").first()
    if not admin:
        admin = AdminUser(email="filter_admin@example.com", role=AdminRole.ORG_ADMIN, org_id=org.id, is_active=True)
        db.add(admin)
        db.commit()
        db.refresh(admin)

    _cleanup_member(db, "m1@example.com")
    _cleanup_member(db, "m2@example.com")
    _cleanup_member(db, "m3@example.com")
    _cleanup_member(db, "other@example.com")

    m1 = Member(
        org_id=org.id,
        first_name="Anna",
        last_name="Bianchi",
        email="m1@example.com",
        fiscal_code="AAAABBBB11",
        password_hash=get_password_hash("Pass1234!"),
        status=MemberStatus.ACTIVE,
        is_manual=True,
        signup_source=SignupSource.ADMIN.value,
        joined_at=datetime.utcnow(),
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    m2 = Member(
        org_id=org.id,
        first_name="Luca",
        last_name="Verdi",
        email="m2@example.com",
        fiscal_code="CCCCDDDD22",
        status=MemberStatus.PENDING_DOCS,
        is_manual=False,
        signup_source=SignupSource.PIENISSIMO.value,
        joined_at=datetime.utcnow(),
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    m3 = Member(
        org_id=org.id,
        first_name="Marco",
        last_name="Rossi",
        email="m3@example.com",
        fiscal_code="EEEFFFF33",
        status=MemberStatus.REJECTED,
        is_manual=False,
        signup_source=SignupSource.ASSONAM_FORM.value,
        joined_at=datetime.utcnow(),
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    other_member = Member(
        org_id=other_org.id,
        first_name="Other",
        last_name="Org",
        email="other@example.com",
        status=MemberStatus.ACTIVE,
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    db.add_all([m1, m2, m3, other_member])
    db.commit()
    db.refresh(m1)
    db.refresh(m2)
    db.refresh(m3)

    db.add_all(
        [
            MemberDocument(
                member_id=m1.id,
                doc_type="identity",
                rel_path="path/a.pdf",
                original_filename="a.pdf",
                mime_type="application/pdf",
                size_bytes=100,
                sha256="a",
                status=DocStatus.APPROVED.value,
            ),
            MemberDocument(
                member_id=m2.id,
                doc_type="identity",
                rel_path="path/b.pdf",
                original_filename="b.pdf",
                mime_type="application/pdf",
                size_bytes=100,
                sha256="b",
                status=DocStatus.PENDING.value,
            ),
        ]
    )
    db.commit()

    _login_org_admin(client, db, admin.id)

    resp = client.get("/api/org-admin/members?q=AAAABBBB11")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["email"] == "m1@example.com"

    resp = client.get("/api/org-admin/members?access=with")
    assert resp.status_code == 200
    emails = [i["email"] for i in resp.json()["items"]]
    assert "m1@example.com" in emails
    assert "m2@example.com" not in emails

    resp = client.get("/api/org-admin/members?source=manual")
    assert resp.status_code == 200
    emails = [i["email"] for i in resp.json()["items"]]
    assert "m1@example.com" in emails
    assert "m2@example.com" not in emails

    resp = client.get("/api/org-admin/members?docs=pending")
    assert resp.status_code == 200
    emails = [i["email"] for i in resp.json()["items"]]
    assert "m2@example.com" in emails
    assert "m1@example.com" not in emails

    resp = client.get("/api/org-admin/members?docs=approved")
    assert resp.status_code == 200
    emails = [i["email"] for i in resp.json()["items"]]
    assert "m1@example.com" in emails
    assert "m2@example.com" not in emails

    resp = client.get("/api/org-admin/members?status=suspended")
    assert resp.status_code == 200
    suspended_items = resp.json()["items"]
    emails = [i["email"] for i in suspended_items]
    assert "m3@example.com" in emails
    suspended_by_email = {i["email"]: i for i in suspended_items}
    assert suspended_by_email["m3@example.com"]["signup_source"] == SignupSource.ASSONAM_FORM.value

    resp = client.get("/api/org-admin/members")
    assert resp.status_code == 200
    items = resp.json()["items"]
    emails = [i["email"] for i in items]
    assert "other@example.com" not in emails
    by_email = {i["email"]: i for i in items}
    assert by_email["m1@example.com"]["signup_source"] == SignupSource.ADMIN.value
    assert by_email["m2@example.com"]["signup_source"] == SignupSource.PIENISSIMO.value


@pytest.fixture
def searchable_members(client, db):
    suffix = datetime.utcnow().strftime("%H%M%S%f")
    org = Organization(name="Search Org", slug=f"search-org-{suffix}", is_active=True)
    other_org = Organization(name="Other Search Org", slug=f"search-other-{suffix}", is_active=True)
    db.add_all([org, other_org])
    db.flush()
    admin = AdminUser(
        email=f"search-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    members = {}
    now = datetime.utcnow()
    for index, key in enumerate(["active", "expired", "deleted", "pending", "other", "partial"]):
        member = Member(
            org_id=other_org.id if key == "other" else org.id,
            first_name="Maria Anna",
            last_name="Bianchi" if key == "partial" else "De Rossi",
            email=f"search-{key}-{suffix}@example.com",
            fiscal_code=f"SEARCHCF{index}",
            status=MemberStatus.PENDING_DOCS if key == "pending" else MemberStatus.ACTIVE,
            card_no=54123 + index if key != "pending" else None,
            card_year=now.year - 1 if key == "expired" else now.year,
            valid_until=now - timedelta(days=1) if key == "expired" else None,
            joined_at=now + timedelta(seconds=index),
            deleted_at=now if key == "deleted" else None,
        )
        members[key] = member
        db.add(member)
    db.commit()
    _login_org_admin(client, db, admin.id)
    return members


def test_org_admin_member_search_normalizes_full_names_and_email(client, searchable_members):
    member = searchable_members["active"]
    for query in [
        "Maria Anna De Rossi",
        "De Rossi Maria Anna",
        "  maria\tanna   de rossi  ",
        "anna de ros",
        f"  {member.email.upper()}\t",
        member.fiscal_code,
        str(member.card_no),
    ]:
        response = client.get("/api/org-admin/members", params={"q": query, "status": "active"})
        assert response.status_code == 200, response.text
        assert [item["id"] for item in response.json()["items"]] == [member.id], query

    no_match = client.get(
        "/api/org-admin/members", params={"q": "Maria Zeta", "status": "active"}
    )
    assert no_match.status_code == 200, no_match.text
    assert no_match.json()["total"] == 0

    whitespace = client.get(
        "/api/org-admin/members", params={"q": " \t\n ", "status": "active"}
    )
    assert whitespace.status_code == 200, whitespace.text
    assert {item["id"] for item in whitespace.json()["items"]} == {
        member.id, searchable_members["partial"].id
    }


def test_org_admin_full_name_search_preserves_status_scope_and_pagination(client, searchable_members):
    for status, expected_keys in [
        ("active", ["active"]),
        ("expired", ["expired"]),
        ("pending", ["pending"]),
        ("all", ["active", "expired", "deleted", "pending"]),
    ]:
        response = client.get(
            "/api/org-admin/members", params={"q": "Maria Anna De Rossi", "status": status}
        )
        assert response.status_code == 200, response.text
        assert {item["id"] for item in response.json()["items"]} == {
            searchable_members[key].id for key in expected_keys
        }, status

    page = client.get(
        "/api/org-admin/members",
        params={
            "q": "Maria Anna De Rossi",
            "status": "all",
            "order": "joined_at_asc",
            "limit": 1,
            "offset": 1,
        },
    )
    assert page.status_code == 200, page.text
    assert page.json()["total"] == 4
    assert [item["id"] for item in page.json()["items"]] == [searchable_members["expired"].id]


def test_org_admin_members_summary_uses_snapshot_and_expired_temporary_cards(client, db):
    suffix = datetime.utcnow().strftime("%H%M%S%f")
    org = Organization(
        name="Summary Org",
        slug=f"summary-org-{suffix}",
        is_active=True,
        membership_fee_amount=99,
        temporary_membership_fee_amount=15,
        custom_membership_types_enabled=True,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    admin = AdminUser(
        email=f"summary-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    current_year = datetime.utcnow().year
    active_member = Member(
        org_id=org.id,
        first_name="Anna",
        last_name="Annuale",
        email="summary-active@example.com",
        status=MemberStatus.ACTIVE,
        card_no=12001,
        card_year=current_year,
        joined_at=datetime.utcnow(),
        membership_type="annual",
        membership_fee_snapshot=30,
    )
    expired_temporary = Member(
        org_id=org.id,
        first_name="Tina",
        last_name="Temporary",
        email="summary-temp@example.com",
        status=MemberStatus.ACTIVE,
        card_no=12002,
        card_year=current_year,
        joined_at=datetime.utcnow(),
        membership_type="temporary",
        membership_fee_snapshot=10,
        valid_from=datetime.utcnow() - timedelta(days=2),
        valid_until=datetime.utcnow() - timedelta(hours=2),
    )
    pending_without_card = Member(
        org_id=org.id,
        first_name="Paolo",
        last_name="Pending",
        email="summary-pending@example.com",
        status=MemberStatus.PENDING_DOCS,
        joined_at=datetime.utcnow(),
        membership_type="annual",
        membership_fee_snapshot=200,
    )
    missing_snapshot = Member(
        org_id=org.id,
        first_name="Nina",
        last_name="NoSnapshot",
        email="summary-nosnapshot@example.com",
        status=MemberStatus.ACTIVE,
        card_no=12003,
        card_year=current_year,
        joined_at=datetime.utcnow(),
        membership_type="annual",
        membership_fee_snapshot=None,
    )
    db.add_all([active_member, expired_temporary, pending_without_card, missing_snapshot])
    db.commit()

    _login_org_admin(client, db, admin.id)

    members_res = client.get("/api/org-admin/members")
    assert members_res.status_code == 200, members_res.text
    payload = members_res.json()
    assert payload["summary"]["total_theoretical_membership_fees"] == 213.0
    assert payload["summary"]["issued_members_count"] == 3

    patch_res = client.patch(
        "/api/org-admin/organization/membership-settings",
        json={
            "membership_fee_amount": 3,
            "temporary_membership_fee_amount": 2,
            "temporary_membership_duration_value": 1,
            "temporary_membership_duration_unit": "days",
        },
    )
    assert patch_res.status_code == 200, patch_res.text

    updated_res = client.get("/api/org-admin/members")
    assert updated_res.status_code == 200, updated_res.text
    assert updated_res.json()["summary"]["total_theoretical_membership_fees"] == 8.0

    expired_res = client.get("/api/org-admin/members?status=expired")
    assert expired_res.status_code == 200, expired_res.text
    expired_items = expired_res.json()["items"]
    assert any(item["email"] == "summary-temp@example.com" for item in expired_items)
