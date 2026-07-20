import time
from datetime import datetime, timedelta

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AdminAuthChallenge,
    AdminMfaFactor,
    AdminRecoveryCode,
    AdminRole,
    AdminUser,
    SuperAdminSession,
)
from app.services.super_admin_auth import (
    SUPER_ADMIN_SESSION_COOKIE,
    _totp_at_timestep,
)
from app.utils import hash_token


def _super_admin_id(db) -> int:
    row = (
        db.query(AdminUser.id)
        .filter(
            AdminUser.role == AdminRole.SUPER_ADMIN,
            AdminUser.email == settings.SUPER_ADMIN_EMAIL,
            AdminUser.is_active.is_(True),
        )
        .order_by(AdminUser.id.asc())
        .first()
    )
    assert row is not None, "Configured active super admin is missing from the test database"
    return int(row[0])


def _clear_super_admin_security_state() -> None:
    db = SessionLocal()
    try:
        admin_id = _super_admin_id(db)
        db.query(AdminAuthChallenge).filter(AdminAuthChallenge.admin_id == admin_id).delete()
        db.query(AdminRecoveryCode).filter(AdminRecoveryCode.admin_id == admin_id).delete()
        db.query(SuperAdminSession).filter(SuperAdminSession.admin_id == admin_id).delete()
        db.query(AdminMfaFactor).filter(AdminMfaFactor.admin_id == admin_id).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def mandatory_mfa(client, monkeypatch):
    client.cookies.clear()
    _clear_super_admin_security_state()
    monkeypatch.setattr(settings, "SUPER_ADMIN_MFA_REQUIRED", True)
    monkeypatch.setattr(settings, "MFA_ENCRYPTION_KEY", "test-mfa-encryption-key-at-least-32-bytes")
    yield
    client.cookies.clear()
    _clear_super_admin_security_state()


def _begin_setup(client) -> dict:
    response = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "mfa_setup_required"
    assert payload["qr_data_uri"].startswith("data:image/png;base64,")
    return payload


def _activate_mfa(client) -> tuple[dict, str]:
    setup = _begin_setup(client)
    code = _totp_at_timestep(setup["secret"], int(time.time() // 30))
    response = client.post(
        "/api/super-admin/auth/mfa/totp/confirm",
        json={"challenge_token": setup["challenge_token"], "code": code},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "authenticated"
    assert len(payload["recovery_codes"]) == 10
    return payload, setup["secret"]


def test_password_does_not_create_privileged_session_before_mfa(client):
    _begin_setup(client)
    assert client.get("/api/super-admin/auth/me").status_code == 401


def test_totp_setup_creates_revocable_server_side_session(client):
    payload, _ = _activate_mfa(client)
    assert client.cookies.get(SUPER_ADMIN_SESSION_COOKIE)

    me = client.get("/api/super-admin/auth/me")
    assert me.status_code == 200, me.text
    assert me.json()["mfa_enabled"] is True
    assert me.json()["recovery_codes_remaining"] == 10

    sessions = client.get("/api/super-admin/auth/sessions")
    assert sessions.status_code == 200, sessions.text
    assert len(sessions.json()["items"]) == 1
    assert sessions.json()["items"][0]["current"] is True
    assert payload["recovery_codes"][0]


def test_recovery_code_is_single_use(client):
    payload, _ = _activate_mfa(client)
    recovery_code = payload["recovery_codes"][0]
    client.post("/api/super-admin/auth/logout")

    login = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    ).json()
    first_use = client.post(
        "/api/super-admin/auth/mfa/verify",
        json={"challenge_token": login["challenge_token"], "code": recovery_code},
    )
    assert first_use.status_code == 200, first_use.text
    client.post("/api/super-admin/auth/logout")

    login_again = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    ).json()
    replay = client.post(
        "/api/super-admin/auth/mfa/verify",
        json={"challenge_token": login_again["challenge_token"], "code": recovery_code},
    )
    assert replay.status_code == 401


def test_revoked_session_stops_work_immediately(client):
    payload, _ = _activate_mfa(client)
    first_token = client.cookies.get(SUPER_ADMIN_SESSION_COOKIE)
    client.cookies.clear()

    login = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    ).json()
    second = client.post(
        "/api/super-admin/auth/mfa/verify",
        json={
            "challenge_token": login["challenge_token"],
            "code": payload["recovery_codes"][1],
        },
    )
    assert second.status_code == 200, second.text
    sessions = client.get("/api/super-admin/auth/sessions").json()["items"]
    first_session = next(item for item in sessions if not item["current"])

    revoked = client.delete(f"/api/super-admin/auth/sessions/{first_session['id']}")
    assert revoked.status_code == 200, revoked.text

    client.cookies.set(SUPER_ADMIN_SESSION_COOKIE, first_token)
    assert client.get("/api/super-admin/auth/me").status_code == 401


def test_legacy_password_only_admin_login_is_not_mounted(client):
    response = client.post(
        "/admin/login",
        data={"email": "admin@assonam.it", "password": "admin"},
        follow_redirects=False,
    )
    assert response.status_code == 405


def test_critical_mutation_requires_recent_step_up(client):
    payload, _ = _activate_mfa(client)
    raw_session = client.cookies.get(SUPER_ADMIN_SESSION_COOKIE)
    db = SessionLocal()
    try:
        session = (
            db.query(SuperAdminSession)
            .filter(SuperAdminSession.token_hash == hash_token(raw_session))
            .one()
        )
        session.mfa_verified_at = datetime.utcnow() - timedelta(minutes=11)
        db.commit()
    finally:
        db.close()

    blocked = client.post(
        "/api/super-admin/orgs/999999/integration-keys",
        json={"name": "test", "scopes": ["issue_member"]},
    )
    assert blocked.status_code == 403, blocked.text
    assert "Recent MFA" in blocked.text

    verified = client.post(
        "/api/super-admin/auth/step-up",
        json={"code": payload["recovery_codes"][2]},
    )
    assert verified.status_code == 200, verified.text
    passed_guard = client.post(
        "/api/super-admin/orgs/999999/integration-keys",
        json={"name": "test", "scopes": ["issue_member"]},
    )
    assert passed_guard.status_code == 404, passed_guard.text
