import uuid

import pytest
from sqlalchemy import func

from app.config import settings
from app.db import SessionLocal
from app.models import (
    CardBatch,
    IntegrationApiKey,
    Member,
    MemberStatus,
    Organization,
    SignupSource,
)
from app.security import hash_api_key
from app.utils import clear_captured_emails, get_captured_emails


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _create_org_with_key(db, scope: str = "issue_member") -> tuple[Organization, CardBatch, str]:
    suffix = uuid.uuid4().hex[:8]
    slug = f"integration-org-{suffix}"
    org = Organization(
        name=f"Integration Org {suffix}",
        slug=slug,
        is_active=True,
        privacy_version="v1",
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    max_end_no = db.query(func.max(CardBatch.end_no)).scalar() or 10000
    start_no = int(max_end_no) + 100
    batch = CardBatch(
        org_id=org.id,
        start_no=start_no,
        end_no=start_no + 50,
        next_no=start_no,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    raw_key = f"pk_test_{uuid.uuid4().hex}"
    integration_key = IntegrationApiKey(
        org_id=org.id,
        name="Pienissimo",
        key_hash=hash_api_key(raw_key),
        scopes=[scope],
        is_active=True,
    )
    db.add(integration_key)
    db.commit()

    return org, batch, raw_key


def test_issue_member_creates_active_member_with_card(client, db):
    org, batch, raw_key = _create_org_with_key(db)

    payload = {
        "org_slug": org.slug,
        "external_customer_id": f"ext-{uuid.uuid4().hex[:10]}",
        "email": "issuer.member@example.com",
        "first_name": "Issuer",
        "last_name": "Member",
        "send_email": False,
    }
    response = client.post(
        "/api/integrations/members/issue",
        json=payload,
        headers={"X-ASSONAM-API-KEY": raw_key},
    )
    assert response.status_code == 200, response.text

    data = response.json()
    assert data["status"] == "ok"
    assert data["card_number"] >= batch.start_no
    assert data["card_number"] <= batch.end_no
    assert "/api/cards/verify/" in data["card_verification_url"]

    member = db.query(Member).filter(Member.id == data["member_id"]).first()
    assert member is not None
    assert member.status == MemberStatus.ACTIVE
    assert member.card_no == data["card_number"]
    assert member.card_year == data["card_year"]
    assert member.batch_id == batch.id
    assert member.signup_source == SignupSource.PIENISSIMO.value
    assert member.external_customer_id == payload["external_customer_id"]


def test_issue_member_is_idempotent_on_external_customer_id(client, db):
    org, _batch, raw_key = _create_org_with_key(db)
    external_customer_id = f"ext-idem-{uuid.uuid4().hex[:10]}"

    first_payload = {
        "org_slug": org.slug,
        "external_customer_id": external_customer_id,
        "email": "idem.member@example.com",
        "first_name": "Mario",
        "last_name": "Rossi",
        "send_email": False,
    }
    first_response = client.post(
        "/api/integrations/members/issue",
        json=first_payload,
        headers={"X-ASSONAM-API-KEY": raw_key},
    )
    assert first_response.status_code == 200, first_response.text

    second_payload = {
        **first_payload,
        "first_name": "Mario-Aggiornato",
    }
    second_response = client.post(
        "/api/integrations/members/issue",
        json=second_payload,
        headers={"X-ASSONAM-API-KEY": raw_key},
    )
    assert second_response.status_code == 200, second_response.text

    first_data = first_response.json()
    second_data = second_response.json()

    assert second_data["member_id"] == first_data["member_id"]
    assert second_data["card_number"] == first_data["card_number"]

    members = (
        db.query(Member)
        .filter(
            Member.org_id == org.id,
            Member.signup_source == SignupSource.PIENISSIMO.value,
            Member.external_customer_id == external_customer_id,
            Member.deleted_at.is_(None),
        )
        .all()
    )
    assert len(members) == 1
    assert members[0].first_name == "Mario-Aggiornato"


def test_issue_member_returns_401_without_api_key(client, db):
    org, _batch, _raw_key = _create_org_with_key(db)
    payload = {
        "org_slug": org.slug,
        "external_customer_id": f"ext-{uuid.uuid4().hex[:10]}",
        "email": "unauthorized.member@example.com",
        "first_name": "No",
        "last_name": "Key",
    }

    response = client.post("/api/integrations/members/issue", json=payload)
    assert response.status_code == 401


def test_issue_member_captures_html_email_with_verification_url(client, db):
    original_email_mode = settings.EMAIL_MODE
    settings.EMAIL_MODE = "test"
    clear_captured_emails()
    try:
        org, _batch, raw_key = _create_org_with_key(db)
        payload = {
            "org_slug": org.slug,
            "external_customer_id": f"ext-mail-{uuid.uuid4().hex[:10]}",
            "email": "mail.member@example.com",
            "first_name": "Mail",
            "last_name": "Member",
            "send_email": True,
        }
        response = client.post(
            "/api/integrations/members/issue",
            json=payload,
            headers={"X-ASSONAM-API-KEY": raw_key},
        )
        assert response.status_code == 200, response.text

        payload_out = response.json()
        assert payload_out["member_portal_login_hint"] == "magic_link_sent"

        captured = get_captured_emails()
        assert len(captured) == 1
        assert payload_out["card_verification_url"] in captured[0]["text_body"]
        assert captured[0]["html_body"] is not None
        assert "<html" in captured[0]["html_body"].lower()
        assert "Accedi area riservata" in captured[0]["html_body"]
        assert "api.qrserver.com" in captured[0]["html_body"]
    finally:
        settings.EMAIL_MODE = original_email_mode
        clear_captured_emails()
