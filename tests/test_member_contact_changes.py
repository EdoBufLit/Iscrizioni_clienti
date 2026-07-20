import uuid
from datetime import datetime

import pytest

from app.db import SessionLocal
from app.models import EmailOutbox, Member, MemberContactChange, MemberStatus, Organization
from app.security import get_password_hash


@pytest.fixture
def contact_member(client):
    client.cookies.clear()
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:10]
    org = Organization(name=f"Contact Org {suffix}", slug=f"contact-org-{suffix}", is_active=True)
    db.add(org)
    db.flush()
    member = Member(
        org_id=org.id,
        first_name="Mario",
        last_name="Contatti",
        email=f"contact-{suffix}@example.com",
        phone="+393331112222",
        password_hash=get_password_hash("TestPass123!"),
        status=MemberStatus.ACTIVE,
        card_no=700_000 + int(suffix[:4], 16),
        card_year=datetime.utcnow().year,
        joined_at=datetime.utcnow(),
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    login = client.post(
        "/api/auth/login",
        data={"email": member.email, "password": "TestPass123!"},
    )
    assert login.status_code == 200, login.text
    yield {"id": member.id, "org_id": org.id, "email": member.email}
    client.cookies.clear()
    db.close()


def test_email_change_requires_one_use_confirmation_and_notifies_old_address(
    client,
    contact_member,
    monkeypatch,
):
    confirmation_token = "contact-change-email-confirm-long-enough-123456"
    authorization_token = "contact-change-email-authorize-long-enough-654321"
    generated_tokens = iter([confirmation_token, authorization_token])
    monkeypatch.setattr(
        "app.services.member_contact_changes.generate_token",
        lambda: next(generated_tokens),
    )
    new_email = f"new-{uuid.uuid4().hex[:8]}@example.net"

    requested = client.post(
        "/api/member/contact-changes",
        json={"field": "email", "new_value": new_email},
    )
    assert requested.status_code == 200, requested.text
    assert requested.json()["request"]["masked_new_value"] != new_email

    db = SessionLocal()
    try:
        member = db.query(Member).filter(Member.id == contact_member["id"]).one()
        change = db.query(MemberContactChange).filter_by(member_id=member.id).one()
        assert member.email == contact_member["email"]
        assert new_email not in change.new_value_encrypted
        assert change.token_hash != change.authorization_token_hash
        recipients = {
            row.to_email
            for row in db.query(EmailOutbox)
            .filter(EmailOutbox.email_type.in_([
                "member_contact_change_confirmation",
                "member_email_change_authorization",
                "member_email_change_security_notice",
            ]))
            .all()
        }
        assert new_email in recipients
        assert contact_member["email"] in recipients
    finally:
        db.close()

    blocked_confirmation = client.post(
        "/api/member/contact-changes/confirm",
        json={"token": confirmation_token},
    )
    assert blocked_confirmation.status_code == 409
    authorized = client.post(
        "/api/member/contact-changes/authorize",
        json={"token": authorization_token},
    )
    assert authorized.status_code == 200, authorized.text
    authorization_replay = client.post(
        "/api/member/contact-changes/authorize",
        json={"token": authorization_token},
    )
    assert authorization_replay.status_code == 410

    confirmed = client.post(
        "/api/member/contact-changes/confirm",
        json={"token": confirmation_token},
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["field"] == "email"
    replay = client.post(
        "/api/member/contact-changes/confirm",
        json={"token": confirmation_token},
    )
    assert replay.status_code == 410

    db = SessionLocal()
    try:
        assert db.query(Member).filter(Member.id == contact_member["id"]).one().email == new_email
    finally:
        db.close()


def test_phone_change_is_confirmed_via_current_email(client, contact_member, monkeypatch):
    token = "contact-change-phone-token-long-enough-123456"
    monkeypatch.setattr("app.services.member_contact_changes.generate_token", lambda: token)
    requested = client.post(
        "/api/member/contact-changes",
        json={"field": "phone", "new_value": "+39 333 999 8877"},
    )
    assert requested.status_code == 200, requested.text

    db = SessionLocal()
    try:
        confirmation = (
            db.query(EmailOutbox)
            .filter(EmailOutbox.email_type == "member_contact_change_confirmation")
            .order_by(EmailOutbox.created_at.desc())
            .first()
        )
        assert confirmation is not None
        assert confirmation.to_email == contact_member["email"]
        assert db.query(Member).filter(Member.id == contact_member["id"]).one().phone == "+393331112222"
    finally:
        db.close()

    confirmed = client.post("/api/member/contact-changes/confirm", json={"token": token})
    assert confirmed.status_code == 200, confirmed.text
    db = SessionLocal()
    try:
        assert db.query(Member).filter(Member.id == contact_member["id"]).one().phone == "+393339998877"
    finally:
        db.close()


def test_email_change_rejects_an_address_owned_by_another_member(client, contact_member):
    db = SessionLocal()
    try:
        other = Member(
            org_id=contact_member["org_id"],
            first_name="Altro",
            last_name="Socio",
            email=f"owned-{uuid.uuid4().hex[:8]}@example.com",
            status=MemberStatus.ACTIVE,
            card_no=990_000 + int(uuid.uuid4().hex[:3], 16),
            card_year=datetime.utcnow().year,
            joined_at=datetime.utcnow(),
        )
        db.add(other)
        db.commit()
        owned_email = other.email
    finally:
        db.close()

    response = client.post(
        "/api/member/contact-changes",
        json={"field": "email", "new_value": owned_email.upper()},
    )
    assert response.status_code == 409


def test_email_change_allows_same_address_in_another_association(client, contact_member):
    db = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:8]
        other_org = Organization(
            name=f"Other Contact Org {suffix}",
            slug=f"other-contact-org-{suffix}",
            is_active=True,
        )
        db.add(other_org)
        db.flush()
        shared_email = f"shared-{suffix}@example.com"
        db.add(
            Member(
                org_id=other_org.id,
                first_name="Socio",
                last_name="Altra associazione",
                email=shared_email,
                status=MemberStatus.ACTIVE,
                card_no=980_000 + int(uuid.uuid4().hex[:3], 16),
                card_year=datetime.utcnow().year,
                joined_at=datetime.utcnow(),
            )
        )
        db.commit()
    finally:
        db.close()

    response = client.post(
        "/api/member/contact-changes",
        json={"field": "email", "new_value": shared_email.upper()},
    )
    assert response.status_code == 200, response.text


def test_email_change_allows_address_used_in_another_membership_year(client, contact_member):
    db = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:8]
        shared_email = f"historic-{suffix}@example.com"
        db.add(
            Member(
                org_id=contact_member["org_id"],
                first_name="Socio",
                last_name="Anno precedente",
                email=shared_email,
                status=MemberStatus.ACTIVE,
                card_no=970_000 + int(uuid.uuid4().hex[:3], 16),
                card_year=datetime.utcnow().year - 1,
                joined_at=datetime.utcnow(),
            )
        )
        db.commit()
    finally:
        db.close()

    response = client.post(
        "/api/member/contact-changes",
        json={"field": "email", "new_value": shared_email},
    )
    assert response.status_code == 200, response.text
