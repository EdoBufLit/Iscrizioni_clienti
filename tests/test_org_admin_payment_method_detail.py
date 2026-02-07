from datetime import datetime, timedelta

import pytest

from app.db import SessionLocal
from app.models import AdminRole, AdminUser, Organization, OrgAdminToken
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_org_admin(client, db, admin_id: int):
    token_str = f"payment-method-admin-{admin_id}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)


def test_org_admin_member_detail_includes_payment_method(client, db):
    org = db.query(Organization).filter_by(slug="org-admin-payment-method").first()
    if not org:
        org = Organization(name="Org Admin PM", slug="org-admin-payment-method", is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    admin = db.query(AdminUser).filter_by(email="orgadmin-payment@example.com").first()
    if not admin:
        admin = AdminUser(
            email="orgadmin-payment@example.com",
            role=AdminRole.ORG_ADMIN,
            org_id=org.id,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

    _login_org_admin(client, db, admin.id)

    unique_email = f"paolo.payment.{int(datetime.utcnow().timestamp() * 1000)}@example.com"
    create_payload = {
        "first_name": "Paolo",
        "last_name": "Bianchi",
        "email": unique_email,
        "payment_method": "BONIFICO",
        "is_manual": True,
    }
    create_resp = client.post("/api/org-admin/members", json=create_payload)
    assert create_resp.status_code == 200, create_resp.text
    created = create_resp.json()
    assert created["payment_method"] == "BONIFICO"

    detail_resp = client.get(f"/api/org-admin/members/{created['id']}")
    assert detail_resp.status_code == 200, detail_resp.text
    detail = detail_resp.json()
    assert detail["payment_method"] == "BONIFICO"
