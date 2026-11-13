"""Post-login deep links preserve the inbox destination without external redirects."""

import re
import time
import uuid
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlsplit

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import AdminMfaFactor, AdminRole, AdminUser, EmailOutbox, Organization, OrgAdminToken
from app.routes.org_admin import _org_admin_login_code_token
from app.services.org_admin_navigation import safe_org_admin_next
from app.services.super_admin_auth import _totp_at_timestep, encrypt_totp_secret
from app.utils import hash_token

DESTINATION = "/org-admin/comunicazioni-assonam?message=12"


@pytest.fixture(autouse=True)
def isolated_login(client, monkeypatch):
    client.cookies.clear()
    monkeypatch.setattr(settings, "MFA_ENCRYPTION_KEY", "navigation-test-key-at-least-32-characters")
    yield
    client.cookies.clear()


@pytest.fixture
def admin_login():
    unique = uuid.uuid4().hex
    raw_token = f"navigation-{unique}"
    with SessionLocal() as db:
        org = Organization(name="Navigation Test", slug=f"navigation-{unique}", is_active=True)
        db.add(org)
        db.flush()
        admin = AdminUser(email=f"navigation-{unique}@example.test", role=AdminRole.ORG_ADMIN,
                          org_id=org.id, is_active=True)
        db.add(admin)
        db.flush()
        db.add(OrgAdminToken(admin_id=admin.id, token_hash=hash_token(raw_token),
                             expires_at=datetime.utcnow() + timedelta(minutes=10)))
        db.commit()
        return admin.id, admin.email, raw_token


def test_email_link_carries_destination_in_new_browser(client, admin_login):
    admin_id, email, _token = admin_login
    response = client.post("/api/org-admin/auth/magic-link", data={"email": email, "next": DESTINATION})
    assert response.status_code == 200, response.text
    with SessionLocal() as db:
        outbox = db.query(EmailOutbox).filter_by(to_email=email, email_type="org_admin_magic_link").one()
        link = re.search(r"https?://[^\s]+/auth/verify\?[^\s]+", outbox.payload_json["text_body"]).group()
    query = parse_qs(urlsplit(link).query)
    assert query["role"] == ["org_admin"]
    assert query["next"] == [DESTINATION]
    # A different browser needs only the emailed URL, with no stored navigation state.
    client.cookies.clear()
    verified = client.get("/api/org-admin/auth/verify", params={"token": query["token"][0], "next": query["next"][0]},
                          follow_redirects=False)
    assert verified.status_code == 302, verified.text
    assert verified.headers["location"] == DESTINATION
    assert client.get("/api/org-admin/auth/me").json()["id"] == admin_id


@pytest.mark.parametrize("destination", [
    "https://example.com", "//example.com", "/\\example.com", "/org-admin/../super-admin",
    "/org-admin/%2e%2e/super-admin", "/org-admin//example.com", "/org-admin/login",
    "/org-admin/callback?token=test", "/org-admin?x=%0d%0aLocation:evil",
    "/org-admin/LOGIN", "/org-admin/Callback?token=test", "/org-admin/CaLlBaCk/?token=test",
])
def test_magic_link_never_redirects_outside_workspace(client, admin_login, destination):
    _admin_id, _email, token = admin_login
    verified = client.get("/api/org-admin/auth/verify", params={"token": token, "next": destination},
                          follow_redirects=False)
    assert verified.status_code == 302, verified.text
    assert verified.headers["location"] == "/org-admin"


def test_unsafe_email_destination_is_not_embedded_in_mail(client, admin_login):
    _admin_id, email, _token = admin_login
    assert client.post("/api/org-admin/auth/magic-link", data={"email": email, "next": "https://example.com"}).status_code == 200
    with SessionLocal() as db:
        email_body = db.query(EmailOutbox).filter_by(to_email=email).one().payload_json["text_body"]
    assert "&next=" not in email_body
    assert "example.com" not in email_body


@pytest.mark.parametrize("next_path, expected", [(DESTINATION, DESTINATION), ("//example.com", "/org-admin")])
def test_email_code_returns_validated_destination(client, admin_login, next_path, expected):
    admin_id, email, _token = admin_login
    with SessionLocal() as db:
        db.add(OrgAdminToken(admin_id=admin_id,
                            token_hash=hash_token(_org_admin_login_code_token(email, "123456")),
                            expires_at=datetime.utcnow() + timedelta(minutes=10)))
        db.commit()
    verified = client.post("/api/org-admin/auth/verify-code", data={"email": email, "code": "123456", "next": next_path})
    assert verified.status_code == 200, verified.text
    assert verified.json()["redirect_to"] == expected
    assert client.get("/api/org-admin/auth/me").json()["id"] == admin_id


@pytest.mark.parametrize("next_path, expected", [(DESTINATION, DESTINATION), ("/org-admin/login", "/org-admin")])
def test_mfa_completes_login_with_validated_destination(client, admin_login, next_path, expected):
    admin_id, _email, token = admin_login
    secret = "JBSWY3DPEHPK3PXP"
    with SessionLocal() as db:
        db.add(AdminMfaFactor(admin_id=admin_id, status="active", secret_encrypted=encrypt_totp_secret(secret),
                              activated_at=datetime.utcnow()))
        db.commit()
    first = client.get("/api/org-admin/auth/verify", params={"token": token, "next": next_path}, follow_redirects=False)
    assert first.status_code == 200, first.text
    assert first.json()["mfa_required"] is True
    assert client.get("/api/org-admin/auth/me").status_code == 401
    second = client.post("/api/org-admin/auth/mfa/verify", json={
        "challenge": first.json()["challenge"], "code": _totp_at_timestep(secret, int(time.time() // 30)), "next": next_path,
    })
    assert second.status_code == 200, second.text
    assert second.json()["redirect_to"] == expected
    assert client.get("/api/org-admin/auth/me").json()["id"] == admin_id


def test_safe_destination_preserves_query_and_fragment():
    target = DESTINATION + "#dettaglio"
    assert safe_org_admin_next(target) == target
    assert safe_org_admin_next("/org-admin?query=Nome%20associazione") == "/org-admin?query=Nome%20associazione"
