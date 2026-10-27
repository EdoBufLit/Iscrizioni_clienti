from __future__ import annotations

import base64
from datetime import datetime, timedelta
import json
import uuid

from fastapi import HTTPException
from itsdangerous import TimestampSigner
import pytest
from starlette.requests import Request

from app.config import settings
from app.db import SessionLocal
from app.models import Member, MemberStatus, Organization, Token, TokenType
from app.routes import member as member_routes
from app.security import get_password_hash, verify_password
from app.services.member_sessions import (
    issue_member_auth_token,
    replace_member_password,
)
from app.utils import hash_token


@pytest.fixture(autouse=True)
def clear_browser_auth(client):
    client.cookies.clear()
    yield
    client.cookies.clear()


@pytest.fixture
def account():
    with SessionLocal() as db:
        suffix = uuid.uuid4().hex
        org = Organization(name="Session revocation", slug=f"auth-{suffix}", is_active=True)
        db.add(org)
        db.flush()
        member = Member(
            org_id=org.id,
            first_name="Anna",
            last_name="Sessione",
            email=f"auth-{suffix}@example.com",
            password_hash=get_password_hash("OriginalPass123!"),
            status=MemberStatus.ACTIVE,
            card_no=910001,
            card_year=datetime.utcnow().year,
            joined_at=datetime.utcnow(),
            membership_type="annual",
        )
        db.add(member)
        db.commit()
        yield db, member


def _cookie(payload):
    encoded = base64.b64encode(json.dumps(payload).encode("utf-8"))
    return TimestampSigner(settings.SECRET_KEY).sign(encoded).decode("utf-8")


def _set_cookie(client, cookie):
    client.cookies.clear()
    client.cookies.set("session", cookie, domain="testserver.local", path="/")


def _proof(db, member, purpose):
    raw, token = issue_member_auth_token(
        db, member=member, purpose=purpose,
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    )
    db.commit()
    return raw, token.id


def _login(client, member):
    response = client.post(
        "/api/auth/login",
        data={"email": member.email, "password": "OriginalPass123!"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["authenticated"] is True
    return client.cookies.get("session")


def test_password_reset_revokes_cookies_and_every_older_authentication_proof(client, account):
    db, member = account
    old_cookie = _login(client, member)
    proofs = {
        purpose: _proof(db, member, purpose)
        for purpose in (
            TokenType.LOGIN_MAGIC_LINK, TokenType.PASSWORD_RESET,
            TokenType.REGISTRATION_CONTINUATION,
        )
    }
    client.cookies.clear()
    reset = client.post(
        "/api/auth/password-reset/confirm",
        data={"token": proofs[TokenType.PASSWORD_RESET][0],
              "new_password": "ResetPass123!", "confirm_password": "ResetPass123!"},
    )
    assert reset.status_code == 200, reset.text
    assert client.get("/api/auth/me").status_code == 401
    db.refresh(member)
    assert member.auth_version == 2
    assert verify_password("ResetPass123!", member.password_hash)
    for _raw, token_id in proofs.values():
        assert db.get(Token, token_id).used_at is not None

    for endpoint in (
        "/api/auth/me", "/api/member/membership", "/api/me/onboarding",
        "/api/member/documents",
    ):
        _set_cookie(client, old_cookie)
        assert client.get(endpoint).status_code == 401, endpoint
    _set_cookie(client, old_cookie)
    assert client.get("/api/auth/whoami").json() == {"authenticated": False}
    _set_cookie(client, old_cookie)
    assert client.post("/api/auth/change-password", data={"new_password": "Attacker123!"}).status_code == 401
    client.cookies.clear()
    old_link = client.get(
        f"/member/auth?token={proofs[TokenType.LOGIN_MAGIC_LINK][0]}",
        follow_redirects=False,
    )
    assert old_link.headers["location"] == "/login"
    replay = client.post(
        "/api/auth/password-reset/confirm",
        data={"token": proofs[TokenType.PASSWORD_RESET][0],
              "new_password": "Attacker123!", "confirm_password": "Attacker123!"},
    )
    assert replay.status_code == 400
    _set_cookie(client, _cookie({
        "registration_continuations": {
            str(member.id): proofs[TokenType.REGISTRATION_CONTINUATION][0],
        },
    }))
    registration = client.post(
        "/api/auth/register",
        data={"email": member.email, "org_slug": member.organization.slug,
              "first_name": member.first_name, "last_name": member.last_name,
              "password": "Attacker123!"},
    )
    assert registration.status_code == 200
    assert registration.json()["authenticated"] is False
    db.refresh(member)
    assert member.auth_version == 2
    assert verify_password("ResetPass123!", member.password_hash)

    fresh_link, _ = _proof(db, member, TokenType.LOGIN_MAGIC_LINK)
    login = client.get(f"/member/auth?token={fresh_link}", follow_redirects=False)
    assert login.headers["location"] == "/dashboard"
    assert client.get("/api/auth/me").status_code == 200


def test_password_change_retains_current_browser_and_revokes_other_bearers(client, account):
    db, member = account
    old_cookie = _login(client, member)
    _raw, token_id = _proof(db, member, TokenType.LOGIN_MAGIC_LINK)
    changed = client.post("/api/auth/change-password", data={"new_password": "ChangedPass123!"})
    assert changed.status_code == 200, changed.text
    new_cookie = client.cookies.get("session")
    assert client.get("/api/auth/me").status_code == 200
    db.refresh(member)
    assert member.auth_version == 2
    assert db.get(Token, token_id).used_at is not None
    _set_cookie(client, old_cookie)
    assert client.get("/api/auth/me").status_code == 401
    _set_cookie(client, new_cookie)
    assert client.get("/api/auth/me").status_code == 200


def test_registration_password_setup_rotates_epoch_and_preserves_only_new_browser(client, account):
    db, member = account
    old_cookie = _login(client, member)
    raw, _token_id = _proof(db, member, TokenType.REGISTRATION_CONTINUATION)
    _set_cookie(client, _cookie({
        "member_id": member.id, "member_auth_version": member.auth_version,
        "registration_continuations": {str(member.id): raw},
    }))
    response = client.post("/api/auth/register", data={
        "email": member.email, "org_slug": member.organization.slug,
        "first_name": member.first_name, "last_name": member.last_name,
        "password": "RegistrationPass123!",
    })
    assert response.status_code == 200, response.text
    assert response.json()["authenticated"] is True
    db.refresh(member)
    assert member.auth_version == 2
    assert verify_password("RegistrationPass123!", member.password_hash)
    assert client.get("/api/auth/me").status_code == 200
    _set_cookie(client, old_cookie)
    assert client.get("/api/auth/me").status_code == 401


@pytest.mark.parametrize("version", [None, "1", True, 0, 2])
def test_legacy_and_invalid_cookie_epochs_fail_closed_without_clearing_other_context(client, account, version):
    _db, member = account
    payload = {"member_id": member.id, "org_admin_id": 987654, "registration_continuations": {"other": "keep"}}
    if version is not None:
        payload["member_auth_version"] = version
    _set_cookie(client, _cookie(payload))
    assert client.get("/api/auth/whoami").json() == {"authenticated": False}
    signed = client.cookies.get("session")
    remaining = json.loads(base64.b64decode(TimestampSigner(settings.SECRET_KEY).unsign(signed)))
    assert remaining["org_admin_id"] == 987654
    assert remaining["registration_continuations"] == {"other": "keep"}
    assert "member_id" not in remaining
    assert "member_auth_version" not in remaining


def test_unversioned_login_proof_is_not_silently_upgraded(client, account):
    db, member = account
    raw = f"unversioned-{uuid.uuid4().hex}"
    db.add(Token(member_id=member.id, purpose=TokenType.LOGIN_MAGIC_LINK,
                 token_hash=hash_token(raw), expires_at=datetime.utcnow() + timedelta(minutes=5)))
    db.commit()
    response = client.get(f"/member/auth?token={raw}", follow_redirects=False)
    assert response.headers["location"] == "/login"
    assert client.get("/api/auth/me").status_code == 401


def test_existing_request_cannot_change_password_after_another_rotation(account):
    db, member = account
    stale_version = member.auth_version
    with SessionLocal() as writer:
        replace_member_password(db=writer, member_id=member.id, expected_version=stale_version,
                                password_hash=get_password_hash("FreshPass123!"))
        writer.commit()
    with pytest.raises(HTTPException) as failure:
        replace_member_password(db=db, member_id=member.id, expected_version=stale_version,
                                password_hash=get_password_hash("Attacker123!"))
    assert failure.value.status_code == 401
    db.rollback()
    db.refresh(member)
    assert member.auth_version == 2
    assert verify_password("FreshPass123!", member.password_hash)


def test_failed_reset_rolls_back_proof_consumption(client, account, monkeypatch):
    db, member = account
    raw, token_id = _proof(db, member, TokenType.PASSWORD_RESET)
    def fail_hash(_password):
        raise RuntimeError("synthetic hash failure")
    monkeypatch.setattr(member_routes, "get_password_hash", fail_hash)
    with pytest.raises(RuntimeError, match="synthetic hash failure"):
        client.post("/api/auth/password-reset/confirm", data={
            "token": raw, "new_password": "ResetPass123!", "confirm_password": "ResetPass123!",
        })
    db.expire_all()
    assert db.get(Token, token_id).used_at is None
    assert db.get(Member, member.id).auth_version == 1


def test_every_shared_issuer_snapshots_the_current_epoch(account):
    from app.routes.join import _new_registration_continuation
    from app.routes.org_admin import _send_member_magic_link
    from app.services.integration_issuer import _build_magic_link
    from app.services.member_card_delivery import _build_member_magic_link
    db, member = account
    member.auth_version = 4
    db.commit()
    request = Request({"type": "http", "method": "GET", "path": "/", "root_path": "",
                       "scheme": "http", "server": ("testserver", 80),
                       "headers": [(b"host", b"testserver")], "session": {}})
    _new_registration_continuation(db, member)
    _build_magic_link(db, member.id, "http://testserver")
    _build_member_magic_link(db, member.id, "http://testserver")
    _send_member_magic_link(db, request, member)
    member_routes._enqueue_member_password_reset(request, db, member, now=datetime.utcnow())
    db.flush()
    tokens = db.query(Token).filter_by(member_id=member.id).all()
    assert len(tokens) == 5
    assert {token.auth_version for token in tokens} == {4}


def test_expired_annual_account_keeps_renewal_access_with_versioned_cookie(client, account):
    db, member = account
    member.status = MemberStatus.EXPIRED
    member.card_year = datetime.utcnow().year - 1
    db.commit()
    _login(client, member)
    assert client.get("/api/auth/me").status_code == 200
    assert client.get("/api/member/membership").status_code == 200
    assert client.get("/api/me/onboarding").status_code == 200
