from datetime import datetime, timedelta
import uuid

import pytest
from sqlalchemy import func

from app.db import SessionLocal
from app.models import AdminRole, AdminUser, CardBatch, Organization, OrgAdminToken
from app.security import get_password_hash
from app.utils import hash_token


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


def _login_org_admin(client, db, admin_id: int):
    token_str = f"lot-movements-{admin_id}-{uuid.uuid4().hex[:6]}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    response = client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)
    assert response.status_code in (302, 307), response.text


def _create_org(db) -> Organization:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Org admin lotti {suffix}",
        slug=f"org-admin-lotti-{suffix}",
        privacy_version="v1",
        is_active=True,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _create_org_admin(db, org_id: int) -> AdminUser:
    suffix = uuid.uuid4().hex[:8]
    admin = AdminUser(
        email=f"org-admin-lotti-{suffix}@example.com",
        password_hash=get_password_hash("Pass1234!"),
        role=AdminRole.ORG_ADMIN,
        org_id=org_id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


def _next_free_range(db, *, size: int = 10) -> tuple[int, int]:
    max_end = db.query(func.max(CardBatch.end_no)).filter(CardBatch.released_at.is_(None)).scalar()
    base = int(max_end or 50000) + 100
    return base, base + size - 1


def test_org_admin_card_movements_show_live_current_year_lots_and_follow_super_admin_changes(client, db):
    org = _create_org(db)
    org_admin = _create_org_admin(db, org.id)
    current_year = datetime.utcnow().year

    current_start, current_end = _next_free_range(db, size=10)
    previous_start = current_end + 100
    previous_end = previous_start + 4

    current_batch = CardBatch(
        org_id=org.id,
        year=current_year,
        start_no=current_start,
        end_no=current_end,
        next_no=current_start,
        is_enabled=True,
    )
    old_batch = CardBatch(
        org_id=org.id,
        year=current_year - 1,
        start_no=previous_start,
        end_no=previous_end,
        next_no=previous_start,
        is_enabled=True,
    )
    db.add_all([current_batch, old_batch])
    db.commit()
    db.refresh(current_batch)

    _login_org_admin(client, db, org_admin.id)

    initial_response = client.get("/api/org-admin/cards/movements")
    assert initial_response.status_code == 200, initial_response.text
    initial_payload = initial_response.json()
    assert initial_payload["total"] == 1
    assert initial_payload["current_year"] == current_year
    assert len(initial_payload["items"]) == 1
    assert initial_payload["items"][0]["id"] == current_batch.id
    assert initial_payload["items"][0]["range_start"] == current_start
    assert initial_payload["items"][0]["range_end"] == current_end
    assert initial_payload["items"][0]["quantity"] == current_end - current_start + 1
    assert initial_payload["items"][0]["status_label"] == "Attivo"
    assert "assigned" not in initial_payload["items"][0]
    assert "remaining" not in initial_payload["items"][0]

    _login_super_admin(client)
    updated_start = current_start + 2
    updated_end = current_end - 1
    patch_response = client.patch(
        f"/api/admin/organizations/{org.id}/card-lots/{current_batch.id}",
        json={
            "status": "inactive",
            "range_start": updated_start,
            "range_end": updated_end,
        },
    )
    assert patch_response.status_code == 200, patch_response.text

    updated_response = client.get("/api/org-admin/cards/movements")
    assert updated_response.status_code == 200, updated_response.text
    updated_payload = updated_response.json()
    assert updated_payload["total"] == 1
    assert updated_payload["items"][0]["range_start"] == updated_start
    assert updated_payload["items"][0]["range_end"] == updated_end
    assert updated_payload["items"][0]["quantity"] == updated_end - updated_start + 1
    assert updated_payload["items"][0]["status_label"] == "Disattivo"

    delete_response = client.delete(f"/api/admin/organizations/{org.id}/card-lots/{current_batch.id}")
    assert delete_response.status_code == 200, delete_response.text

    final_response = client.get("/api/org-admin/cards/movements")
    assert final_response.status_code == 200, final_response.text
    final_payload = final_response.json()
    assert final_payload["total"] == 0
    assert final_payload["items"] == []
