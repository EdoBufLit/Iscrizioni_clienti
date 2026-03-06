from datetime import datetime
from pathlib import Path
import uuid

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import AdminRole, AdminUser, IngestRateLimit, Member, MemberStatus, Organization
from app.security import get_password_hash
from app.services.card_verification import build_card_verification_token


def _ensure_member_with_card(db):
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Security Org {suffix}",
        slug=f"security-org-{suffix}",
        is_active=True,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    member = Member(
        org_id=org.id,
        first_name="Mario",
        last_name="Security",
        email=f"security.member.{suffix}@example.com",
        password_hash=get_password_hash("TestPass123!"),
        status=MemberStatus.ACTIVE,
        card_no=9000,
        card_year=datetime.utcnow().year,
        joined_at=datetime.utcnow(),
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return org, member


def test_public_card_verify_rate_limit_enforced(client):
    client.cookies.clear()
    db = SessionLocal()
    try:
        org, member = _ensure_member_with_card(db)
        token = build_card_verification_token(
            member_id=member.id,
            org_id=org.id,
            card_number=member.card_no,
            card_year=member.card_year,
        )

        db.query(IngestRateLimit).filter(
            IngestRateLimit.org_slug == "cards:verify",
        ).delete(synchronize_session=False)
        db.commit()

        old_max = settings.CARD_PUBLIC_RATE_LIMIT_MAX_REQUESTS
        old_window = settings.CARD_PUBLIC_RATE_LIMIT_WINDOW_SECONDS
        settings.CARD_PUBLIC_RATE_LIMIT_MAX_REQUESTS = 2
        settings.CARD_PUBLIC_RATE_LIMIT_WINDOW_SECONDS = 300

        try:
            first = client.get(f"/api/cards/verify/{token}?format=json")
            second = client.get(f"/api/cards/verify/{token}?format=json")
            blocked = client.get(f"/api/cards/verify/{token}?format=json")

            assert first.status_code == 200, first.text
            assert second.status_code == 200, second.text
            assert blocked.status_code == 429, blocked.text
        finally:
            settings.CARD_PUBLIC_RATE_LIMIT_MAX_REQUESTS = old_max
            settings.CARD_PUBLIC_RATE_LIMIT_WINDOW_SECONDS = old_window
    finally:
        db.close()


def test_download_page_embeds_qr_without_external_service(client):
    client.cookies.clear()
    db = SessionLocal()
    try:
        org, member = _ensure_member_with_card(db)
        token = build_card_verification_token(
            member_id=member.id,
            org_id=org.id,
            card_number=member.card_no,
            card_year=member.card_year,
        )

        response = client.get(f"/api/cards/{token}/download")
        assert response.status_code == 200, response.text
        assert "data:image/png;base64," in response.text
        assert "api.qrserver.com" not in response.text
    finally:
        db.close()


def test_csrf_blocks_cross_origin_for_authenticated_session(client):
    client.cookies.clear()
    db = SessionLocal()
    try:
        _org, member = _ensure_member_with_card(db)

        login = client.post(
            "/api/auth/login",
            data={"email": member.email, "password": "TestPass123!"},
        )
        assert login.status_code == 200, login.text

        blocked = client.post(
            "/api/auth/change-password",
            data={"new_password": "AnotherPass123!"},
            headers={"Origin": "https://evil.example"},
        )
        assert blocked.status_code == 403, blocked.text
        assert "CSRF blocked" in blocked.json()["detail"]

        allowed = client.post(
            "/api/auth/change-password",
            data={"new_password": "AnotherPass123!"},
            headers={"Origin": settings.BASE_URL.rstrip("/")},
        )
        assert allowed.status_code == 200, allowed.text
    finally:
        client.cookies.clear()
        db.close()


def test_security_headers_include_csp(client):
    client.cookies.clear()
    response = client.get("/health")
    assert response.status_code == 200
    assert "default-src 'self'" in response.headers.get("content-security-policy", "")
    assert response.headers.get("x-frame-options") == "DENY"
    assert response.headers.get("x-content-type-options") == "nosniff"


def test_public_organization_detail_hides_inactive_org(client):
    client.cookies.clear()
    db = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:8]
        org = Organization(
            name=f"Inactive Org {suffix}",
            slug=f"inactive-org-{suffix}",
            is_active=False,
        )
        db.add(org)
        db.commit()
        db.refresh(org)

        response = client.get(f"/api/organizations/{org.slug}")
        assert response.status_code == 404
    finally:
        db.close()


def test_public_uploads_route_blocks_private_files_but_keeps_wallet_assets(client):
    uploads_dir = Path(settings.UPLOAD_DIR)
    blocked_file = uploads_dir / "security-audit-probe.txt"
    public_file = uploads_dir / "org" / "999999" / "wallet" / "security-logo.txt"

    blocked_file.parent.mkdir(parents=True, exist_ok=True)
    public_file.parent.mkdir(parents=True, exist_ok=True)
    blocked_file.write_text("blocked", encoding="utf-8")
    public_file.write_text("public-wallet", encoding="utf-8")

    try:
        blocked = client.get("/uploads/security-audit-probe.txt")
        allowed = client.get("/uploads/org/999999/wallet/security-logo.txt")

        assert blocked.status_code == 404, blocked.text
        assert allowed.status_code == 200, allowed.text
        assert allowed.text == "public-wallet"
    finally:
        blocked_file.unlink(missing_ok=True)
        public_file.unlink(missing_ok=True)


def test_legacy_admin_login_requires_active_super_admin(client):
    client.cookies.clear()
    db = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:8]
        org = Organization(
            name=f"Legacy Admin Org {suffix}",
            slug=f"legacy-admin-org-{suffix}",
            is_active=True,
        )
        db.add(org)
        db.commit()
        db.refresh(org)

        org_admin = AdminUser(
            email=f"legacy-org-admin-{suffix}@example.com",
            password_hash=get_password_hash("TestPass123!"),
            role=AdminRole.ORG_ADMIN,
            org_id=org.id,
            is_active=True,
        )
        disabled_super_admin = AdminUser(
            email=f"legacy-disabled-sa-{suffix}@example.com",
            password_hash=get_password_hash("TestPass123!"),
            role=AdminRole.SUPER_ADMIN,
            org_id=None,
            is_active=False,
        )
        db.add_all([org_admin, disabled_super_admin])
        db.commit()

        allowed = client.post(
            "/admin/login",
            data={"email": "admin@assonam.it", "password": "admin"},
            follow_redirects=False,
        )
        blocked_org_admin = client.post(
            "/admin/login",
            data={"email": org_admin.email, "password": "TestPass123!"},
            follow_redirects=False,
        )
        blocked_disabled = client.post(
            "/admin/login",
            data={"email": disabled_super_admin.email, "password": "TestPass123!"},
            follow_redirects=False,
        )

        assert allowed.status_code == 302, allowed.text
        assert blocked_org_admin.status_code == 401, blocked_org_admin.text
        assert blocked_disabled.status_code == 401, blocked_disabled.text
    finally:
        client.cookies.clear()
        db.close()


def test_whatsapp_webhook_rejects_invalid_signature_when_configured(client, monkeypatch):
    pytest.importorskip("twilio.request_validator")

    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "test-twilio-auth-token")
    response = client.post(
        "/api/whatsapp/bot",
        data={"From": "whatsapp:+3906000000", "Body": "ciao"},
        headers={"X-Twilio-Signature": "invalid-signature"},
    )
    assert response.status_code == 403, response.text
