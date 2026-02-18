import uuid
from datetime import datetime

import pytest
from sqlalchemy import func

from app.db import SessionLocal
from app.models import AdminRole, AdminUser, CardBatch, Member, MemberStatus, OperationLog, Organization


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


def _create_org(db, slug_prefix: str, *, active: bool) -> Organization:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"{slug_prefix} {suffix}",
        slug=f"{slug_prefix}-{suffix}",
        privacy_version="v1",
        is_active=active,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _set_card_range(client, org_id: int, start_no: int, end_no: int):
    response = client.post(
        f"/api/super-admin/organizations/{org_id}/card-range",
        json={"from_no": start_no, "to_no": end_no},
    )
    assert response.status_code == 200, response.text


def _next_free_range(db, *, size: int = 300) -> tuple[int, int]:
    max_end = db.query(func.max(CardBatch.end_no)).filter(CardBatch.released_at.is_(None)).scalar()
    base = int(max_end) if max_end is not None else 20000
    start_no = base + 100
    end_no = start_no + size - 1
    return start_no, end_no


def test_archive_association_releases_range_and_range_is_reusable(client, db):
    _login_super_admin(client)

    org = _create_org(db, "archive-org", active=False)
    start_no, end_no = _next_free_range(db)
    _set_card_range(client, org.id, start_no, end_no)

    archive_response = client.delete(
        f"/api/admin/associations/{org.id}?mode=archive&release_range=true"
    )
    assert archive_response.status_code == 200, archive_response.text
    payload = archive_response.json()
    assert payload["ok"] is True
    assert payload["mode"] == "archive"
    assert payload["releasedRange"] == {"start": start_no, "end": end_no}
    assert payload["archivedAssociationId"] == org.id
    assert payload["purgedAssociationId"] is None

    db.refresh(org)
    assert org.is_active is False
    assert org.deleted_at is not None

    released_batches = db.query(CardBatch).filter(
        CardBatch.org_id == org.id,
        CardBatch.released_at.is_not(None),
    ).count()
    assert released_batches == 1

    other_org = _create_org(db, "archive-target", active=True)
    reuse_response = client.post(
        f"/api/super-admin/organizations/{other_org.id}/card-range",
        json={"from_no": start_no, "to_no": end_no},
    )
    assert reuse_response.status_code == 200, reuse_response.text


def test_delete_association_requires_super_admin(client, db):
    org = _create_org(db, "secure-delete-org", active=False)
    client.post("/api/super-admin/auth/logout")

    response = client.delete(f"/api/admin/associations/{org.id}?mode=archive&release_range=true")
    assert response.status_code in (401, 403), response.text


def test_purge_requires_force_and_cleans_fk_dependencies(client, db):
    _login_super_admin(client)

    org = _create_org(db, "purge-org", active=False)
    org_id = org.id
    start_no, end_no = _next_free_range(db)
    _set_card_range(client, org_id, start_no, end_no)

    org_admin = AdminUser(
        email=f"purge-admin-{uuid.uuid4().hex[:6]}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org_id,
        is_active=True,
    )
    db.add(org_admin)
    db.commit()
    db.refresh(org_admin)

    member = Member(
        org_id=org_id,
        first_name="Mario",
        last_name="Rossi",
        email=f"purge-member-{uuid.uuid4().hex[:6]}@example.com",
        status=MemberStatus.PENDING_DOCS,
        joined_at=datetime.utcnow(),
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    op_log = OperationLog(
        actor_admin_id=org_admin.id,
        actor_member_id=member.id,
        actor_role="org_admin",
        action="test.purge.fk",
        entity_type="member",
        entity_id=member.id,
    )
    db.add(op_log)
    db.commit()
    db.refresh(op_log)

    blocked = client.delete(f"/api/admin/associations/{org_id}?mode=purge&release_range=true")
    assert blocked.status_code == 409, blocked.text

    purge = client.delete(f"/api/admin/associations/{org_id}?mode=purge&release_range=true&force=true")
    assert purge.status_code == 200, purge.text
    payload = purge.json()
    assert payload["ok"] is True
    assert payload["mode"] == "purge"
    assert payload["releasedRange"] == {"start": start_no, "end": end_no}
    assert payload["archivedAssociationId"] is None
    assert payload["purgedAssociationId"] == org_id

    db.expire_all()
    org_exists = db.query(Organization).filter(Organization.id == org_id).first()
    assert org_exists is None

    refreshed_log = db.query(OperationLog).filter(OperationLog.id == op_log.id).first()
    assert refreshed_log is not None
    assert refreshed_log.actor_admin_id is None
    assert refreshed_log.actor_member_id is None

    other_org = _create_org(db, "purge-target", active=True)
    reuse_response = client.post(
        f"/api/super-admin/organizations/{other_org.id}/card-range",
        json={"from_no": start_no, "to_no": end_no},
    )
    assert reuse_response.status_code == 200, reuse_response.text
