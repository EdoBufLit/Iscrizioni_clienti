from datetime import datetime, timedelta, timezone
import uuid

import pytest

from app.db import SessionLocal
from app.models import AdminRole, AdminUser, Member, MemberDocument, MemberStatus, OrgAdminToken, Organization
from app.services.member_filters import build_org_member_query
from app.utils import hash_token


@pytest.fixture
def tenant(client):
    db = SessionLocal()
    key = uuid.uuid4().hex
    org = Organization(name="Mobile QA", slug=f"mobile-{key}", is_active=True)
    db.add(org)
    db.flush()
    admin = AdminUser(email=f"mobile-{key}@example.com", org_id=org.id, role=AdminRole.ORG_ADMIN, is_active=True)
    db.add(admin)
    db.flush()
    db.add(OrgAdminToken(admin_id=admin.id, token_hash=hash_token(key), expires_at=datetime.utcnow()+timedelta(minutes=10)))
    db.commit()
    assert client.get(f"/api/org-admin/auth/verify?token={key}", follow_redirects=False).status_code in (302, 303)
    yield db, org
    db.close()


def add_member(db, org, **overrides):
    number = 100000 + db.query(Member).filter(Member.org_id == org.id).count()
    values = dict(org_id=org.id, first_name="Socio", status=MemberStatus.ACTIVE, card_no=number,
                  card_year=datetime.utcnow().year, valid_until=datetime.utcnow()+timedelta(days=60))
    values.update(overrides)
    member = Member(**values)
    db.add(member)
    db.flush()
    return member


def test_expiring_list_and_global_metric_exclude_expired_deleted_and_other_tenants(client, tenant):
    db, org = tenant
    due = add_member(db, org, valid_until=datetime.utcnow()+timedelta(days=10))
    add_member(db, org)
    add_member(db, org, status=MemberStatus.EXPIRED, valid_until=datetime.utcnow()-timedelta(days=2))
    add_member(db, org, deleted_at=datetime.utcnow(), valid_until=datetime.utcnow()+timedelta(days=1))
    other = Organization(name="Other", slug=f"other-{uuid.uuid4().hex}", is_active=True)
    db.add(other); db.flush()
    add_member(db, other, valid_until=datetime.utcnow()+timedelta(days=1))
    db.commit()
    result = client.get("/api/org-admin/members?status=expiring").json()
    assert result["total"] == 1
    assert [item["id"] for item in result["items"]] == [due.id]
    assert client.get("/api/org-admin/metrics").json()["expiring_members_count"] == 1


def test_review_counts_members_once_and_bulk_uses_the_same_filter(client, tenant):
    db, org = tenant
    pending = add_member(db, org, status=MemberStatus.PENDING_VERIFICATION, card_no=None)
    docs = add_member(db, org)
    deleted = add_member(db, org, deleted_at=datetime.utcnow())
    rejected = add_member(db, org, status=MemberStatus.REJECTED)
    expired = add_member(db, org, status=MemberStatus.EXPIRED)
    other = Organization(name="Other review", slug=f"review-{uuid.uuid4().hex}", is_active=True)
    db.add(other); db.flush()
    foreign = add_member(db, other, status=MemberStatus.PENDING_VERIFICATION, card_no=None)
    for member in (docs, deleted, rejected, expired, foreign):
        for kind in ("identity", "fiscal_code"):
            db.add(MemberDocument(member_id=member.id, doc_type=kind, status="pending" if kind == "identity" else "uploaded"))
    db.commit()
    result = client.get("/api/org-admin/members?status=review").json()
    assert result["total"] == 2
    assert {item["id"] for item in result["items"]} == {pending.id, docs.id}
    assert client.get("/api/org-admin/metrics").json()["members_to_review_count"] == 2
    run = client.post("/api/org-admin/member-bulk/preview", json={"request_key": uuid.uuid4().hex,
        "action": "export", "selection": {"mode": "filtered", "filters": {"status": "review"}}})
    assert run.status_code == 200, run.text
    assert run.json()["selected_count"] == 2
    assert {item["member_id"] for item in run.json()["items"]} == {pending.id, docs.id}


def test_expiring_legacy_annual_card_uses_actual_rome_expiry(tenant):
    db, org = tenant
    member = add_member(db, org, card_year=2026, valid_until=None)
    db.commit()
    assert build_org_member_query(db, org_id=org.id, status="expiring", now=datetime(2026,12,15)).one().id == member.id
    assert build_org_member_query(db, org_id=org.id, status="expiring", now=datetime(2026,10,28)).count() == 0
    assert build_org_member_query(db, org_id=org.id, status="expiring", now=datetime(2026,12,15,tzinfo=timezone.utc)).one().id == member.id
