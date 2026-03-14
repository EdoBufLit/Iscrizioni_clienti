from datetime import datetime
import uuid

import pytest

from app.db import SessionLocal
from app.models import Member, MemberStatus, Organization


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def test_super_admin_member_registry_filters_by_association_and_status(client, db):
    suffix = uuid.uuid4().hex[:8]
    org_a = Organization(name=f"Registry Org A {suffix}", slug=f"registry-org-a-{suffix}", is_active=True)
    org_b = Organization(name=f"Registry Org B {suffix}", slug=f"registry-org-b-{suffix}", is_active=True)
    db.add_all([org_a, org_b])
    db.commit()
    db.refresh(org_a)
    db.refresh(org_b)

    members = [
        Member(
            org_id=org_a.id,
            first_name="Anna",
            last_name="Attiva",
            email=f"anna-{suffix}@example.com",
            fiscal_code="RSSMRA80A01H501U",
            status=MemberStatus.ACTIVE,
            card_no=1010,
            card_year=datetime.utcnow().year,
            joined_at=datetime.utcnow(),
        ),
        Member(
            org_id=org_a.id,
            first_name="Pietro",
            last_name="Pending",
            email=f"pietro-{suffix}@example.com",
            status=MemberStatus.PENDING_DOCS,
            joined_at=datetime.utcnow(),
        ),
        Member(
            org_id=org_a.id,
            first_name="Rita",
            last_name="Rejected",
            email=f"rita-{suffix}@example.com",
            status=MemberStatus.REJECTED,
        ),
        Member(
            org_id=org_b.id,
            first_name="Bruno",
            last_name="Other",
            email=f"bruno-{suffix}@example.com",
            status=MemberStatus.ACTIVE,
            card_no=2020,
            card_year=datetime.utcnow().year,
            joined_at=datetime.utcnow(),
        ),
    ]
    db.add_all(members)
    db.commit()

    login_resp = client.post("/api/super-admin/auth/login", json={"email": "admin@assonam.it", "password": "admin"})
    assert login_resp.status_code == 200, login_resp.text

    registry_res = client.get(f"/api/super-admin/members?org_id={org_a.id}")
    assert registry_res.status_code == 200, registry_res.text
    payload = registry_res.json()

    assert payload["total"] == 3
    returned_ids = {item["id"] for item in payload["items"]}
    assert members[3].id not in returned_ids
    assert payload["kpis"]["total"] == 3
    assert payload["kpis"]["active"] == 1
    assert payload["kpis"]["pending"] == 1
    assert payload["kpis"]["rejected"] == 1

    active_res = client.get(f"/api/super-admin/members?org_id={org_a.id}&status=active")
    assert active_res.status_code == 200, active_res.text
    active_payload = active_res.json()
    assert active_payload["total"] == 1
    assert active_payload["items"][0]["email"] == members[0].email

    search_res = client.get(f"/api/super-admin/members?org_id={org_a.id}&q={members[0].card_no}")
    assert search_res.status_code == 200, search_res.text
    search_payload = search_res.json()
    assert search_payload["total"] == 1
    assert search_payload["items"][0]["id"] == members[0].id
