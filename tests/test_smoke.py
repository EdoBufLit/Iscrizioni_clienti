"""End-to-end smoke tests for the backend API.

These tests run against a real (file-based) SQLite database that is
seeded automatically by the app lifespan handler. They verify that
every frontend-facing endpoint exists, returns the expected status
codes, and that auth guards block unauthenticated access.
"""


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


def test_root_redirects_to_app(client):
    r = client.get("/", follow_redirects=False)
    assert r.status_code == 307 or r.status_code == 302


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
