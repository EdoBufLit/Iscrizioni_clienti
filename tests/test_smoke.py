"""End-to-end smoke tests for the backend API.

These tests run against a real (file-based) SQLite database that is
seeded automatically by the app lifespan handler. They verify that
every frontend-facing endpoint exists, returns the expected status
codes, and that auth guards block unauthenticated access.
"""

import os
from pathlib import Path
import subprocess
import sys

from app.config import settings


# ── Health & Version ─────────────────────────────────────────────


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] in ("ok", "degraded")
    assert "db" in data


def test_version(client):
    r = client.get("/version")
    assert r.status_code == 200
    data = r.json()
    assert "version" in data
    assert "git_sha" in data
    assert "build_time" in data


def test_api_version(client):
    r = client.get("/api/version")
    assert r.status_code == 200
    data = r.json()
    assert "version" in data
    assert "git_sha" in data
    assert "build_time" in data
    assert "request_id" in data


def test_root_redirects_to_app(client):
    r = client.get("/", follow_redirects=False)
    # The root endpoint now renders home.html (200 OK) or 404 if SPA not built
    assert r.status_code in (200, 404)


def test_app_main_imports_with_affiliazione_disabled():
    env = os.environ.copy()
    env["AFFILIAZIONE_ENABLED"] = "false"
    result = subprocess.run(
        [sys.executable, "-c", "import app.main; print('app_main_import_ok')"],
        capture_output=True,
        text=True,
        env=env,
    )
    assert result.returncode == 0, (
        f"import failed with code {result.returncode}\n"
        f"stdout:\n{result.stdout}\n"
        f"stderr:\n{result.stderr}"
    )


def test_app_main_imports_with_affiliazione_enabled_router_present():
    env = os.environ.copy()
    env["AFFILIAZIONE_ENABLED"] = "true"
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import app.main; "
                "paths={route.path for route in app.main.app.routes}; "
                "assert any(path.startswith('/api/affiliazione') for path in paths), paths; "
                "print('affiliazione_router_ok')"
            ),
        ],
        capture_output=True,
        text=True,
        env=env,
    )
    assert result.returncode == 0, (
        f"import+router check failed with code {result.returncode}\n"
        f"stdout:\n{result.stdout}\n"
        f"stderr:\n{result.stderr}"
    )


# ── Public: Organizations ────────────────────────────────────────


def test_list_organizations(client):
    r = client.get("/api/organizations")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    org = data[0]
    assert "id" in org
    assert "name" in org
    assert "slug" in org


def test_list_organizations_search(client):
    r = client.get("/api/organizations?q=my")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)


def test_platform_stats(client):
    r = client.get("/api/stats/platform")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    assert "organizations" in data
    assert "members" in data
    assert "cities" in data
    assert isinstance(data["organizations"], int)
    assert isinstance(data["members"], int)
    assert isinstance(data["cities"], int)
    assert data["organizations"] >= 0
    assert data["members"] >= 0
    assert data["cities"] >= 0


def test_platform_capabilities(client):
    r = client.get("/api/capabilities")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    assert data.get("affiliazioneEnabled") is True
    assert data.get("stripeEnabled") is False


def test_stripe_disabled_without_env():
    # Tests run with Stripe env vars removed in tests/conftest.py.
    assert settings.STRIPE_ENABLED is False


def test_affiliazione_payment_ui_contains_stripe_disabled_label():
    content = Path("frontend/src/pages/Affiliazione.tsx").read_text(encoding="utf-8")
    assert "Carta (Stripe) — presto disponibile" in content


def test_organization_detail(client):
    r = client.get("/api/organizations/my-association")
    assert r.status_code == 200
    data = r.json()
    assert data["slug"] == "my-association"


def test_organization_detail_404(client):
    r = client.get("/api/organizations/nonexistent-org")
    assert r.status_code == 404


# ── Join / Signup Flow ───────────────────────────────────────────


def test_join_start(client):
    r = client.post(
        "/api/join/my-association",
        data={
            "first_name": "Mario",
            "last_name": "Rossi",
            "email": "mario.rossi@example.com",
            "phone": "+39123456789",
            "fiscal_code": "RSSMRA90A01H501Z",
            "accept_statute": "true",
            "accept_privacy": "true",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "started"
    assert "organization" in data


def test_join_start_duplicate_email(client):
    """Second join with same email still returns 200 (no enumeration)."""
    r = client.post(
        "/api/join/my-association",
        data={
            "first_name": "Mario",
            "last_name": "Rossi",
            "email": "mario.rossi@example.com",
            "phone": "+39123456789",
            "fiscal_code": "RSSMRA90A01H501Z",
            "accept_statute": "true",
            "accept_privacy": "true",
        },
    )
    assert r.status_code == 200
    assert r.json()["status"] == "started"


def test_join_start_unknown_org(client):
    r = client.post(
        "/api/join/nonexistent-org",
        data={
            "first_name": "Test",
            "last_name": "User",
            "email": "test@example.com",
            "phone": "+39123456789",
            "fiscal_code": "TSTUSR90A01H501Z",
            "accept_statute": "true",
            "accept_privacy": "true",
        },
    )
    assert r.status_code == 404


# ── Member Auth ──────────────────────────────────────────────────


def test_member_me_unauthenticated(client):
    client.cookies.clear()
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_member_magic_link_request(client):
    """Always returns 200 regardless of whether email exists."""
    r = client.post("/api/auth/login", data={"email": "nobody@example.com"})
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"


def test_member_logout(client):
    r = client.post("/api/auth/logout")
    assert r.status_code == 200


# ── Org Admin Auth Guards ────────────────────────────────────────


def test_org_admin_me_unauthenticated(client):
    r = client.get("/api/org-admin/auth/me")
    assert r.status_code == 401


def test_org_admin_metrics_unauthenticated(client):
    r = client.get("/api/org-admin/metrics")
    assert r.status_code == 401


def test_org_admin_members_unauthenticated(client):
    r = client.get("/api/org-admin/members")
    assert r.status_code == 401


def test_org_admin_cards_unauthenticated(client):
    r = client.get("/api/org-admin/cards")
    assert r.status_code == 401


def test_org_admin_card_movements_unauthenticated(client):
    r = client.get("/api/org-admin/cards/movements")
    assert r.status_code == 401


def test_org_admin_magic_link_ok(client):
    """Magic link request always returns 200."""
    r = client.post(
        "/api/org-admin/auth/magic-link",
        data={"email": "nobody@example.com"},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True


# ── Super Admin Auth Guards ──────────────────────────────────────


def test_super_admin_me_unauthenticated(client):
    r = client.get("/api/super-admin/auth/me")
    assert r.status_code in (401, 403)


def test_super_admin_org_admins_unauthenticated(client):
    r = client.get("/api/super-admin/org-admins")
    assert r.status_code in (401, 403)


def test_super_admin_create_org_admin_unauthenticated(client):
    r = client.post(
        "/api/super-admin/org-admins",
        json={"email": "new@example.com", "org_id": 1},
    )
    assert r.status_code in (401, 403)


def test_super_admin_patch_org_admin_unauthenticated(client):
    r = client.patch(
        "/api/super-admin/org-admins/999",
        json={"is_active": False},
    )
    assert r.status_code in (401, 403, 404)


def test_super_admin_cards_increase_unauthenticated(client):
    r = client.post(
        "/api/super-admin/orgs/1/cards/increase",
        json={"amount": 10},
    )
    assert r.status_code in (401, 403)


def test_super_admin_login_bad_credentials(client):
    r = client.post(
        "/api/super-admin/auth/login",
        json={"email": "wrong@example.com", "password": "wrong"},
    )
    assert r.status_code == 401


def test_super_admin_logout(client):
    r = client.post("/api/super-admin/auth/logout")
    assert r.status_code == 200
