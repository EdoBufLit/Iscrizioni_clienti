from datetime import datetime, timedelta
import uuid

import pytest
from sqlalchemy import func

from app.db import SessionLocal
from app.models import AdminRole, AdminUser, CardBatch, Member, MemberStatus, Organization, OrgAdminToken
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


def test_card_movement_filters_precede_pagination_and_keep_complete_tenant_options(client, db):
    from app.services.annual_memberships import as_rome_datetime

    org = _create_org(db)
    other_org = _create_org(db)
    admin = _create_org_admin(db, org.id)
    year = as_rome_datetime().year
    start, _ = _next_free_range(db)
    batches = []
    for index in range(62):
        owner = other_org.id if index == 61 else org.id
        batch_year = year - 1 if index == 58 else year + 1 if index == 59 else year + 2 if index == 61 else year
        number = start + index * 20
        batches.append(CardBatch(org_id=owner, year=batch_year, start_no=number,
                                 end_no=number if index == 57 else number + 1,
                                 next_no=number, is_enabled=index not in (55, 56),
                                 released_at=datetime.utcnow() if index == 60 else None))
    db.add_all(batches)
    db.flush()
    db.add(Member(org_id=org.id, first_name="Socio", last_name="Lotto esaurito",
                  status=MemberStatus.ACTIVE, card_no=batches[57].start_no,
                  card_year=year, batch_id=batches[57].id))
    db.commit()
    _login_org_admin(client, db, admin.id)

    base = "/api/org-admin/cards/movements"
    default = client.get(base).json()
    assert default["total"] == 58
    assert len(default["items"]) == 50
    assert default["current_year"] == year
    assert default["selected_year"] == year
    assert default["available_years"] == [year + 1, year, year - 1]
    assert {item["id"] for item in default["lot_options"]} == {batch.id for batch in batches[:58]}
    second = client.get(base, params={"offset": 50}).json()
    assert len(second["items"]) == 8
    assert not ({item["id"] for item in default["items"]} & {item["id"] for item in second["items"]})
    assert second["lot_options"] == default["lot_options"]

    active = client.get(base, params={"status": "active", "limit": 2, "offset": 2}).json()
    assert active["total"] == 55
    assert len(active["items"]) == 2
    assert all(item["status_label"] == "Attivo" for item in active["items"])
    assert active["lot_options"] == default["lot_options"]
    inactive = client.get(base, params={"status": "Disattivo", "limit": 1}).json()
    assert inactive["total"] == 2
    assert inactive["items"][0]["status_label"] == "Disattivo"
    exhausted = client.get(base, params={"status": "Esaurito"}).json()
    assert exhausted["total"] == 1
    assert exhausted["items"][0]["id"] == batches[57].id

    previous = client.get(base, params={"year": year - 1}).json()
    assert previous["selected_year"] == year - 1
    assert previous["total"] == 1
    assert previous["items"][0]["id"] == batches[58].id
    all_years = client.get(base, params={"all_years": True, "limit": 100}).json()
    assert all_years["selected_year"] is None
    assert all_years["total"] == 60
    assert {item["id"] for item in all_years["items"]} == {batch.id for batch in batches[:60]}
    exact = client.get(base, params={"batch_id": batches[0].id, "status": "Attivo"}).json()
    assert exact["total"] == 1
    assert exact["items"][0]["id"] == batches[0].id
    foreign = client.get(base, params={"all_years": True, "batch_id": batches[61].id}).json()
    assert foreign["items"] == [] and foreign["total"] == 0
    assert batches[61].id not in {item["id"] for item in foreign["lot_options"]}

    for params in ({"year": year, "all_years": True}, {"status": "inventato"},
                   {"limit": 0}, {"limit": 101}, {"offset": -1}, {"batch_id": 0}):
        assert client.get(base, params=params).status_code == 422


def test_card_history_default_year_uses_rome_not_utc(client, db, monkeypatch):
    from datetime import timezone

    org = _create_org(db)
    admin = _create_org_admin(db, org.id)
    _login_org_admin(client, db, admin.id)
    monkeypatch.setattr("app.routes.org_admin.as_rome_datetime",
                        lambda: datetime(2027, 1, 1, 0, 30, tzinfo=timezone(timedelta(hours=1))))
    result = client.get("/api/org-admin/cards/movements").json()
    assert result["current_year"] == result["selected_year"] == 2027
    assert result["available_years"] == [2027]
    requests = client.get("/api/org-admin/cards/replenishments").json()
    assert requests["current_year"] == 2027
    assert requests["selected_year"] is None
    assert requests["available_years"] == [2027]
