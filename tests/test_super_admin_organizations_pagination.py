import uuid
from datetime import datetime, timedelta

import pytest

from app.db import SessionLocal
from app.models import Organization


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


def _seed_organizations(db, *, prefix: str, count: int):
    base_dt = datetime(2026, 1, 1, 12, 0, 0)
    organizations = []
    for index in range(count):
        organizations.append(
            Organization(
                name=f"{prefix} Association {index:03d}",
                slug=f"{prefix}-{index:03d}",
                email=f"{prefix}-{index:03d}@example.com",
                privacy_version="v1",
                is_active=True,
                created_at=base_dt + timedelta(minutes=index),
            )
        )

    db.add_all(organizations)
    db.commit()


def test_super_admin_organizations_paginates_filtered_results(client, db):
    _login_super_admin(client)
    prefix = f"org-page-{uuid.uuid4().hex[:8]}"
    _seed_organizations(db, prefix=prefix, count=120)

    page_1 = client.get(
        "/api/admin/organizations",
        params={"q": prefix, "page": 1, "page_size": 50},
    )
    assert page_1.status_code == 200, page_1.text
    payload_1 = page_1.json()
    assert payload_1["page"] == 1
    assert payload_1["page_size"] == 50
    assert payload_1["total"] == 120
    assert payload_1["total_pages"] == 3
    assert len(payload_1["items"]) == 50

    page_3 = client.get(
        "/api/admin/organizations",
        params={"q": prefix, "page": 3, "page_size": 50},
    )
    assert page_3.status_code == 200, page_3.text
    payload_3 = page_3.json()
    assert payload_3["page"] == 3
    assert payload_3["page_size"] == 50
    assert payload_3["total"] == 120
    assert payload_3["total_pages"] == 3
    assert len(payload_3["items"]) == 20


def test_super_admin_organizations_searches_name_slug_and_email(client, db):
    _login_super_admin(client)
    prefix = f"org-search-{uuid.uuid4().hex[:8]}"
    search_term = f"oasi-{uuid.uuid4().hex[:6]}"
    base_dt = datetime(2026, 1, 2, 9, 0, 0)
    organizations = [
        Organization(
            name=f"{prefix} {search_term} club",
            slug=f"{prefix}-name-match",
            email=f"{prefix}-a@example.com",
            privacy_version="v1",
            is_active=True,
            created_at=base_dt,
        ),
        Organization(
            name=f"{prefix} Delta Club",
            slug=f"{prefix}-slug-{search_term}",
            email=f"{prefix}-b@example.com",
            privacy_version="v1",
            is_active=True,
            created_at=base_dt + timedelta(minutes=1),
        ),
        Organization(
            name=f"{prefix} Gamma Club",
            slug=f"{prefix}-email-match",
            email=f"contatti-{search_term}-{prefix}@example.com",
            privacy_version="v1",
            is_active=True,
            created_at=base_dt + timedelta(minutes=2),
        ),
        Organization(
            name=f"{prefix} Extra Club",
            slug=f"{prefix}-no-match",
            email=f"{prefix}-no-match@example.com",
            privacy_version="v1",
            is_active=True,
            created_at=base_dt + timedelta(minutes=3),
        ),
    ]
    db.add_all(organizations)
    db.commit()

    response = client.get(
        "/api/admin/organizations",
        params={"q": search_term, "page": 1, "page_size": 50},
    )
    assert response.status_code == 200, response.text

    payload = response.json()
    assert payload["page"] == 1
    assert payload["page_size"] == 50
    assert payload["total"] == 3
    assert payload["total_pages"] == 1
    matching_slugs = {item["slug"] for item in payload["items"] if item["slug"].startswith(prefix)}
    assert matching_slugs == {
        f"{prefix}-name-match",
        f"{prefix}-slug-{search_term}",
        f"{prefix}-email-match",
    }


def test_super_admin_can_enable_custom_membership_types_per_organization(client):
    _login_super_admin(client)
    suffix = uuid.uuid4().hex[:8]

    create_res = client.post(
        "/api/super-admin/organizations",
        json={
            "name": f"Membership Org {suffix}",
            "slug": f"membership-org-{suffix}",
            "email": f"membership-org-{suffix}@example.com",
            "privacy_version": "v1",
            "custom_membership_types_enabled": True,
        },
    )
    assert create_res.status_code == 200, create_res.text
    created = create_res.json()
    assert created["custom_membership_types_enabled"] is True

    patch_res = client.patch(
        f"/api/super-admin/organizations/{created['id']}",
        json={"custom_membership_types_enabled": False},
    )
    assert patch_res.status_code == 200, patch_res.text
    patched = patch_res.json()
    assert patched["custom_membership_types_enabled"] is False
