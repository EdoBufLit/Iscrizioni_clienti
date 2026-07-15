from app.log_redaction import hash_identifier, redact_for_log, redact_mapping, redact_url
from app.db import SessionLocal
from app.models import EmailOutbox
from app.services.email_outbox import enqueue_email, mark_sent


def test_redact_for_log_masks_common_sensitive_patterns():
    text = (
        "email mario.rossi@example.com phone +39 333 123 4567 "
        "cf RSSMRA80A01H501U token=abc123456789 secret: supersecretvalue"
    )

    redacted = str(redact_for_log(text))

    assert "mario.rossi@example.com" not in redacted
    assert "+39 333 123 4567" not in redacted
    assert "RSSMRA80A01H501U" not in redacted
    assert "abc123456789" not in redacted
    assert "supersecretvalue" not in redacted
    assert f"email_hash:{hash_identifier('mario.rossi@example.com')}" in redacted


def test_redact_mapping_uses_sensitive_keys_and_preserves_operational_values():
    payload = {
        "member_id": 42,
        "status": "queued",
        "payment_payload": {"checkout_url": "https://pay.example/checkout?token=tok_123"},
        "whatsapp_message": "Scrivi a +39 333 123 4567",
        "document_filename": "carta-identita-mario.pdf",
        "email": "mario.rossi@example.com",
        "password": 12345678,
    }

    redacted = redact_mapping(payload)

    assert redacted is not None
    assert redacted["member_id"] == 42
    assert redacted["status"] == "queued"
    assert redacted["payment_payload"] == "[REDACTED]"
    assert redacted["whatsapp_message"] == "[REDACTED]"
    assert redacted["document_filename"] == "[REDACTED]"
    assert str(redacted["email"]).startswith("identifier_hash:")
    assert redacted["password"] == "[REDACTED]"


def test_redact_url_masks_signed_or_tokenized_query_values():
    url = "https://example.com/auth/verify?token=raw-token&role=member&email=mario@example.com#secret"

    redacted = redact_url(url)

    assert redacted == (
        "https://example.com/auth/verify?token=%5BREDACTED%5D"
        "&role=member&email=%5BREDACTED%5D#[REDACTED]"
    )


def test_redaction_preserves_iso_audit_timestamps():
    timestamp = "2026-07-15T15:40:57.125624+00:00"

    redacted = redact_mapping({"ts": timestamp})

    assert redacted == {"ts": timestamp}


def test_sent_outbox_scrubs_raw_capability_bodies():
    db = SessionLocal()
    try:
        raw_token = "raw-capability-that-must-not-remain"
        outbox_id = enqueue_email(
            db,
            email_type="member_magic_link",
            to_email="payload-scrub@example.com",
            subject="Accesso",
            payload={
                "text_body": f"https://example.test/auth?token={raw_token}",
                "html_body": f"<a href='https://example.test/auth?token={raw_token}'>Vai</a>",
            },
            priority=1,
        )
        db.commit()

        mark_sent(db, outbox_id, "provider-message-id")
        db.commit()
        row = db.query(EmailOutbox).filter_by(id=outbox_id).one()

        assert row.payload_json == {
            "redacted": True,
            "delivery_finalized": True,
        }
        assert raw_token not in str(row.payload_json)
    finally:
        db.close()
