import pytest
from datetime import datetime, timedelta
from sqlalchemy import func

from app.config import settings
from app.db import SessionLocal
from app.models import AdminUser, AdminRole, Organization, Member, OrgAdminToken, Token, TokenType
from app.utils import hash_token, get_captured_emails, clear_captured_emails


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_org_admin(client, db, admin_id: int):
    token_str = f"access-token-{admin_id}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)


def test_org_admin_send_access_ok(client, db, drain_email_outbox):
    original_mode = settings.EMAIL_MODE
    settings.EMAIL_MODE = "test"
    clear_captured_emails()
    try:
        org = db.query(Organization).filter_by(slug="access-org").first()
        if not org:
            org = Organization(name="Access Org", slug="access-org", is_active=True)
            db.add(org)
            db.commit()
            db.refresh(org)

        admin = db.query(AdminUser).filter_by(email="access_admin@example.com").first()
        if not admin:
            admin = AdminUser(
                email="access_admin@example.com",
                role=AdminRole.ORG_ADMIN,
                org_id=org.id,
                is_active=True,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)

        existing_member = db.query(Member).filter(Member.email == "laura.bianchi@example.com").first()
        if existing_member:
            db.delete(existing_member)
            db.commit()

        next_card = (db.query(func.max(Member.card_no)).filter(Member.org_id == org.id).scalar() or 6100) + 1
        member = Member(
            org_id=org.id,
            first_name="Laura",
            last_name="Bianchi",
            email="laura.bianchi@example.com",
            status="active",
            card_no=next_card,
            card_year=datetime.utcnow().year,
            joined_at=datetime.utcnow(),
        )
        db.add(member)
        db.commit()
        db.refresh(member)

        _login_org_admin(client, db, admin.id)

        res = client.post(f"/api/org-admin/members/{member.id}/send-access")
        assert res.status_code == 200
        payload = res.json()
        assert payload["ok"] is True
        assert payload["email_sent"] is False
        assert payload["email_status"] == "queued"
        assert payload["last_access_email_at"] is not None
        drain_email_outbox()
        assert len(get_captured_emails()) == 1

        token_count = db.query(Token).filter(
            Token.member_id == member.id,
            Token.purpose == TokenType.LOGIN_MAGIC_LINK,
        ).count()
        assert token_count == 1
    finally:
        settings.EMAIL_MODE = original_mode
        clear_captured_emails()


def test_org_admin_send_access_missing_email(client, db):
    org = db.query(Organization).filter_by(slug="access-org-no-email").first()
    if not org:
        org = Organization(name="Access Org NE", slug="access-org-no-email", is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    admin = db.query(AdminUser).filter_by(email="access_admin_ne@example.com").first()
    if not admin:
        admin = AdminUser(
            email="access_admin_ne@example.com",
            role=AdminRole.ORG_ADMIN,
            org_id=org.id,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

    next_card = (db.query(func.max(Member.card_no)).filter(Member.org_id == org.id).scalar() or 6200) + 1
    member = Member(
        org_id=org.id,
        first_name="No",
        last_name="Email",
        email=None,
        status="active",
        card_no=next_card,
        card_year=datetime.utcnow().year,
        joined_at=datetime.utcnow(),
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    _login_org_admin(client, db, admin.id)

    res = client.post(f"/api/org-admin/members/{member.id}/send-access")
    assert res.status_code == 400


def test_org_admin_send_access_permission(client, db):
    org = db.query(Organization).filter_by(slug="access-org-perm-a").first()
    if not org:
        org = Organization(name="Access Org A", slug="access-org-perm-a", is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    other_org = db.query(Organization).filter_by(slug="access-org-perm-b").first()
    if not other_org:
        other_org = Organization(name="Access Org B", slug="access-org-perm-b", is_active=True)
        db.add(other_org)
        db.commit()
        db.refresh(other_org)

    admin = db.query(AdminUser).filter_by(email="access_admin_perm@example.com").first()
    if not admin:
        admin = AdminUser(
            email="access_admin_perm@example.com",
            role=AdminRole.ORG_ADMIN,
            org_id=org.id,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

    existing_member = db.query(Member).filter(Member.email == "other.org@example.com").first()
    if existing_member:
        db.delete(existing_member)
        db.commit()

    next_card = (db.query(func.max(Member.card_no)).filter(Member.org_id == other_org.id).scalar() or 6300) + 1
    member = Member(
        org_id=other_org.id,
        first_name="Other",
        last_name="Org",
        email="other.org@example.com",
        status="active",
        card_no=next_card,
        card_year=datetime.utcnow().year,
        joined_at=datetime.utcnow(),
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    _login_org_admin(client, db, admin.id)

    res = client.post(f"/api/org-admin/members/{member.id}/send-access")
    assert res.status_code == 404
