import uuid

import pytest
from sqlalchemy import func

from app.config import settings
from app.db import SessionLocal
from app.models import CardBatch, IntegrationApiKey, Member, MemberStatus, Organization, SignupSource
from app.security import hash_api_key


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _create_org_with_batch_and_key(db) -> tuple[Organization, CardBatch]:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Ingest Org {suffix}",
        slug=f"ingest-org-{suffix}",
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

    key = IntegrationApiKey(
        org_id=org.id,
        name="pienissimo",
        key_hash=hash_api_key(f"ingest-key-{uuid.uuid4().hex}"),
        scopes=["issue_member"],
        is_active=True,
    )
    db.add(key)
    db.commit()
    return org, batch


def test_ingest_requires_secret_when_configured(client, db):
    org, _batch = _create_org_with_batch_and_key(db)
    previous_secret = settings.INGEST_SECRET
    settings.INGEST_SECRET = f"secret-{uuid.uuid4().hex[:8]}"
    try:
        response = client.post(
            f"/api/ingest/pienissimo/{org.slug}",
            json={
                "email": f"secret.required.{uuid.uuid4().hex[:6]}@example.com",
                "external_customer_id": f"lead-{uuid.uuid4().hex[:8]}",
            },
        )
        assert response.status_code == 401, response.text
    finally:
        settings.INGEST_SECRET = previous_secret


def test_ingest_with_secret_creates_active_member_with_card(client, db):
    org, batch = _create_org_with_batch_and_key(db)
    ingest_secret = f"ingest-{uuid.uuid4().hex[:10]}"
    previous_secret = settings.INGEST_SECRET
    settings.INGEST_SECRET = ingest_secret

    external_customer_id = f"lead-{uuid.uuid4().hex[:10]}"
    try:
        response = client.post(
            f"/api/ingest/pienissimo/{org.slug}",
            json={
                "Email": f"ingest.member.{uuid.uuid4().hex[:6]}@example.com",
                "nominativo": "Mario Rossi",
                "telefono": "+39333111222",
                "lead_id": external_customer_id,
                "send_email": False,
                "extra_custom_field": "keep-ignored",
            },
            headers={"X-ASSO-INGEST-SECRET": ingest_secret},
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["status"] == "ok"
        assert batch.start_no <= payload["card_number"] <= batch.end_no
        assert "/api/cards/verify/" in payload["card_url"]

        member = db.query(Member).filter(Member.id == payload["member_id"]).first()
        assert member is not None
        assert member.status == MemberStatus.ACTIVE
        assert member.card_no == payload["card_number"]
        assert member.signup_source == SignupSource.PIENISSIMO.value
        assert member.external_customer_id == external_customer_id
        assert member.first_name == "Mario"
        assert member.last_name == "Rossi"
    finally:
        settings.INGEST_SECRET = previous_secret
