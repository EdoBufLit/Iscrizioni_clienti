import re
import time
import uuid
from datetime import datetime, timedelta

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AdminAuthChallenge,
    AdminMfaFactor,
    AdminRole,
    AdminUser,
    EmailOutbox,
    OrgAdminSession,
    OrgAdminToken,
    OperationLog,
)
from app.services.super_admin_auth import _totp_at_timestep
from app.utils import hash_token


@pytest.fixture(autouse=True)
def org_admin_mfa_environment(client, monkeypatch):
    client.cookies.clear()
    monkeypatch.setattr(
        settings,
        "MFA_ENCRYPTION_KEY",
        "test-org-admin-mfa-encryption-key-at-least-32-bytes",
    )
    yield
    client.cookies.clear()


def _create_org_admin(*, org_id: int = 1) -> AdminUser:
    db = SessionLocal()
    try:
        admin = AdminUser(
            email=f"org-mfa-{uuid.uuid4().hex}@example.com",
            password_hash="",
            role=AdminRole.ORG_ADMIN,
            org_id=org_id,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        db.expunge(admin)
        return admin
    finally:
        db.close()


def _issue_magic_token(admin_id: int) -> str:
    raw_token = f"org-admin-login-{uuid.uuid4().hex}"
    db = SessionLocal()
    try:
        db.add(
            OrgAdminToken(
                admin_id=admin_id,
                token_hash=hash_token(raw_token),
                expires_at=datetime.utcnow() + timedelta(minutes=15),
            )
        )
        db.commit()
    finally:
        db.close()
    return raw_token


def _login_without_mfa(client, admin_id: int) -> str:
    response = client.get(
        f"/api/org-admin/auth/verify?token={_issue_magic_token(admin_id)}",
        follow_redirects=False,
    )
    assert response.status_code == 302, response.text
    cookie = client.cookies.get("org_admin_session")
    assert cookie
    return cookie


def _latest_mfa_setup_email_code(admin: AdminUser) -> str:
    db = SessionLocal()
    try:
        email = (
            db.query(EmailOutbox)
            .filter(
                EmailOutbox.email_type == "org_admin_mfa_setup_step_up",
                EmailOutbox.to_email == admin.email,
            )
            .order_by(EmailOutbox.created_at.desc(), EmailOutbox.id.desc())
            .first()
        )
        assert email is not None
        match = re.search(r"(?m)^([0-9]{6})$", email.payload_json["text_body"])
        assert match is not None
        return match.group(1)
    finally:
        db.close()


def _authorize_mfa_setup(client, admin: AdminUser) -> str:
    requested = client.post("/api/org-admin/auth/mfa/setup/email/request")
    assert requested.status_code == 200, requested.text
    assert admin.email not in requested.json()["masked_email"]
    code = _latest_mfa_setup_email_code(admin)
    db = SessionLocal()
    try:
        challenge = (
            db.query(AdminAuthChallenge)
            .filter(
                AdminAuthChallenge.admin_id == admin.id,
                AdminAuthChallenge.purpose.like("org_admin_mfa_setup_email:%"),
            )
            .order_by(AdminAuthChallenge.id.desc())
            .first()
        )
        assert challenge is not None
        assert challenge.token_hash != code
        assert len(challenge.token_hash) == 64
    finally:
        db.close()
    verified = client.post(
        "/api/org-admin/auth/mfa/setup/email/verify",
        json={"code": code},
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["setup_authorized"] is True
    return code


def _enable_mfa(client, admin_id: int) -> tuple[str, list[str]]:
    _login_without_mfa(client, admin_id)
    db = SessionLocal()
    try:
        admin = db.query(AdminUser).filter(AdminUser.id == admin_id).one()
        db.expunge(admin)
    finally:
        db.close()
    blocked = client.post("/api/org-admin/auth/mfa/setup")
    assert blocked.status_code == 403, blocked.text
    _authorize_mfa_setup(client, admin)
    setup = client.post("/api/org-admin/auth/mfa/setup")
    assert setup.status_code == 200, setup.text
    payload = setup.json()
    assert payload["qr_data_uri"].startswith("data:image/png;base64,")
    code = _totp_at_timestep(payload["secret"], int(time.time() // 30))
    confirmed = client.post(
        "/api/org-admin/auth/mfa/setup/confirm",
        json={"code": code, "use_recovery_code": False},
    )
    assert confirmed.status_code == 200, confirmed.text
    recovery_codes = confirmed.json()["recovery_codes"]
    assert len(recovery_codes) == 10
    return payload["secret"], recovery_codes


def _begin_mfa_login(client, admin_id: int) -> str:
    client.cookies.clear()
    response = client.get(
        f"/api/org-admin/auth/verify?token={_issue_magic_token(admin_id)}",
        follow_redirects=False,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["mfa_required"] is True
    assert client.cookies.get("org_admin_session") is None
    return payload["challenge"]


def test_no_mfa_login_behaviour_and_thirty_day_duration_are_unchanged(client):
    admin = _create_org_admin()
    raw_cookie = _login_without_mfa(client, admin.id)
    assert client.get("/api/org-admin/auth/me").status_code == 200

    db = SessionLocal()
    try:
        session = (
            db.query(OrgAdminSession)
            .filter(OrgAdminSession.token_hash == hash_token(raw_cookie))
            .one()
        )
        duration = session.expires_at - session.created_at
        assert timedelta(days=29, hours=23) < duration <= timedelta(days=30)
        assert session.mfa_verified_at is None
    finally:
        db.close()


def test_mfa_setup_is_blocked_until_fresh_email_step_up(client):
    admin = _create_org_admin()
    _login_without_mfa(client, admin.id)

    blocked = client.post("/api/org-admin/auth/mfa/setup")
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "MFA_SETUP_EMAIL_STEP_UP_REQUIRED"

    db = SessionLocal()
    try:
        assert (
            db.query(AdminMfaFactor)
            .filter(AdminMfaFactor.admin_id == admin.id)
            .count()
            == 0
        )
    finally:
        db.close()


def test_valid_email_code_allows_secret_and_mfa_activation(client):
    admin = _create_org_admin()
    _login_without_mfa(client, admin.id)
    _authorize_mfa_setup(client, admin)

    setup = client.post("/api/org-admin/auth/mfa/setup")
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    totp = _totp_at_timestep(secret, int(time.time() // 30))
    confirmed = client.post(
        "/api/org-admin/auth/mfa/setup/confirm",
        json={"code": totp, "use_recovery_code": False},
    )
    assert confirmed.status_code == 200, confirmed.text
    assert len(confirmed.json()["recovery_codes"]) == 10

    db = SessionLocal()
    try:
        factor = (
            db.query(AdminMfaFactor)
            .filter(AdminMfaFactor.admin_id == admin.id)
            .one()
        )
        session = (
            db.query(OrgAdminSession)
            .filter(OrgAdminSession.admin_id == admin.id)
            .order_by(OrgAdminSession.id.desc())
            .first()
        )
        assert factor.status == "active"
        assert session is not None and session.mfa_setup_authorized_at is None
    finally:
        db.close()


def test_email_setup_code_is_tenant_and_session_bound(client):
    first_admin = _create_org_admin(org_id=1)
    second_admin = _create_org_admin(org_id=2)
    _login_without_mfa(client, first_admin.id)
    requested = client.post("/api/org-admin/auth/mfa/setup/email/request")
    assert requested.status_code == 200, requested.text
    first_code = _latest_mfa_setup_email_code(first_admin)

    client.cookies.clear()
    _login_without_mfa(client, second_admin.id)
    cross_tenant = client.post(
        "/api/org-admin/auth/mfa/setup/email/verify",
        json={"code": first_code},
    )
    assert cross_tenant.status_code == 401

    client.cookies.clear()
    _login_without_mfa(client, first_admin.id)
    # The challenge belongs to the previous session and cannot be transferred
    # even to another cookie for the same administrator.
    cross_session = client.post(
        "/api/org-admin/auth/mfa/setup/email/verify",
        json={"code": first_code},
    )
    assert cross_session.status_code == 401


def test_email_setup_code_is_one_use(client):
    admin = _create_org_admin()
    _login_without_mfa(client, admin.id)
    requested = client.post("/api/org-admin/auth/mfa/setup/email/request")
    assert requested.status_code == 200, requested.text
    current_code = _latest_mfa_setup_email_code(admin)
    verified = client.post(
        "/api/org-admin/auth/mfa/setup/email/verify",
        json={"code": current_code},
    )
    assert verified.status_code == 200, verified.text
    replay = client.post(
        "/api/org-admin/auth/mfa/setup/email/verify",
        json={"code": current_code},
    )
    assert replay.status_code == 401


def test_email_setup_code_expires(client):
    expiring_admin = _create_org_admin(org_id=1)
    _login_without_mfa(client, expiring_admin.id)
    assert client.post("/api/org-admin/auth/mfa/setup/email/request").status_code == 200
    expired_code = _latest_mfa_setup_email_code(expiring_admin)
    db = SessionLocal()
    try:
        challenge = (
            db.query(AdminAuthChallenge)
            .filter(
                AdminAuthChallenge.admin_id == expiring_admin.id,
                AdminAuthChallenge.purpose.like("org_admin_mfa_setup_email:%"),
            )
            .order_by(AdminAuthChallenge.id.desc())
            .first()
        )
        assert challenge is not None
        challenge.expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()
    finally:
        db.close()
    expired = client.post(
        "/api/org-admin/auth/mfa/setup/email/verify",
        json={"code": expired_code},
    )
    assert expired.status_code == 401


def test_mfa_setup_confirmation_cannot_bypass_expired_step_up(client):
    admin = _create_org_admin()
    _login_without_mfa(client, admin.id)
    _authorize_mfa_setup(client, admin)
    setup = client.post("/api/org-admin/auth/mfa/setup")
    assert setup.status_code == 200, setup.text

    db = SessionLocal()
    try:
        session = (
            db.query(OrgAdminSession)
            .filter(OrgAdminSession.admin_id == admin.id)
            .order_by(OrgAdminSession.id.desc())
            .first()
        )
        assert session is not None
        session.mfa_setup_authorized_at = datetime.utcnow() - timedelta(minutes=6)
        db.commit()
    finally:
        db.close()

    totp = _totp_at_timestep(setup.json()["secret"], int(time.time() // 30))
    blocked = client.post(
        "/api/org-admin/auth/mfa/setup/confirm",
        json={"code": totp, "use_recovery_code": False},
    )
    assert blocked.status_code == 403
    db = SessionLocal()
    try:
        factor = (
            db.query(AdminMfaFactor)
            .filter(AdminMfaFactor.admin_id == admin.id)
            .one()
        )
        assert factor.status == "pending"
    finally:
        db.close()


def test_active_mfa_requires_short_lived_challenge_before_session(client):
    admin = _create_org_admin()
    secret, _recovery_codes = _enable_mfa(client, admin.id)
    challenge = _begin_mfa_login(client, admin.id)

    # The setup code cannot be replayed; the adjacent RFC6238 window is valid.
    next_code = _totp_at_timestep(secret, int(time.time() // 30) + 1)
    verified = client.post(
        "/api/org-admin/auth/mfa/verify",
        json={
            "challenge": challenge,
            "code": next_code,
            "use_recovery_code": False,
        },
    )
    assert verified.status_code == 200, verified.text
    assert client.cookies.get("org_admin_session")
    assert client.get("/api/org-admin/auth/me").json()["mfa_enabled"] is True


def test_org_admin_recovery_code_is_single_use(client):
    admin = _create_org_admin()
    _secret, recovery_codes = _enable_mfa(client, admin.id)

    challenge = _begin_mfa_login(client, admin.id)
    first = client.post(
        "/api/org-admin/auth/mfa/verify",
        json={
            "challenge": challenge,
            "code": recovery_codes[0],
            "use_recovery_code": True,
        },
    )
    assert first.status_code == 200, first.text
    client.post("/api/org-admin/auth/logout")

    replay_challenge = _begin_mfa_login(client, admin.id)
    replay = client.post(
        "/api/org-admin/auth/mfa/verify",
        json={
            "challenge": replay_challenge,
            "code": recovery_codes[0],
            "use_recovery_code": True,
        },
    )
    assert replay.status_code == 401


def test_consuming_first_factor_invalidates_other_pending_login_tokens(client):
    admin = _create_org_admin()
    primary = _issue_magic_token(admin.id)
    sibling = _issue_magic_token(admin.id)

    first = client.get(
        f"/api/org-admin/auth/verify?token={primary}",
        follow_redirects=False,
    )
    assert first.status_code == 302
    client.cookies.clear()
    second = client.get(
        f"/api/org-admin/auth/verify?token={sibling}",
        follow_redirects=False,
    )
    assert second.status_code == 400


def test_session_revocation_is_immediate_and_tenant_safe(client):
    first_admin = _create_org_admin()
    second_admin = _create_org_admin()
    first_cookie = _login_without_mfa(client, first_admin.id)
    first_security = client.get("/api/org-admin/auth/security").json()
    first_session_id = first_security["sessions"][0]["id"]

    client.cookies.clear()
    _login_without_mfa(client, second_admin.id)
    cross_tenant = client.delete(f"/api/org-admin/auth/sessions/{first_session_id}")
    assert cross_tenant.status_code == 404

    client.cookies.clear()
    client.cookies.set("org_admin_session", first_cookie)
    revoked = client.delete(f"/api/org-admin/auth/sessions/{first_session_id}")
    assert revoked.status_code == 200, revoked.text

    # Even if a stale signed Starlette session cookie remains, authorization
    # re-checks the persistent DB session and fails immediately.
    client.cookies.set("org_admin_session", first_cookie)
    assert client.get("/api/org-admin/auth/me").status_code == 401


def test_security_endpoint_never_exposes_another_org_admin_sessions(client):
    first_admin = _create_org_admin()
    second_admin = _create_org_admin()
    first_cookie = _login_without_mfa(client, first_admin.id)
    client.cookies.clear()
    _login_without_mfa(client, second_admin.id)

    db = SessionLocal()
    try:
        first_ids = {
            row.id
            for row in db.query(OrgAdminSession)
            .filter(OrgAdminSession.admin_id == first_admin.id)
            .all()
        }
        second_ids = {
            row.id
            for row in db.query(OrgAdminSession)
            .filter(OrgAdminSession.admin_id == second_admin.id)
            .all()
        }
    finally:
        db.close()
    assert first_ids and second_ids and first_ids.isdisjoint(second_ids)

    payload_ids = {
        item["id"]
        for item in client.get("/api/org-admin/auth/security").json()["sessions"]
    }
    assert payload_ids == second_ids
    assert hash_token(first_cookie)


def test_super_admin_can_reset_org_admin_mfa_and_revoke_sessions(client, monkeypatch):
    monkeypatch.setattr(settings, "SUPER_ADMIN_MFA_REQUIRED", False)
    target = _create_org_admin()
    _secret, _codes = _enable_mfa(client, target.id)
    target_cookie = client.cookies.get("org_admin_session")
    assert target_cookie

    login = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )
    assert login.status_code == 200, login.text
    reset = client.post(f"/api/super-admin/org-admins/{target.id}/mfa/reset")
    assert reset.status_code == 200, reset.text
    assert reset.json()["mfa_reset"] is True
    assert reset.json()["revoked_sessions"] >= 1

    db = SessionLocal()
    try:
        assert (
            db.query(AdminMfaFactor)
            .filter(AdminMfaFactor.admin_id == target.id)
            .count()
            == 0
        )
        assert (
            db.query(OperationLog)
            .filter(
                OperationLog.action == "super_admin.org_admin_mfa_reset",
                OperationLog.entity_id == target.id,
                OperationLog.org_id == target.org_id,
            )
            .count()
            == 1
        )
    finally:
        db.close()

    client.cookies.clear()
    client.cookies.set("org_admin_session", target_cookie)
    assert client.get("/api/org-admin/auth/me").status_code == 401
