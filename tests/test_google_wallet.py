import base64
import json
from datetime import datetime
import uuid

import pytest

from app.db import SessionLocal
from app.models import Member, MemberStatus, Organization
from app.security import get_password_hash
from app.config import settings
from app.services.google_wallet import (
    GoogleWalletSaveLinkResult,
    _build_generic_object_payload,
    ensure_google_wallet_generic_object,
    load_google_wallet_service_account_info,
)


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _create_active_member(db, *, slug_prefix: str = "wallet-test") -> Member:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Wallet Test Org {suffix}",
        slug=f"{slug_prefix}-{suffix}",
        is_active=True,
        privacy_version="v1",
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    member = Member(
        org_id=org.id,
        first_name="Wallet",
        last_name="Member",
        email=f"wallet.member.{suffix}@example.com",
        password_hash=get_password_hash("TestPass123!"),
        status=MemberStatus.ACTIVE,
        card_no=8100 + int(suffix[:2], 16),
        card_year=datetime.utcnow().year,
        joined_at=datetime.utcnow(),
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def _force_public_wallet_urls(monkeypatch):
    import app.services.google_wallet as wallet_service

    monkeypatch.setattr(wallet_service, "_build_backend_base_url", lambda: "https://assonam.test")
    monkeypatch.setattr(wallet_service, "_build_frontend_base_url", lambda: "https://assonam.test")


def test_google_wallet_loader_prefers_file_over_b64(monkeypatch, tmp_path):
    file_info = {
        "type": "service_account",
        "client_email": "file@example.iam.gserviceaccount.com",
        "private_key": "-----BEGIN PRIVATE KEY-----\\nFILE\\n-----END PRIVATE KEY-----\\n",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
    b64_info = {
        "type": "service_account",
        "client_email": "b64@example.iam.gserviceaccount.com",
        "private_key": "-----BEGIN PRIVATE KEY-----\\nB64\\n-----END PRIVATE KEY-----\\n",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
    json_path = tmp_path / "google-wallet-sa.json"
    json_path.write_text(json.dumps(file_info), encoding="utf-8")

    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", str(json_path))
    monkeypatch.setenv(
        "GOOGLE_WALLET_SA_B64",
        base64.b64encode(json.dumps(b64_info).encode("utf-8")).decode("ascii"),
    )
    monkeypatch.setattr(settings, "GOOGLE_APPLICATION_CREDENTIALS", "", raising=False)
    monkeypatch.setattr(settings, "GOOGLE_WALLET_SA_B64", "", raising=False)

    loaded = load_google_wallet_service_account_info()
    assert loaded["client_email"] == file_info["client_email"]


def test_google_wallet_loader_uses_b64_fallback(monkeypatch):
    info = {
        "type": "service_account",
        "client_email": "fallback@example.iam.gserviceaccount.com",
        "private_key": "-----BEGIN PRIVATE KEY-----\\nB64\\n-----END PRIVATE KEY-----\\n",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    monkeypatch.setenv(
        "GOOGLE_WALLET_SA_B64",
        base64.b64encode(json.dumps(info).encode("utf-8")).decode("ascii"),
    )
    monkeypatch.setattr(settings, "GOOGLE_APPLICATION_CREDENTIALS", "", raising=False)
    monkeypatch.setattr(settings, "GOOGLE_WALLET_SA_B64", "", raising=False)

    loaded = load_google_wallet_service_account_info()
    assert loaded["client_email"] == info["client_email"]


def test_member_wallet_google_save_link_without_credentials_returns_500(client, db, monkeypatch):
    member = _create_active_member(db, slug_prefix="wallet-no-creds")

    monkeypatch.setenv("GOOGLE_WALLET_ISSUER_ID", "1234567890")
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    monkeypatch.delenv("GOOGLE_WALLET_SA_B64", raising=False)
    monkeypatch.setattr(settings, "GOOGLE_WALLET_ISSUER_ID", "", raising=False)
    monkeypatch.setattr(settings, "GOOGLE_APPLICATION_CREDENTIALS", "", raising=False)
    monkeypatch.setattr(settings, "GOOGLE_WALLET_SA_B64", "", raising=False)

    login_res = client.post("/api/auth/login", data={"email": member.email, "password": "TestPass123!"})
    assert login_res.status_code == 200

    res = client.post("/api/me/wallet/google/save-link")
    assert res.status_code == 500, res.text
    assert "Google Wallet credentials not configured" in res.json()["detail"]

    db.refresh(member)
    assert member.google_wallet_last_error is not None


def test_member_wallet_google_save_link_returns_url_with_mock(client, db, monkeypatch):
    member = _create_active_member(db, slug_prefix="wallet-mock")

    def _fake_generate(_member):
        return GoogleWalletSaveLinkResult(
            url="https://pay.google.com/gp/v/save/mock-token",
            class_id="issuer.assonam_membership_generic_v1",
            object_id=f"issuer.{_member.id}.{_member.card_year}",
        )

    import app.routes.member as member_routes

    monkeypatch.setattr(member_routes, "generate_google_wallet_save_link_for_member", _fake_generate)

    login_res = client.post("/api/auth/login", data={"email": member.email, "password": "TestPass123!"})
    assert login_res.status_code == 200

    res = client.post("/api/me/wallet/google/save-link")
    assert res.status_code == 200, res.text
    payload = res.json()

    assert payload["url"].startswith("https://pay.google.com/gp/v/save/")
    assert payload["classId"] == "issuer.assonam_membership_generic_v1"
    assert "objectId" in payload

    db.refresh(member)
    assert member.google_wallet_class_id == payload["classId"]
    assert member.google_wallet_object_id == payload["objectId"]
    assert member.google_wallet_last_error is None
    assert member.google_wallet_last_synced_at is not None
    assert member.google_wallet_added_at is not None


def test_google_wallet_object_create_409_is_handled_idempotently(db, monkeypatch):
    member = _create_active_member(db, slug_prefix="wallet-409")

    class _Resp:
        def __init__(self, status_code: int, text: str = ""):
            self.status_code = status_code
            self.text = text

    calls: list[tuple[str, str]] = []
    responses = iter(
        [
            _Resp(404, "not found"),   # GET object
            _Resp(409, "already exists"),  # POST create (race)
            _Resp(200, "{}"),  # PATCH after conflict
        ]
    )

    import app.services.google_wallet as wallet_service

    def _fake_wallet_request(*, method, path, access_token, payload=None):
        calls.append((method, path))
        return next(responses)

    monkeypatch.setattr(wallet_service, "_wallet_request", _fake_wallet_request)
    monkeypatch.setattr(
        wallet_service,
        "_build_generic_object_payload",
        lambda **kwargs: {"id": kwargs["object_id"], "classId": kwargs["class_id"]},
    )

    payload = ensure_google_wallet_generic_object(
        member=member,
        class_id="issuer.assonam_membership_v1",
        object_id=f"issuer.test.{member.id}.{member.card_year}",
        access_token="fake-token",
    )

    assert payload["classId"] == "issuer.assonam_membership_v1"
    assert any(method == "PATCH" for method, _ in calls)


def test_google_wallet_object_payload_applies_org_branding(db, monkeypatch):
    member = _create_active_member(db, slug_prefix="wallet-branding-custom")
    org = member.organization
    assert org is not None
    org.wallet_bg_color = "#123ABC"
    org.wallet_logo_url = "https://cdn.example.com/wallet/logo.png"
    org.wallet_hero_image_url = "https://cdn.example.com/wallet/hero.png"
    org.wallet_title_override = "Golden Age Club"
    org.wallet_is_test_prefix = False
    db.commit()

    _force_public_wallet_urls(monkeypatch)
    monkeypatch.setattr(settings, "WALLET_DEMO_MODE", False, raising=False)

    payload = _build_generic_object_payload(
        member=member,
        class_id="issuer.assonam_membership_v1",
        object_id=f"issuer.branding.{member.id}.{member.card_year}",
    )

    assert payload["hexBackgroundColor"] == "#123ABC"
    assert payload["cardTitle"]["defaultValue"]["value"] == "Golden Age Club"
    assert payload["logo"]["sourceUri"]["uri"] == "https://cdn.example.com/wallet/logo.png"
    assert payload["heroImage"]["sourceUri"]["uri"] == "https://cdn.example.com/wallet/hero.png"
    assert any(item["id"] == "validity" for item in payload["textModulesData"])


def test_google_wallet_object_payload_uses_assonam_fallback_without_org_branding(db, monkeypatch):
    member = _create_active_member(db, slug_prefix="wallet-branding-fallback")
    _force_public_wallet_urls(monkeypatch)
    monkeypatch.setattr(settings, "WALLET_DEMO_MODE", False, raising=False)

    payload = _build_generic_object_payload(
        member=member,
        class_id="issuer.assonam_membership_v1",
        object_id=f"issuer.fallback.{member.id}.{member.card_year}",
    )

    assert payload["hexBackgroundColor"] == "#0B3C75"
    assert payload["cardTitle"]["defaultValue"]["value"] == "ASSO.N.A.M."
    assert payload["logo"]["sourceUri"]["uri"].endswith("/logo-transparent.png")
    assert "heroImage" not in payload


def test_google_wallet_object_payload_uses_oasi2_branding_fallback(db, monkeypatch):
    member = _create_active_member(db, slug_prefix="wallet-branding-oasi2")
    org = member.organization
    assert org is not None
    org.slug = "oasi-2"
    org.wallet_bg_color = None
    org.wallet_logo_url = None
    org.wallet_hero_image_url = None
    org.wallet_title_override = None

    _force_public_wallet_urls(monkeypatch)
    monkeypatch.setattr(settings, "WALLET_DEMO_MODE", False, raising=False)

    payload = _build_generic_object_payload(
        member=member,
        class_id="issuer.assonam_membership_v1",
        object_id=f"issuer.oasi2.{member.id}.{member.card_year}",
    )

    assert payload["hexBackgroundColor"] == "#0B3C75"
    assert payload["cardTitle"]["defaultValue"]["value"] == "Golden Age Club - Speakeasy"
    assert payload["logo"]["sourceUri"]["uri"].endswith("/static/card-logos/oasi-2.png")
    assert payload["heroImage"]["sourceUri"]["uri"].endswith("/static/wallet-heroes/oasi-2-hero.png")
