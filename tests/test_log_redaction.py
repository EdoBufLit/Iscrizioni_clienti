from app.log_redaction import hash_identifier, redact_for_log, redact_mapping, redact_url


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
    }

    redacted = redact_mapping(payload)

    assert redacted is not None
    assert redacted["member_id"] == 42
    assert redacted["status"] == "queued"
    assert redacted["payment_payload"] == "[REDACTED]"
    assert redacted["whatsapp_message"] == "[REDACTED]"
    assert redacted["document_filename"] == "[REDACTED]"
    assert redacted["email"] == "[REDACTED]"


def test_redact_url_masks_signed_or_tokenized_query_values():
    url = "https://example.com/auth/verify?token=raw-token&role=member&email=mario@example.com#secret"

    redacted = redact_url(url)

    assert redacted == "https://example.com/auth/verify?token=%5BREDACTED%5D&role=member&email=%5BREDACTED%5D#[REDACTED]"
