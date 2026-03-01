import pytest
from datetime import datetime, timedelta

from app.db import SessionLocal
from app.models import AdminUser, AdminRole, Organization, Member, OrgAdminToken, SignupSource
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_org_admin(client, db, admin_id: int):
    token_str = f"manualtoken-{admin_id}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)


def test_org_admin_can_create_member(client, db):
    org = db.query(Organization).filter_by(slug="manual-org").first()
    if not org:
        org = Organization(name="Manual Org", slug="manual-org", is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    admin_email = "manual_admin@example.com"
    admin = db.query(AdminUser).filter_by(email=admin_email).first()
    if not admin:
        admin = AdminUser(
            email=admin_email,
            role=AdminRole.ORG_ADMIN,
            org_id=org.id,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

    _login_org_admin(client, db, admin.id)

    existing = db.query(Member).filter_by(email="mario.rossi@example.com", org_id=org.id).first()
    if existing:
        db.delete(existing)
        db.commit()

    payload = {
        "first_name": "Mario",
        "last_name": "Rossi",
        "email": "mario.rossi@example.com",
        "joined_at": "2026-02-02",
        "is_manual": True,
    }
    res = client.post("/api/org-admin/members", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == "mario.rossi@example.com"
    assert data["is_manual"] is True

    member = db.query(Member).filter(Member.id == data["id"]).first()
    assert member is not None
    assert member.org_id == org.id
    assert member.first_name == "Mario"
    assert member.is_manual is True
    assert member.signup_source == SignupSource.ADMIN.value


def test_org_admin_cannot_override_org_id(client, db):
    org = db.query(Organization).filter_by(slug="manual-org-a").first()
    if not org:
        org = Organization(name="Manual Org A", slug="manual-org-a", is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    other_org = db.query(Organization).filter_by(slug="manual-org-b").first()
    if not other_org:
        other_org = Organization(name="Manual Org B", slug="manual-org-b", is_active=True)
        db.add(other_org)
        db.commit()
        db.refresh(other_org)

    admin_email = "manual_admin_a@example.com"
    admin = db.query(AdminUser).filter_by(email=admin_email).first()
    if not admin:
        admin = AdminUser(
            email=admin_email,
            role=AdminRole.ORG_ADMIN,
            org_id=org.id,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

    _login_org_admin(client, db, admin.id)

    payload = {
        "first_name": "Giulia",
        "last_name": "Verdi",
        "email": "giulia.verdi@example.com",
        "org_id": other_org.id,
    }
    res = client.post("/api/org-admin/members", json=payload)
    assert res.status_code == 422
    assert (
        db.query(Member)
        .filter(Member.email == "giulia.verdi@example.com", Member.org_id == org.id)
        .first()
        is None
    )


def test_super_admin_cannot_create_member(client):
    client.cookies.clear()
    client.post("/api/super-admin/auth/login", json={"email": "admin@assonam.it", "password": "admin"})
    res = client.post(
        "/api/org-admin/members",
        json={"first_name": "Super", "last_name": "Admin"},
    )
    assert res.status_code == 401
    client.post("/api/super-admin/auth/logout")
