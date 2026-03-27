import pytest
from datetime import datetime, timedelta
import uuid

from app.db import SessionLocal
from app.models import (
    Organization,
    AdminUser,
    AdminRole,
    Member,
    MemberStatus,
    CardBatch,
    MemberPayment,
    MembershipPayment,
    OrgAdminToken,
)
from app.security import get_password_hash
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _create_org(db, slug: str, name: str):
    org = db.query(Organization).filter_by(slug=slug).first()
    if not org:
        org = Organization(name=name, slug=slug, is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)
    return org


def _create_admin(db, email: str, org_id: int):
    admin = db.query(AdminUser).filter_by(email=email).first()
    if not admin:
        admin = AdminUser(email=email, role=AdminRole.ORG_ADMIN, org_id=org_id, is_active=True)
        db.add(admin)
        db.commit()
        db.refresh(admin)
    return admin


def _create_card_batch(db, org_id: int):
    batch = db.query(CardBatch).filter_by(org_id=org_id).first()
    if not batch:
        batch = CardBatch(org_id=org_id, start_no=500, end_no=510, next_no=500)
        db.add(batch)
        db.commit()
    return batch


def _create_member(db, org_id: int, email: str):
    member = db.query(Member).filter_by(email=email).first()
    if member:
        db.query(MemberPayment).filter_by(member_id=member.id).delete()
        db.delete(member)
        db.commit()
    member = Member(
        org_id=org_id,
        first_name="Luca",
        last_name="Bianchi",
        email=email,
        password_hash=get_password_hash("Pass1234!"),
        status=MemberStatus.PENDING_VERIFICATION,
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def _login_org_admin(client, db, admin_id: int):
    token_str = f"paytoken-{admin_id}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)


def test_org_admin_manual_payment_sets_paid_and_status(client, db):
    suffix = uuid.uuid4().hex[:8]
    org = _create_org(db, f"manual-pay-org-{suffix}", "Manual Pay Org")
    _create_card_batch(db, org.id)
    admin = _create_admin(db, f"manualpay_admin_{suffix}@example.com", org.id)
    member = _create_member(db, org.id, f"manualpay_member_{suffix}@example.com")

    _login_org_admin(client, db, admin.id)

    payload = {
        "amount": 50.0,
        "method": "contanti",
        "paid_at": datetime.utcnow().date().isoformat(),
        "notes": "Pagamento in sede",
    }
    resp = client.post(f"/api/org-admin/members/{member.id}/payments/manual", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["payment"]["amount"] == 50.0

    db.refresh(member)
    assert member.status == MemberStatus.ACTIVE
    assert member.card_no is not None
    assert member.card_is_paid is True
    assert member.payment_status == "manual_completed"
    assert db.query(MemberPayment).filter_by(member_id=member.id).count() == 1
    assert db.query(MembershipPayment).filter_by(socio_id=member.id).count() == 1


def test_org_admin_manual_payment_does_not_issue_card_if_payment_required_but_workflow_not_ready(client, db):
    suffix = uuid.uuid4().hex[:8]
    org = _create_org(db, f"manual-pay-required-{suffix}", "Manual Pay Required")
    org.payment_provider = "sumup"
    org.payment_required_before_card = True
    org.membership_payment_label = "Quota associativa"
    org.membership_fee_amount = 35
    org.membership_fee_currency = "EUR"
    org.payment_button_label = "Paga con carta"
    org.sumup_enabled = True
    db.commit()
    _create_card_batch(db, org.id)
    admin = _create_admin(db, f"manualpay_required_admin_{suffix}@example.com", org.id)
    member = _create_member(db, org.id, f"manualpay_required_member_{suffix}@example.com")

    _login_org_admin(client, db, admin.id)

    payload = {
        "amount": 35.0,
        "method": "bonifico",
        "paid_at": datetime.utcnow().date().isoformat(),
        "notes": "Registrato a mano",
    }
    resp = client.post(f"/api/org-admin/members/{member.id}/payments/manual", json=payload)
    assert resp.status_code == 200, resp.text

    db.refresh(member)
    assert member.card_is_paid is True
    assert member.payment_status == "manual_completed"
    assert member.card_no is None
    assert member.status != MemberStatus.ACTIVE


def test_org_admin_cannot_pay_other_org_member(client, db):
    suffix = uuid.uuid4().hex[:8]
    org_a = _create_org(db, f"manual-pay-org-a-{suffix}", "Manual Pay Org A")
    org_b = _create_org(db, f"manual-pay-org-b-{suffix}", "Manual Pay Org B")
    admin = _create_admin(db, f"manualpay_admin_b_{suffix}@example.com", org_b.id)
    member = _create_member(db, org_a.id, f"manualpay_member_b_{suffix}@example.com")

    _login_org_admin(client, db, admin.id)

    payload = {
        "amount": 30.0,
        "method": "bonifico",
        "paid_at": datetime.utcnow().date().isoformat(),
    }
    resp = client.post(f"/api/org-admin/members/{member.id}/payments/manual", json=payload)
    assert resp.status_code == 403


def test_member_cannot_create_manual_payment(client, db):
    suffix = uuid.uuid4().hex[:8]
    org = _create_org(db, f"manual-pay-member-{suffix}", "Manual Pay Member")
    member = _create_member(db, org.id, f"manualpay_member_only_{suffix}@example.com")
    member.status = MemberStatus.ACTIVE
    member.card_no = 7777
    member.card_year = datetime.utcnow().year
    member.deleted_at = None
    db.commit()

    client.post("/api/org-admin/auth/logout")

    resp = client.post("/api/auth/login", data={"email": member.email, "password": "Pass1234!"})
    assert resp.status_code == 200

    payload = {
        "amount": 10.0,
        "method": "altro",
        "paid_at": datetime.utcnow().date().isoformat(),
    }
    resp = client.post(f"/api/org-admin/members/{member.id}/payments/manual", json=payload)
    assert resp.status_code == 401
