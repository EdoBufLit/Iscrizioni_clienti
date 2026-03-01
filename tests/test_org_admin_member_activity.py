import pytest
from datetime import datetime, timedelta

from app.db import SessionLocal
from app.models import AdminUser, AdminRole, Member, MemberStatus, OrgAdminToken, Organization
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_org_admin(client, db, admin_id: int):
    token_str = f"activitytoken-{admin_id}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)


def _cleanup_member(db, email: str):
    member = db.query(Member).filter_by(email=email).first()
    if member:
        db.delete(member)
        db.commit()


def test_member_activity_logs_visible(client, db):
    org = db.query(Organization).filter_by(slug="activity-org").first()
    if not org:
        org = Organization(name="Activity Org", slug="activity-org", is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    admin_email = "activity_admin@example.com"
    admin = db.query(AdminUser).filter_by(email=admin_email).first()
    if not admin:
        admin = AdminUser(email=admin_email, role=AdminRole.ORG_ADMIN, org_id=org.id, is_active=True)
        db.add(admin)
        db.commit()
        db.refresh(admin)

    _login_org_admin(client, db, admin.id)

    _cleanup_member(db, "paola.neri@example.com")

    payload = {
        "first_name": "Paola",
        "last_name": "Neri",
        "email": "paola.neri@example.com",
        "joined_at": "2026-02-02",
        "is_manual": True,
    }
    res = client.post("/api/org-admin/members", json=payload)
    assert res.status_code == 200
    member_id = res.json()["id"]

    member = db.query(Member).filter(Member.id == member_id).first()
    assert member is not None
    member.status = MemberStatus.ACTIVE
    member.card_no = 8800
    member.card_year = datetime.utcnow().year
    member.joined_at = datetime.utcnow()
    db.commit()

    res = client.post(f"/api/org-admin/members/{member_id}/send-access")
    assert res.status_code == 200

    res = client.get(f"/api/org-admin/members/{member_id}")
    assert res.status_code == 200
    data = res.json()
    actions = [a["action"] for a in data.get("activities", [])]
    assert "member.manual_create" in actions
    assert "member.access_sent" in actions

    member = db.query(Member).filter(Member.id == member_id).first()
    assert member is not None
