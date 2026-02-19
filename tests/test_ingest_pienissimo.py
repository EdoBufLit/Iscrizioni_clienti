import uuid
from datetime import datetime

import pytest
from sqlalchemy import func

from app.config import settings
from app.db import SessionLocal
from app.models import CardBatch, IntegrationApiKey, Member, MemberStatus, Organization, SignupSource
from app.security import hash_api_key
from app.utils import clear_captured_emails, get_captured_emails


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _create_org_with_batch(db, *, slug_prefix: str = "ingest-org") -> tuple[Organization, CardBatch]:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Ingest Org {suffix}",
        slug=f"{slug_prefix}-{suffix}",
        is_active=True,
        privacy_version="v1",
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    max_end_no = db.query(func.max(CardBatch.end_no)).scalar() or 20000
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
    return org, batch


def _create_integration_key(
    db,
    *,
    org_id: int,
    active: bool,
    name: str = "pienissimo",
    scopes: list[str] | None = None,
):
    key = IntegrationApiKey(
        org_id=org_id,
        name=name,
        key_hash=hash_api_key(f"ingest-key-{uuid.uuid4().hex}"),
        scopes=scopes or ["issue_member"],
        is_active=active,
    )
    db.add(key)
    db.commit()


def test_ingest_returns_402_when_integration_not_active(client, db):
    org, _batch = _create_org_with_batch(db, slug_prefix="ingest-inactive")
    _create_integration_key(db, org_id=org.id, active=False)

    response = client.post(
        f"/api/ingest/pienissimo/{org.slug}",
        json={"email": f"inactive.{uuid.uuid4().hex[:6]}@example.com"},
    )

    assert response.status_code == 402, response.text
    payload = response.json()
    assert payload["error"] == "integration_inactive"
    assert "non attiva" in payload["message"].lower()


def test_ingest_with_active_key_creates_active_member_with_card(client, db):
    org, batch = _create_org_with_batch(db, slug_prefix="ingest-active")
    _create_integration_key(db, org_id=org.id, active=True)

    response = client.post(
        f"/api/ingest/pienissimo/{org.slug}",
        json={
            "email": f"ingest.member.{uuid.uuid4().hex[:6]}@example.com",
            "full_name": "Mario Rossi",
            "phone": "+39333111222",
            "send_email": False,
        },
    )
    assert response.status_code == 200, response.text

    payload = response.json()
    assert payload["status"] == "ok"
    assert batch.start_no <= payload["card_number"] <= batch.end_no
    assert "/api/cards/verify/" in payload["card_url"]
    assert payload["card_verification_url"] == payload["card_url"]
    assert payload["card_verification_token"]
    assert payload["card_download_url"].endswith(
        f"/api/cards/{payload['card_verification_token']}/download.pdf"
    )
    assert payload["wallet_enabled"] is False

    member = db.query(Member).filter(Member.id == payload["member_id"]).first()
    assert member is not None
    assert member.status == MemberStatus.ACTIVE
    assert member.card_no == payload["card_number"]
    assert member.signup_source == SignupSource.PIENISSIMO.value
    assert member.external_customer_id == f"email:{member.email.lower()}"
    assert member.first_name == "Mario"
    assert member.last_name == "Rossi"


def test_ingest_requires_email_even_when_external_id_is_provided(client, db):
    org, _batch = _create_org_with_batch(db, slug_prefix="ingest-email-required")
    _create_integration_key(db, org_id=org.id, active=True)

    response = client.post(
        f"/api/ingest/pienissimo/{org.slug}",
        json={"external_customer_id": f"lead-{uuid.uuid4().hex[:8]}"},
    )

    assert response.status_code == 422, response.text


def test_ingest_retry_100x_is_idempotent_and_sends_email_once(client, db):
    org, batch = _create_org_with_batch(db, slug_prefix="ingest-idem")
    _create_integration_key(db, org_id=org.id, active=True)

    previous_email_mode = settings.EMAIL_MODE
    previous_limit = settings.INGEST_RATE_LIMIT_MAX_REQUESTS
    clear_captured_emails()
    settings.EMAIL_MODE = "test"
    settings.INGEST_RATE_LIMIT_MAX_REQUESTS = 1000

    request_email = f"idem.{uuid.uuid4().hex[:6]}@example.com"
    try:
        member_ids = set()
        card_numbers = set()
        for _ in range(100):
            response = client.post(
                f"/api/ingest/pienissimo/{org.slug}",
                json={
                    "email": request_email,
                    "first_name": "Mario",
                    "last_name": "Rossi",
                },
            )
            assert response.status_code == 200, response.text
            payload = response.json()
            member_ids.add(payload["member_id"])
            card_numbers.add(payload["card_number"])

        assert len(member_ids) == 1
        assert len(card_numbers) == 1

        members = (
            db.query(Member)
            .filter(
                Member.org_id == org.id,
                Member.signup_source == SignupSource.PIENISSIMO.value,
                Member.external_customer_id == f"email:{request_email.lower()}",
                Member.deleted_at.is_(None),
            )
            .all()
        )
        assert len(members) == 1
        assert members[0].card_email_sent_at is not None
        db.refresh(batch)
        assert batch.next_no == members[0].card_no + 1

        captured = get_captured_emails()
        assert len(captured) == 1
    finally:
        settings.EMAIL_MODE = previous_email_mode
        settings.INGEST_RATE_LIMIT_MAX_REQUESTS = previous_limit
        clear_captured_emails()


def test_ingest_rate_limit_returns_429(client, db):
    org, _batch = _create_org_with_batch(db, slug_prefix="ingest-rate")
    _create_integration_key(db, org_id=org.id, active=True)

    previous_limit = settings.INGEST_RATE_LIMIT_MAX_REQUESTS
    previous_window = settings.INGEST_RATE_LIMIT_WINDOW_SECONDS
    settings.INGEST_RATE_LIMIT_MAX_REQUESTS = 5
    settings.INGEST_RATE_LIMIT_WINDOW_SECONDS = 300
    try:
        for idx in range(5):
            response = client.post(
                f"/api/ingest/pienissimo/{org.slug}",
                json={
                    "email": f"rate.{idx}.{uuid.uuid4().hex[:4]}@example.com",
                    "send_email": False,
                },
            )
            assert response.status_code == 200, response.text

        blocked = client.post(
            f"/api/ingest/pienissimo/{org.slug}",
            json={
                "email": f"rate.blocked.{uuid.uuid4().hex[:4]}@example.com",
                "send_email": False,
            },
        )
        assert blocked.status_code == 429, blocked.text
    finally:
        settings.INGEST_RATE_LIMIT_MAX_REQUESTS = previous_limit
        settings.INGEST_RATE_LIMIT_WINDOW_SECONDS = previous_window


def test_ingest_skips_legacy_card_collision_and_returns_200(client, db):
    org, batch = _create_org_with_batch(db, slug_prefix="ingest-collision")
    _create_integration_key(db, org_id=org.id, active=True)

    legacy_member = Member(
        org_id=org.id,
        first_name="Legacy",
        last_name="Collision",
        email=f"legacy.collision.{uuid.uuid4().hex[:6]}@example.com",
        status=MemberStatus.ACTIVE,
        card_no=batch.start_no,
        card_year=datetime.utcnow().year,
    )
    db.add(legacy_member)
    db.commit()

    response = client.post(
        f"/api/ingest/pienissimo/{org.slug}",
        json={
            "email": f"collision.{uuid.uuid4().hex[:6]}@example.com",
            "send_email": False,
        },
    )
    assert response.status_code == 200, response.text

    payload = response.json()
    assert payload["card_number"] == batch.start_no + 1
