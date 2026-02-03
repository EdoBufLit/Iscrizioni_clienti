import pytest
from datetime import datetime, timedelta

from app.db import SessionLocal
from app.models import (
    Organization,
    AdminUser,
    AdminRole,
    Member,
    MemberStatus,
    MemberDocument,
    DocStatus,
    OrgAdminToken,
    MemberPayment,
)
from app.security import get_password_hash
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_org_admin(client, db, admin_id: int):
    token_str = f"filtertoken-{admin_id}"
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
        db.query(MemberDocument).filter_by(member_id=member.id).delete()
        db.query(MemberPayment).filter_by(member_id=member.id).delete()
        db.delete(member)
        db.commit()


def test_org_admin_member_filters(client, db):
    org = db.query(Organization).filter_by(slug="filter-org").first()
    if not org:
        org = Organization(name="Filter Org", slug="filter-org", is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    other_org = db.query(Organization).filter_by(slug="filter-org-b").first()
    if not other_org:
        other_org = Organization(name="Filter Org B", slug="filter-org-b", is_active=True)
        db.add(other_org)
        db.commit()
        db.refresh(other_org)

    admin = db.query(AdminUser).filter_by(email="filter_admin@example.com").first()
    if not admin:
        admin = AdminUser(email="filter_admin@example.com", role=AdminRole.ORG_ADMIN, org_id=org.id, is_active=True)
        db.add(admin)
        db.commit()
        db.refresh(admin)

    _cleanup_member(db, "m1@example.com")
    _cleanup_member(db, "m2@example.com")
    _cleanup_member(db, "m3@example.com")
    _cleanup_member(db, "other@example.com")

    m1 = Member(
        org_id=org.id,
        first_name="Anna",
        last_name="Bianchi",
        email="m1@example.com",
        fiscal_code="AAAABBBB11",
        password_hash=get_password_hash("Pass1234!"),
        status=MemberStatus.ACTIVE,
        is_manual=True,
        joined_at=datetime.utcnow(),
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    m2 = Member(
        org_id=org.id,
        first_name="Luca",
        last_name="Verdi",
        email="m2@example.com",
        fiscal_code="CCCCDDDD22",
        status=MemberStatus.PENDING_DOCS,
        is_manual=False,
        joined_at=datetime.utcnow(),
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    m3 = Member(
        org_id=org.id,
        first_name="Marco",
        last_name="Rossi",
        email="m3@example.com",
        fiscal_code="EEEFFFF33",
        status=MemberStatus.REJECTED,
        is_manual=False,
        joined_at=datetime.utcnow(),
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    other_member = Member(
        org_id=other_org.id,
        first_name="Other",
        last_name="Org",
        email="other@example.com",
        status=MemberStatus.ACTIVE,
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    db.add_all([m1, m2, m3, other_member])
    db.commit()
    db.refresh(m1)
    db.refresh(m2)
    db.refresh(m3)

    db.add_all(
        [
            MemberDocument(
                member_id=m1.id,
                doc_type="identity",
                rel_path="path/a.pdf",
                original_filename="a.pdf",
                mime_type="application/pdf",
                size_bytes=100,
                sha256="a",
                status=DocStatus.APPROVED.value,
            ),
            MemberDocument(
                member_id=m2.id,
                doc_type="identity",
                rel_path="path/b.pdf",
                original_filename="b.pdf",
                mime_type="application/pdf",
                size_bytes=100,
                sha256="b",
                status=DocStatus.PENDING.value,
            ),
        ]
    )
    db.commit()

    _login_org_admin(client, db, admin.id)

    resp = client.get("/api/org-admin/members?q=AAAABBBB11")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["email"] == "m1@example.com"

    resp = client.get("/api/org-admin/members?access=with")
    assert resp.status_code == 200
    emails = [i["email"] for i in resp.json()["items"]]
    assert "m1@example.com" in emails
    assert "m2@example.com" not in emails

    resp = client.get("/api/org-admin/members?source=manual")
    assert resp.status_code == 200
    emails = [i["email"] for i in resp.json()["items"]]
    assert "m1@example.com" in emails
    assert "m2@example.com" not in emails

    resp = client.get("/api/org-admin/members?docs=pending")
    assert resp.status_code == 200
    emails = [i["email"] for i in resp.json()["items"]]
    assert "m2@example.com" in emails
    assert "m1@example.com" not in emails

    resp = client.get("/api/org-admin/members?docs=approved")
    assert resp.status_code == 200
    emails = [i["email"] for i in resp.json()["items"]]
    assert "m1@example.com" in emails
    assert "m2@example.com" not in emails

    resp = client.get("/api/org-admin/members?status=suspended")
    assert resp.status_code == 200
    emails = [i["email"] for i in resp.json()["items"]]
    assert "m3@example.com" in emails

    resp = client.get("/api/org-admin/members")
    assert resp.status_code == 200
    emails = [i["email"] for i in resp.json()["items"]]
    assert "other@example.com" not in emails
