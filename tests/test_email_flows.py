import pytest
from app.config import settings
from app.utils import get_captured_emails, clear_captured_emails
from app.models import Member, MemberStatus, AdminUser, AdminRole, Organization
from datetime import datetime
from unittest.mock import patch

# Fixture to enable test email mode, clear capture, and disable rate limiting
@pytest.fixture(autouse=True)
def setup_test_env(client):
    # Clear cookies/session from previous tests
    client.cookies.clear()

    # Email mode
    original_mode = settings.EMAIL_MODE
    settings.EMAIL_MODE = "test"
    clear_captured_emails()

    # Disable rate limiter
    with patch("app.middleware.RateLimiter.check"):
        yield

    settings.EMAIL_MODE = original_mode
    clear_captured_emails()

def test_member_magic_link_flow(client):
    # 1. Create Member
    email = "test.member@example.com"
    # We can use a direct DB insert or just rely on register if needed, but direct is safer for isolation
    # However, let's use the register endpoint if available or assume pre-seeded data?
    # No, let's use the existing client/db setup.
    # We'll try to login with a non-existent member first.

    # Negative test: Member does NOT exist
    res = client.post("/api/auth/login", data={"email": "nonexistent@example.com"})
    assert res.status_code == 200
    assert len(get_captured_emails()) == 0

    # Create member (manually or via join flow)
    # Using manual DB insertion via client fixture would need direct DB access.
    # The `client` fixture creates a clean DB. Let's use the register endpoint if available
    # or just use `POST /api/join/{slug}` if we have an org.
    # `test_smoke.py` creates "my-association".

    join_res = client.post(
        "/api/join/my-association",
        data={
            "first_name": "Test",
            "last_name": "Member",
            "email": email,
            "phone": "123",
            "fiscal_code": "CF123",
            "accept_statute": "true",
            "accept_privacy": "true",
        }
    )
    assert join_res.status_code == 200

    # Now valid login request (case insensitive)
    clear_captured_emails()
    res = client.post("/api/auth/login", data={"email": " Test.Member@Example.com "})
    assert res.status_code == 200

    # Assert email captured
    captured = get_captured_emails()
    assert len(captured) == 1
    assert captured[0]["to"] == " Test.Member@Example.com " # Or normalized depending on implementation?
    # Actually `send_email` is called with the input email in `api_auth_login`

    body = captured[0]["body"]
    assert "token=" in body

    # Extract token
    import re
    match = re.search(r"token=([a-zA-Z0-9_-]+)", body)
    assert match
    token = match.group(1)

    # Verify
    verify_res = client.get(f"/member/auth?token={token}", follow_redirects=False)
    assert verify_res.status_code == 302
    assert verify_res.headers["location"] == "/dashboard"

    # Check session
    # We need to follow redirects or pass the cookie. TestClient handles cookies automatically.
    # But follow_redirects=False meant we stopped at the redirect. The cookie should be set.
    me_res = client.get("/api/auth/me")
    assert me_res.status_code == 200
    assert me_res.json()["email"] == email

def test_org_admin_magic_link_flow(client):
    # 1. Setup Org Admin
    # Login as super admin to create it
    client.post("/api/super-admin/auth/login", json={"email": "admin@assonam.it", "password": "admin"})

    # Create org admin
    email = "org.admin@example.com"
    create_res = client.post("/api/super-admin/org-admins", json={"email": email, "org_id": 1})
    assert create_res.status_code == 200
    client.post("/api/super-admin/auth/logout")

    clear_captured_emails()

    # 2. Request Magic Link
    res = client.post("/api/org-admin/auth/magic-link", data={"email": email})
    assert res.status_code == 200

    captured = get_captured_emails()
    assert len(captured) == 1
    body = captured[0]["body"]

    import re
    match = re.search(r"token=([a-zA-Z0-9_-]+)", body)
    assert match
    token = match.group(1)

    # 3. Verify
    verify_res = client.get(f"/api/org-admin/auth/verify?token={token}", follow_redirects=False)
    assert verify_res.status_code == 302
    assert "/org-admin" in verify_res.headers["location"]

    # 4. Check Session
    me_res = client.get("/api/org-admin/auth/me")
    assert me_res.status_code == 200
    assert me_res.json()["email"] == email

def test_org_admin_deleted_flow(client):
    # Login as super admin
    client.post("/api/super-admin/auth/login", json={"email": "admin@assonam.it", "password": "admin"})

    # Create org admin
    email = "deleted.admin@example.com"
    create_res = client.post("/api/super-admin/org-admins", json={"email": email, "org_id": 1})
    admin_id = create_res.json()["id"]

    # Create another admin so we can delete this one (last admin check)
    client.post("/api/super-admin/org-admins", json={"email": "other@example.com", "org_id": 1})

    # Delete admin
    client.delete(f"/api/super-admin/org-admins/{admin_id}")
    client.post("/api/super-admin/auth/logout")

    clear_captured_emails()

    # Try to login
    res = client.post("/api/org-admin/auth/magic-link", data={"email": email})
    assert res.status_code == 200 # Anti-enumeration
    assert len(get_captured_emails()) == 0 # No email sent

def test_super_admin_create_flow_email(client):
    # Login as super admin
    client.post("/api/super-admin/auth/login", json={"email": "admin@assonam.it", "password": "admin"})

    clear_captured_emails()

    # Create org admin
    email = "new.admin@example.com"
    res = client.post("/api/super-admin/org-admins", json={"email": email, "org_id": 1})
    assert res.status_code == 200

    # Assert email sent automatically
    captured = get_captured_emails()
    assert len(captured) == 1
    assert captured[0]["to"] == email

    body = captured[0]["body"]
    import re
    match = re.search(r"token=([a-zA-Z0-9_-]+)", body)
    assert match
    token = match.group(1)

    # Verify token works (even without requesting magic link explicitly)
    # Logout super admin first to be clean
    client.post("/api/super-admin/auth/logout")

    verify_res = client.get(f"/api/org-admin/auth/verify?token={token}", follow_redirects=False)
    assert verify_res.status_code == 302

    me_res = client.get("/api/org-admin/auth/me")
    assert me_res.status_code == 200
    assert me_res.json()["email"] == email
