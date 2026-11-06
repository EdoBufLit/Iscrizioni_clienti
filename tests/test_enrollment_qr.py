import base64
import io
import uuid

import pytest
from PIL import Image

from app.config import settings
from app.db import SessionLocal
from app.models import AdminRole, AdminUser, Organization
from app.services.org_admin_sessions import create_org_admin_persistent_session
from app.services.qr_code import generate_qr_png_bytes


@pytest.fixture
def org_and_admin(client):
    client.cookies.clear()
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:10]
    org = Organization(name="Jappa Club & amici", slug=f"jappa-{suffix}", is_active=True)
    db.add(org)
    db.flush()
    admin = AdminUser(email=f"qr-{suffix}@example.com", org_id=org.id,
                      role=AdminRole.ORG_ADMIN, is_active=True)
    db.add(admin)
    db.commit()
    yield db, org, admin
    client.cookies.clear()
    db.close()


def _assert_qr(payload, org, base):
    url = f"{base}/associazioni/{org.slug}/iscrizione"
    assert payload["enrollment_url"] == url
    assert payload["organization_name"] == org.name
    assert payload["organization_slug"] == org.slug
    prefix, encoded = payload["qr_data_uri"].split(",", 1)
    assert prefix == "data:image/png;base64"
    png = base64.b64decode(encoded)
    assert png == generate_qr_png_bytes(url, box_size=12, border=4)
    image = Image.open(io.BytesIO(png)).convert("RGB")
    assert image.width == image.height
    # All four sides have the mandatory white margin for reliable scanning.
    for strip in [(0, 0, image.width, 48), (0, 0, 48, image.height),
                  (image.width - 48, 0, image.width, image.height),
                  (0, image.height - 48, image.width, image.height)]:
        assert image.crop(strip).getextrema() == ((255, 255),) * 3


def test_enrollment_qr_requires_authentication(client, org_and_admin):
    _, org, _ = org_and_admin
    for endpoint in ["/api/org-admin/organization/enrollment-qr",
                     f"/api/super-admin/organizations/{org.id}/enrollment-qr",
                     f"/api/admin/organizations/{org.id}/enrollment-qr"]:
        assert client.get(endpoint).status_code == 401


def test_org_admin_qr_is_bound_to_own_organization(client, org_and_admin, monkeypatch):
    db, org, admin = org_and_admin
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://assonam.it/")
    _, token = create_org_admin_persistent_session(db, admin, mfa_verified=True)
    db.commit()
    client.cookies.set("org_admin_session", token)
    # An arbitrary query parameter cannot select a different club.
    response = client.get("/api/org-admin/organization/enrollment-qr?org_id=999999")
    assert response.status_code == 200, response.text
    _assert_qr(response.json(), org, "https://assonam.it")
    assert client.get(f"/api/super-admin/organizations/{org.id}/enrollment-qr").status_code == 401
    admin.is_active = False
    db.commit()
    assert client.get("/api/org-admin/organization/enrollment-qr").status_code == 401


def test_super_admin_qr_and_alias_with_backend_fallback(client, org_and_admin, monkeypatch):
    _, org, _ = org_and_admin
    monkeypatch.setattr(settings, "FRONTEND_URL", "")
    monkeypatch.setattr(settings, "BASE_URL", "https://assonam.it/")
    response = client.post("/api/super-admin/auth/login",
                           json={"email": "admin@assonam.it", "password": "admin"})
    assert response.status_code == 200, response.text
    for prefix in ["/api/super-admin", "/api/admin"]:
        response = client.get(f"{prefix}/organizations/{org.id}/enrollment-qr")
        assert response.status_code == 200, response.text
        _assert_qr(response.json(), org, "https://assonam.it")
    assert client.get("/api/super-admin/organizations/99999999/enrollment-qr").status_code == 404


def test_qr_uses_the_club_public_display_name(client, org_and_admin):
    db, org, admin = org_and_admin
    org.club_display_name = "Jappa Social Club"
    _, token = create_org_admin_persistent_session(db, admin, mfa_verified=True)
    db.commit()
    client.cookies.set("org_admin_session", token)
    payload = client.get("/api/org-admin/organization/enrollment-qr").json()
    assert payload["organization_name"] == "Jappa Social Club"
    assert f"/associazioni/{org.slug}/iscrizione" in payload["enrollment_url"]
