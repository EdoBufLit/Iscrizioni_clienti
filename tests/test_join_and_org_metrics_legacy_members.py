from datetime import datetime, timedelta
import uuid

import pytest

from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    Member,
    MemberStatus,
    OrgAdminToken,
    Organization,
)
from app.utils import hash_token
from tests.signup_payloads import build_join_submit_data


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _create_org(db, slug: str) -> Organization:
    org = Organization(
        name=f"Org {slug}",
        slug=slug,
        privacy_version="v1",
        is_active=True,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _login_org_admin(client, db, org_id: int, suffix: str) -> AdminUser:
    admin = AdminUser(
        email=f"org-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org_id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    token_str = f"org-admin-token-{suffix}"
    token = OrgAdminToken(
        admin_id=admin.id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    verify = client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)
    assert verify.status_code == 302
    return admin


def test_join_submit_allows_resubmission_for_legacy_active_but_inactive_member(client, db):
    suffix = uuid.uuid4().hex[:8]
    org = _create_org(db, f"legacy-join-{suffix}")
    email = f"legacy-active-{suffix}@example.com"

    stale_member = Member(
        org_id=org.id,
        first_name="Old",
        last_name="Member",
        email=email,
        phone="3330000000",
        fiscal_code=f"LGA{suffix[:8].upper()}",
        status=MemberStatus.ACTIVE,
        card_no=12345,
        card_year=datetime.utcnow().year - 1,  # lifecycle-inactive (expired)
    )
    db.add(stale_member)
    db.commit()
    db.refresh(stale_member)

    res = client.post(
        f"/api/join/{org.slug}/submit",
        data=build_join_submit_data(
            first_name="Nuovo",
            last_name="Socio",
            email=email,
            phone="3331231234",
            payment_method="CASH",
            accept_statute="false",
            accept_privacy="true",
        ),
    )
    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["id"] == stale_member.id


def test_org_metrics_and_csv_exclude_legacy_expired_and_rejected_members(client, db):
    suffix = uuid.uuid4().hex[:8]
    org = _create_org(db, f"legacy-metrics-{suffix}")
    _login_org_admin(client, db, org.id, suffix)
    current_year = datetime.utcnow().year

    active_member = Member(
        org_id=org.id,
        first_name="Active",
        last_name="Now",
        email=f"active-{suffix}@example.com",
        status=MemberStatus.ACTIVE,
        card_no=20001,
        card_year=current_year,
    )
    pending_member = Member(
        org_id=org.id,
        first_name="Pending",
        last_name="Now",
        email=f"pending-{suffix}@example.com",
        status=MemberStatus.PENDING_DOCS,
    )
    expired_legacy_member = Member(
        org_id=org.id,
        first_name="Expired",
        last_name="Legacy",
        email=f"expired-{suffix}@example.com",
        status=MemberStatus.ACTIVE,
        card_no=20002,
        card_year=current_year - 1,
    )
    rejected_member = Member(
        org_id=org.id,
        first_name="Rejected",
        last_name="Legacy",
        email=f"rejected-{suffix}@example.com",
        status=MemberStatus.REJECTED,
    )
    db.add_all([active_member, pending_member, expired_legacy_member, rejected_member])
    db.commit()

    metrics_res = client.get("/api/org-admin/metrics")
    assert metrics_res.status_code == 200, metrics_res.text
    metrics = metrics_res.json()
    assert metrics["members_count"] == 2
    assert metrics["pending_requests_count"] == 1

    csv_res = client.get("/api/org-admin/members.csv")
    assert csv_res.status_code == 200, csv_res.text
    body = csv_res.text
    assert f"active-{suffix}@example.com" in body
    assert f"pending-{suffix}@example.com" in body
    assert f"expired-{suffix}@example.com" not in body
    assert f"rejected-{suffix}@example.com" not in body
