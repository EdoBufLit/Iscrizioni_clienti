from datetime import datetime

import pytest

from app.db import SessionLocal
from app.models import Member, MemberStatus, Organization
from app.security import get_password_hash


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def test_member_card_verification_payload_and_endpoint(client, db):
    org = db.query(Organization).filter_by(slug="card-verify-org").first()
    if not org:
        org = Organization(name="Card Verify Org", slug="card-verify-org", is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    email = "card.verify.member@example.com"
    member = db.query(Member).filter_by(email=email).first()
    if not member:
        member = Member(
            org_id=org.id,
            first_name="Luca",
            last_name="Bianchi",
            email=email,
            password_hash=get_password_hash("TestPass123!"),
            status=MemberStatus.ACTIVE,
            card_no=9876,
            card_year=2026,
            joined_at=datetime(2026, 1, 5),
            signup_ip="127.0.0.1",
            signup_user_agent="pytest",
        )
        db.add(member)
    else:
        member.org_id = org.id
        member.first_name = "Luca"
        member.last_name = "Bianchi"
        member.password_hash = get_password_hash("TestPass123!")
        member.status = MemberStatus.ACTIVE
        member.card_no = 9876
        member.card_year = 2026
        member.joined_at = datetime(2026, 1, 5)
        member.deleted_at = None

    db.commit()

    login_res = client.post("/api/auth/login", data={"email": email, "password": "TestPass123!"})
    assert login_res.status_code == 200

    me_res = client.get("/api/auth/me")
    assert me_res.status_code == 200
    me_data = me_res.json()

    assert me_data["card_no"] == 9876
    assert me_data["card"]["number"] == 9876
    assert me_data["card"]["year"] == 2026
    assert me_data["card"]["status"] == "attiva"
    assert me_data["card"]["verification_url"]

    verify_url = me_data["card"]["verification_url"]
    verify_path = verify_url.replace("http://localhost:8000", "")
    verify_res = client.get(verify_path)
    assert verify_res.status_code == 200

    verify_data = verify_res.json()
    assert verify_data["valid"] is True
    assert verify_data["card"]["number"] == 9876
    assert verify_data["card"]["year"] == 2026
    assert verify_data["card"]["status"] == "attiva"
    assert verify_data["organization"]["name"] == org.name


def test_member_card_verify_invalid_token(client):
    res = client.get("/api/cards/verify/not-a-valid-token")
    assert res.status_code == 404
