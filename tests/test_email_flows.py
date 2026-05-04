import pytest
from sqlalchemy import func
import uuid
from app.config import settings
from app.db import SessionLocal
from app.utils import get_captured_emails, clear_captured_emails, generate_token, hash_token
from app.models import Member, MemberStatus, AdminUser, AdminRole, Organization, CardBatch, Token, TokenType
from app.security import get_password_hash, verify_password
from datetime import datetime, timedelta
from unittest.mock import patch

# Fixture to enable test email mode, clear capture, and disable rate limiting
@pytest.fixture(autouse=True)
def setup_test_env():
    # Email mode
    original_mode = settings.EMAIL_MODE
    settings.EMAIL_MODE = "test"
    clear_captured_emails()

    # Disable rate limiter
    with patch("app.middleware.RateLimiter.check"):
        yield

    settings.EMAIL_MODE = original_mode
    clear_captured_emails()

def test_member_magic_link_flow(client, drain_email_outbox):
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

    db = SessionLocal()
    try:
        org = db.query(Organization).filter(Organization.slug == "my-association").first()
        if org is None:
            org = Organization(name="My Association", slug="my-association", is_active=True)
            db.add(org)
            db.commit()
            db.refresh(org)

        batch = db.query(CardBatch).filter(CardBatch.org_id == org.id).first()
        if batch is None:
            batch = CardBatch(org_id=org.id, start_no=4500, end_no=4550, next_no=4500)
            db.add(batch)
            db.commit()

        max_card = db.query(func.max(Member.card_no)).filter(Member.org_id == org.id).scalar() or 4499
        next_card = int(max_card) + 1
        member = db.query(Member).filter(Member.email == email).first()
        if member is None:
            member = Member(
                org_id=org.id,
                first_name="Test",
                last_name="Member",
                email=email,
                phone="123",
                fiscal_code="CF123",
                status=MemberStatus.ACTIVE,
                card_no=next_card,
                card_year=datetime.utcnow().year,
                joined_at=datetime.utcnow(),
                signup_ip="127.0.0.1",
                signup_user_agent="pytest",
            )
            db.add(member)
        else:
            member.org_id = org.id
            member.first_name = "Test"
            member.last_name = "Member"
            member.status = MemberStatus.ACTIVE
            member.card_no = member.card_no or next_card
            member.card_year = datetime.utcnow().year
            member.deleted_at = None
        db.commit()
    finally:
        db.close()

    # Now valid login request (case insensitive)
    clear_captured_emails()
    res = client.post("/api/auth/login", data={"email": " Test.Member@Example.com "})
    assert res.status_code == 200
    drain_email_outbox()

    # Assert email captured
    captured = get_captured_emails()
    assert len(captured) == 1
    assert (captured[0]["to"] or "").lower() == email

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


def test_member_password_reset_flow_is_one_time_and_non_enumerating(client, drain_email_outbox):
    unknown_res = client.post(
        "/api/auth/password-reset/request",
        data={"email": f"missing.{uuid.uuid4().hex[:8]}@example.com"},
    )
    assert unknown_res.status_code == 200
    drain_email_outbox()
    assert len(get_captured_emails()) == 0

    email = f"reset.member.{uuid.uuid4().hex[:8]}@example.com"
    db = SessionLocal()
    try:
        org = db.query(Organization).filter(Organization.slug == "my-association").first()
        if org is None:
            org = Organization(name="My Association", slug="my-association", is_active=True)
            db.add(org)
            db.commit()
            db.refresh(org)

        max_card = db.query(func.max(Member.card_no)).filter(Member.org_id == org.id).scalar() or 4599
        member = Member(
            org_id=org.id,
            first_name="Reset",
            last_name="Member",
            email=email,
            phone="123",
            fiscal_code=f"RST{uuid.uuid4().hex[:8]}",
            status=MemberStatus.ACTIVE,
            card_no=int(max_card) + 1,
            card_year=datetime.utcnow().year,
            joined_at=datetime.utcnow(),
            password_hash=get_password_hash("old-password"),
            signup_ip="127.0.0.1",
            signup_user_agent="pytest",
        )
        db.add(member)
        db.commit()
        member_id = member.id
    finally:
        db.close()

    clear_captured_emails()
    res = client.post("/api/auth/password-reset/request", data={"email": f"  {email.upper()}  "})
    assert res.status_code == 200
    drain_email_outbox()

    captured = get_captured_emails()
    assert len(captured) == 1
    assert (captured[0]["to"] or "").lower() == email
    assert "/recupera-password?token=" in captured[0]["body"]

    import re

    match = re.search(r"token=([a-zA-Z0-9_-]+)", captured[0]["body"])
    assert match
    token = match.group(1)

    short_res = client.post(
        "/api/auth/password-reset/confirm",
        data={"token": token, "new_password": "short", "confirm_password": "short"},
    )
    assert short_res.status_code == 400

    confirm_res = client.post(
        "/api/auth/password-reset/confirm",
        data={
            "token": token,
            "new_password": "new-password",
            "confirm_password": "new-password",
        },
    )
    assert confirm_res.status_code == 200

    reuse_res = client.post(
        "/api/auth/password-reset/confirm",
        data={
            "token": token,
            "new_password": "another-password",
            "confirm_password": "another-password",
        },
    )
    assert reuse_res.status_code == 400

    db = SessionLocal()
    try:
        refreshed = db.query(Member).filter(Member.id == member_id).first()
        assert refreshed is not None
        assert verify_password("new-password", refreshed.password_hash)
    finally:
        db.close()

    login_res = client.post(
        "/api/auth/login",
        data={"email": email, "password": "new-password"},
    )
    assert login_res.status_code == 200
    assert login_res.json()["authenticated"] is True


def test_member_password_reset_expired_token_fails(client):
    db = SessionLocal()
    token_str = generate_token()
    try:
        org = db.query(Organization).filter(Organization.slug == "my-association").first()
        if org is None:
            org = Organization(name="My Association", slug="my-association", is_active=True)
            db.add(org)
            db.commit()
            db.refresh(org)
        member = Member(
            org_id=org.id,
            first_name="Expired",
            last_name="Reset",
            email=f"expired.reset.{uuid.uuid4().hex[:8]}@example.com",
            status=MemberStatus.ACTIVE,
            card_no=(db.query(func.max(Member.card_no)).filter(Member.org_id == org.id).scalar() or 4699) + 1,
            card_year=datetime.utcnow().year,
            joined_at=datetime.utcnow(),
            password_hash=get_password_hash("old-password"),
            signup_ip="127.0.0.1",
            signup_user_agent="pytest",
        )
        db.add(member)
        db.flush()
        db.add(
            Token(
                member_id=member.id,
                purpose=TokenType.PASSWORD_RESET,
                token_hash=hash_token(token_str),
                expires_at=datetime.utcnow() - timedelta(minutes=1),
            )
        )
        db.commit()
    finally:
        db.close()

    res = client.post(
        "/api/auth/password-reset/confirm",
        data={
            "token": token_str,
            "new_password": "new-password",
            "confirm_password": "new-password",
        },
    )
    assert res.status_code == 400

def test_org_admin_magic_link_flow(client, drain_email_outbox):
    # 1. Setup Org Admin
    # Login as super admin to create it
    client.post("/api/super-admin/auth/login", json={"email": "admin@assonam.it", "password": "admin"})

    # Create org admin
    email = f"org.admin.{uuid.uuid4().hex[:8]}@example.com"
    create_res = client.post("/api/super-admin/org-admins", json={"email": email, "org_id": 1})
    assert create_res.status_code == 200
    drain_email_outbox()
    client.post("/api/super-admin/auth/logout")

    clear_captured_emails()

    # 2. Request Magic Link
    res = client.post("/api/org-admin/auth/magic-link", data={"email": email})
    assert res.status_code == 200
    drain_email_outbox()

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


def test_org_admin_magic_link_normalizes_email_and_logs_flow(
    client, drain_email_outbox, caplog
):
    caplog.set_level("INFO")
    client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )

    email = f"mixed.admin.{uuid.uuid4().hex[:8]}@example.com"
    create_res = client.post(
        "/api/super-admin/org-admins", json={"email": email, "org_id": 1}
    )
    assert create_res.status_code == 200
    drain_email_outbox()
    client.post("/api/super-admin/auth/logout")

    clear_captured_emails()
    caplog.clear()

    res = client.post(
        "/api/org-admin/auth/magic-link",
        data={"email": f"  {email.upper()}  "},
    )
    assert res.status_code == 200
    drain_email_outbox()

    captured = get_captured_emails()
    assert len(captured) == 1
    assert captured[0]["to"] == email
    assert "org_admin_magic_link_request_received" in caplog.text
    assert "normalization_changed=True" in caplog.text
    assert "org_admin_magic_link_send_enqueued" in caplog.text


def test_org_admin_inactive_magic_link_is_logged_without_enqueue(
    client, drain_email_outbox, caplog
):
    caplog.set_level("INFO")
    client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )

    email = f"inactive.admin.{uuid.uuid4().hex[:8]}@example.com"
    create_res = client.post(
        "/api/super-admin/org-admins", json={"email": email, "org_id": 1}
    )
    assert create_res.status_code == 200
    admin_id = create_res.json()["id"]
    drain_email_outbox()

    db = SessionLocal()
    try:
        admin = db.query(AdminUser).filter(AdminUser.id == admin_id).first()
        assert admin is not None
        admin.is_active = False
        db.commit()
    finally:
        db.close()

    client.post("/api/super-admin/auth/logout")
    clear_captured_emails()
    caplog.clear()

    res = client.post("/api/org-admin/auth/magic-link", data={"email": email})
    assert res.status_code == 200
    drain_email_outbox()

    assert len(get_captured_emails()) == 0
    assert "org_admin_magic_link_blocked" in caplog.text
    assert "block_reason=admin_inactive" in caplog.text

def test_org_admin_deleted_flow(client):
    # Login as super admin
    client.post("/api/super-admin/auth/login", json={"email": "admin@assonam.it", "password": "admin"})

    # Create org admin
    email = f"deleted.admin.{uuid.uuid4().hex[:8]}@example.com"
    create_res = client.post("/api/super-admin/org-admins", json={"email": email, "org_id": 1})
    admin_id = create_res.json()["id"]

    # Create another admin so we can delete this one (last admin check)
    client.post("/api/super-admin/org-admins", json={"email": f"other.{uuid.uuid4().hex[:8]}@example.com", "org_id": 1})

    # Delete admin
    client.delete(f"/api/super-admin/org-admins/{admin_id}")
    client.post("/api/super-admin/auth/logout")

    clear_captured_emails()

    # Try to login
    res = client.post("/api/org-admin/auth/magic-link", data={"email": email})
    assert res.status_code == 200 # Anti-enumeration
    assert len(get_captured_emails()) == 0 # No email sent

def test_super_admin_create_flow_email(client, drain_email_outbox, monkeypatch):
    monkeypatch.setattr(settings, "ASSONAM_WHATSAPP_BOT_NUMBER", "+390299914307", raising=False)
    # Login as super admin
    client.post("/api/super-admin/auth/login", json={"email": "admin@assonam.it", "password": "admin"})

    clear_captured_emails()

    # Create org admin
    email = f"new.admin.{uuid.uuid4().hex[:8]}@example.com"
    res = client.post("/api/super-admin/org-admins", json={"email": email, "org_id": 1})
    assert res.status_code == 200
    drain_email_outbox()

    # Assert email sent automatically
    captured = get_captured_emails()
    assert len(captured) == 1
    assert captured[0]["to"] == email
    assert "Invito area amministrazione associazione" in captured[0]["subject"]
    assert "Benvenuto nell'area amministratore" in (captured[0]["html_body"] or "")
    assert "150 euro" in (captured[0]["html_body"] or "")
    assert "+39" in (captured[0]["html_body"] or "")
    assert captured[0]["attachments"] == [
        {
            "filename": "guida-assonam-area-admin.pdf",
            "content_type": "application/pdf",
            "size": captured[0]["attachments"][0]["size"],
        }
    ]
    assert captured[0]["attachments"][0]["size"] > 1000

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
