import pytest

from app.db import SessionLocal
from app.models import Member, MemberStatus, Organization, PaymentMethod


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def test_super_admin_member_detail_exposes_payment_method(client, db):
    org = db.query(Organization).filter_by(slug="superadmin-payment-org").first()
    if not org:
        org = Organization(name="SuperAdmin Payment Org", slug="superadmin-payment-org", is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    member = Member(
        org_id=org.id,
        first_name="Sara",
        last_name="Verdi",
        email="sara.verdi.payment@example.com",
        status=MemberStatus.PENDING_DOCS,
        payment_method=PaymentMethod.CASH,
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    login_resp = client.post("/api/super-admin/auth/login", json={"email": "admin@assonam.it", "password": "admin"})
    assert login_resp.status_code == 200, login_resp.text

    detail_resp = client.get(f"/api/super-admin/members/{member.id}")
    assert detail_resp.status_code == 200, detail_resp.text
    payload = detail_resp.json()
    assert payload["id"] == member.id
    assert payload["payment_method"] == "CASH"
