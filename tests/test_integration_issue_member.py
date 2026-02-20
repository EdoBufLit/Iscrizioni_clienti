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
    OperationLog,
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
        assert payload_out["card_verification_token"]
        assert payload_out["card_download_url"].endswith(
            f"/api/cards/{payload_out['card_verification_token']}/download.pdf"
        )
        assert payload_out["wallet_enabled"] is False

        captured = get_captured_emails()
        assert len(captured) == 1
        assert captured[0]["subject"] == f"La tua tessera {org.name}"
        assert payload_out["card_verification_url"] in captured[0]["text_body"]
        assert payload_out["card_download_url"] in captured[0]["text_body"]
        assert captured[0]["html_body"] is not None
        assert "<html" in captured[0]["html_body"].lower()
        assert "Accedi area riservata" in captured[0]["html_body"]
        assert "Scarica tessera" in captured[0]["html_body"]
        assert "api.qrserver.com" in captured[0]["html_body"]
        assert (
            "logo-transparent.png" in captured[0]["html_body"]
            or "cid:card_front@assonam" in captured[0]["html_body"]
        )
        inline_images = captured[0].get("inline_images") or []
        if inline_images:
            assert any(img.get("cid") == "card_front@assonam" for img in inline_images)
    finally:
        settings.EMAIL_MODE = original_email_mode
        clear_captured_emails()


def test_issue_member_uses_custom_card_email_subject_template(client, db):
    original_email_mode = settings.EMAIL_MODE
    settings.EMAIL_MODE = "test"
    clear_captured_emails()
    try:
        org, _batch, raw_key = _create_org_with_key(db)
        org.club_display_name = "Golden Age Club - Speakeasy"
        org.card_email_subject = "La tua tessera {club_display_name}"
        db.commit()

        response = client.post(
            "/api/integrations/members/issue",
            json={
                "org_slug": org.slug,
                "external_customer_id": f"ext-mail-subject-{uuid.uuid4().hex[:10]}",
                "email": "subject.member@example.com",
                "first_name": "Subject",
                "last_name": "Member",
                "send_email": True,
            },
            headers={"X-ASSONAM-API-KEY": raw_key},
        )
        assert response.status_code == 200, response.text

        captured = get_captured_emails()
        assert len(captured) == 1
        assert captured[0]["subject"] == "La tua tessera Golden Age Club - Speakeasy"
    finally:
        settings.EMAIL_MODE = original_email_mode
        clear_captured_emails()


def test_issue_member_rejects_payload_org_mismatch(client, db):
    org_key_owner, _batch_a, raw_key = _create_org_with_key(db)
    other_org, _batch_b, _unused_key = _create_org_with_key(db)

    response = client.post(
        "/api/integrations/members/issue",
        json={
            "org_slug": other_org.slug,
            "external_customer_id": f"ext-mismatch-{uuid.uuid4().hex[:8]}",
            "email": f"mismatch.{uuid.uuid4().hex[:6]}@example.com",
            "first_name": "Mismatch",
            "last_name": "Test",
            "send_email": False,
        },
        headers={"X-ASSONAM-API-KEY": raw_key},
    )
    assert response.status_code == 403, response.text

    latest_security_log = (
        db.query(OperationLog)
        .filter(
            OperationLog.action == "security_event",
            OperationLog.entity_type == "integration_api_key",
        )
        .order_by(OperationLog.id.desc())
        .first()
    )
    assert latest_security_log is not None
    metadata = latest_security_log.metadata_json or {}
    assert metadata.get("reason") == "org_slug_mismatch"
    assert metadata.get("key_org_id") == org_key_owner.id
