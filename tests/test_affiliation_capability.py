from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.config import settings
from app.db import SessionLocal
from app.models_affiliation import AffiliationApplication, AffiliationDocument
from app.utils import hash_token


def _create_draft(client, *, email: str | None = None, organization_name: str | None = None):
    payload = {}
    if email is not None:
        payload["applicant_email"] = email
    if organization_name is not None:
        payload["organization_name"] = organization_name
    response = client.post("/api/affiliazione/draft", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def _application(application_id: int) -> AffiliationApplication:
    db = SessionLocal()
    try:
        application = db.get(AffiliationApplication, application_id)
        assert application is not None
        db.expunge(application)
        return application
    finally:
        db.close()


def test_new_affiliation_capability_is_hash_only_at_rest_and_lookup_works(client):
    draft = _create_draft(
        client,
        email=f"capability-{uuid.uuid4().hex}@example.com",
    )
    raw_token = draft["public_token"]
    application_id = int(draft["id"])

    assert len(raw_token) == 32
    assert re.fullmatch(r"[A-Za-z0-9_-]{32}", raw_token)

    application = _application(application_id)
    assert application.public_token_version == 1
    assert application.public_token_hash == hash_token(raw_token)
    assert application.public_token == application.public_token_hash
    assert application.public_token != raw_token
    assert application.public_token_expires_at is not None

    db = SessionLocal()
    try:
        row = db.execute(
            text("SELECT * FROM affiliation_applications WHERE id = :id"),
            {"id": application_id},
        ).mappings().one()
        assert all(raw_token not in value for value in row.values() if isinstance(value, str))
        document = AffiliationDocument(
            application_id=application_id,
            doc_type="statuto",
            rel_path=f"affiliations/{application_id}/statuto.pdf",
            original_filename="statuto.pdf",
        )
        db.add(document)
        db.commit()
        document_id = int(document.id)
    finally:
        db.close()

    lookup = client.get(f"/api/affiliazione/draft/{raw_token}")
    assert lookup.status_code == 200, lookup.text
    assert lookup.json()["public_token"] == raw_token
    assert lookup.json()["resume_url"] == f"/affiliazione?token={raw_token}"
    assert lookup.json()["documents"][0]["download_url"] == (
        f"/api/affiliazione/draft/{raw_token}/documents/{document_id}"
    )

    # A leaked DB hash is not itself accepted as the bearer capability.
    hash_lookup = client.get(f"/api/affiliazione/draft/{application.public_token_hash}")
    assert hash_lookup.status_code == 404


def test_affiliation_identity_alone_cannot_reconstruct_existing_capability(client):
    email = f"capability-retry-{uuid.uuid4().hex}@example.com"
    organization_name = f"Capability Retry {uuid.uuid4().hex}"
    first = _create_draft(client, email=email, organization_name=organization_name)
    retry_payload = {
        "applicant_email": email.upper(),
        "organization_name": f"  {organization_name}  ",
    }

    missing_capability = client.post(
        "/api/affiliazione/draft",
        json=retry_payload,
        headers={"Idempotency-Key": "predictable-from-public-identity"},
    )
    wrong_capability = client.post(
        "/api/affiliazione/draft",
        json=retry_payload,
        headers={
            "Idempotency-Key": "predictable-from-public-identity",
            "X-Affiliation-Draft-Token": "wrong-but-well-formed-capability",
        },
    )

    assert missing_capability.status_code == 409
    assert wrong_capability.status_code == 409
    assert missing_capability.json()["detail"] == wrong_capability.json()["detail"]
    blocked_response = missing_capability.text
    assert first["public_token"] not in blocked_response
    assert "public_token" not in blocked_response
    assert "resume_url" not in blocked_response

    authorized_retry = client.post(
        "/api/affiliazione/draft",
        json=retry_payload,
        headers={"X-Affiliation-Draft-Token": first["public_token"]},
    )
    assert authorized_retry.status_code == 200, authorized_retry.text
    second = authorized_retry.json()
    assert second["id"] == first["id"]
    assert second["public_token"] == first["public_token"]
    assert second["resume_url_absolute"].endswith(
        f"/affiliazione?token={first['public_token']}"
    )


def test_affiliation_patch_identity_collision_never_exposes_other_capability(client):
    target_email = f"capability-target-{uuid.uuid4().hex}@example.com"
    target_name = f"Capability Target {uuid.uuid4().hex}"
    target = _create_draft(client, email=target_email, organization_name=target_name)
    attacker = _create_draft(
        client,
        email=f"capability-attacker-{uuid.uuid4().hex}@example.com",
        organization_name=f"Capability Attacker {uuid.uuid4().hex}",
    )

    collision = client.patch(
        f"/api/affiliazione/draft/{attacker['public_token']}",
        json={
            "applicant_email": target_email,
            "organization_name": target_name,
        },
    )

    assert collision.status_code == 409, collision.text
    assert target["public_token"] not in collision.text
    assert "public_token" not in collision.text
    assert "resume_url" not in collision.text
    assert client.get(f"/api/affiliazione/draft/{target['public_token']}").status_code == 200
    assert client.get(f"/api/affiliazione/draft/{attacker['public_token']}").status_code == 200


def test_new_affiliation_capability_expires_with_410_but_admin_access_remains(client):
    draft = _create_draft(
        client,
        email=f"capability-expired-{uuid.uuid4().hex}@example.com",
    )
    application_id = int(draft["id"])
    raw_token = draft["public_token"]

    db = SessionLocal()
    try:
        application = db.get(AffiliationApplication, application_id)
        application.public_token_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    finally:
        db.close()

    expired = client.get(f"/api/affiliazione/draft/{raw_token}")
    assert expired.status_code == 410, expired.text
    assert "scaduto" in expired.json()["detail"].lower()

    login = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )
    assert login.status_code == 200, login.text
    detail = client.get(f"/api/super-admin/affiliations/{application_id}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["public_token"] is None


def test_legacy_plaintext_affiliation_capability_keeps_working_without_expiry(client):
    legacy_token = f"legacy-{uuid.uuid4().hex}"
    db = SessionLocal()
    try:
        application = AffiliationApplication(
            public_token=legacy_token,
            applicant_email=f"legacy-{uuid.uuid4().hex}@example.com",
        )
        db.add(application)
        db.commit()
        application_id = int(application.id)
    finally:
        db.close()

    response = client.get(f"/api/affiliazione/draft/{legacy_token}")
    assert response.status_code == 200, response.text
    assert response.json()["id"] == application_id
    assert response.json()["public_token"] == legacy_token


def test_affiliation_stripe_urls_and_metadata_receive_raw_token(client, monkeypatch):
    draft = _create_draft(
        client,
        email=f"capability-stripe-{uuid.uuid4().hex}@example.com",
    )
    raw_token = draft["public_token"]
    captured: dict = {}

    class FakeResponse:
        ok = True
        content = b'{"id":"cs_capability","url":"https://checkout.example/session"}'

        @staticmethod
        def json():
            return {
                "id": "cs_capability",
                "url": "https://checkout.example/session",
            }

    def fake_post(url, *, headers, data, timeout):
        captured.update(url=url, headers=headers, data=data, timeout=timeout)
        return FakeResponse()

    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_capability")
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", "whsec_capability")
    monkeypatch.setattr(settings, "STRIPE_PRICE_ID", "price_capability")
    monkeypatch.setattr("app.routes.affiliation.requests.post", fake_post)

    response = client.post(
        f"/api/affiliazione/draft/{raw_token}/stripe/checkout",
        headers={"Idempotency-Key": "capability-checkout"},
    )
    assert response.status_code == 200, response.text
    assert captured["data"]["metadata[public_token]"] == raw_token
    assert f"token={raw_token}&stripe=success" in captured["data"]["success_url"]
    assert f"token={raw_token}&stripe=cancel" in captured["data"]["cancel_url"]
    assert hash_token(raw_token) not in captured["data"]["success_url"]
    assert captured["headers"]["Idempotency-Key"] == "capability-checkout"
