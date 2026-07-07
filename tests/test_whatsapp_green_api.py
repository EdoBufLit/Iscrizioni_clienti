from __future__ import annotations

import uuid

from app.config import settings
from app.db import SessionLocal
from app.models import EmailOutbox, Organization, WhatsAppChat, WhatsAppConnection, WhatsAppMessage
from app.services.whatsapp_provider import GreenApiProvider, encrypt_green_api_token
from app.services.whatsapp_sync import (
    ingest_green_api_webhook,
    process_queued_outbound_messages,
    queue_outbound_message,
)


def test_green_api_provider_state_qr_and_send(monkeypatch) -> None:
    original_key = settings.SUMUP_CREDENTIALS_ENCRYPTION_KEY
    settings.SUMUP_CREDENTIALS_ENCRYPTION_KEY = "green-api-test-secret"
    calls: list[dict[str, object]] = []

    class FakeResponse:
        def __init__(self, payload: dict, status_code: int = 200):
            self._payload = payload
            self.status_code = status_code
            self.ok = 200 <= status_code < 300
            self.reason = "OK"
            self.text = ""

        def json(self):
            return self._payload

    def fake_request(method, url, json=None, headers=None, timeout=None):
        calls.append({"method": method, "url": url, "json": json, "headers": headers, "timeout": timeout})
        if "/getStateInstance/" in url:
            return FakeResponse({"stateInstance": "authorized"})
        if "/qr/" in url:
            return FakeResponse({"type": "qrCode", "message": "base64-qr"})
        if "/sendMessage/" in url:
            return FakeResponse({"idMessage": "green-msg-1"})
        raise AssertionError(f"Unexpected Green API URL: {url}")

    monkeypatch.setattr("app.services.whatsapp_provider.requests.request", fake_request)

    try:
        connection = WhatsAppConnection(
            org_id=1,
            instance_name="assonam-org-1",
            provider="green_api",
            provider_instance_id="12345",
            provider_token_encrypted=encrypt_green_api_token("green-token"),
            provider_api_url="https://api.green.test",
            status="not_connected",
        )
        provider = GreenApiProvider()

        state = provider.get_state(connection)
        qr = provider.get_qr(connection)
        send_result = provider.send_text(connection, number="+39 333 1234567", text="Ciao")

        assert state.status == "connected"
        assert qr.status == "qr_required"
        assert qr.qr_code == "data:image/png;base64,base64-qr"
        assert send_result.external_message_id == "green-msg-1"
        assert calls[-1]["json"] == {"chatId": "393331234567@c.us", "message": "Ciao"}
        assert calls[-1]["url"] == "https://api.green.test/waInstance12345/sendMessage/green-token"
    finally:
        settings.SUMUP_CREDENTIALS_ENCRYPTION_KEY = original_key


def test_green_api_webhook_ingests_inbound_message() -> None:
    db = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:8]
        instance_id = str(10_000_000 + (uuid.uuid4().int % 89_999_999))
        org = Organization(
            name=f"Green Club {suffix}",
            slug=f"green-club-{suffix}",
            is_active=True,
            communications_enabled=True,
        )
        db.add(org)
        db.commit()
        db.refresh(org)

        connection = WhatsAppConnection(
            org_id=org.id,
            instance_name=f"assonam-org-{org.id}",
            provider="green_api",
            provider_instance_id=instance_id,
            status="connected",
            phone_number="+390612345678",
        )
        db.add(connection)
        db.commit()
        db.refresh(connection)

        ingest_green_api_webhook(
            db,
                payload={
                    "typeWebhook": "incomingMessageReceived",
                    "instanceData": {"idInstance": int(instance_id)},
                "timestamp": 1_780_000_000,
                "idMessage": "green-in-1",
                "senderData": {
                    "chatId": "393331234567@c.us",
                    "sender": "393331234567@c.us",
                    "senderName": "Mario Rossi",
                },
                "messageData": {
                    "typeMessage": "textMessage",
                    "textMessageData": {"textMessage": "Vorrei info"},
                },
            },
        )
        db.commit()

        message = (
            db.query(WhatsAppMessage)
            .filter(
                WhatsAppMessage.connection_id == connection.id,
                WhatsAppMessage.external_message_id == "green-in-1",
            )
            .first()
        )
        assert message is not None
        assert message.direction == "inbound"
        assert message.sender_phone == "+393331234567"
        assert message.text_body == "Vorrei info"
        assert message.chat.display_name == "Mario Rossi"
    finally:
        db.close()


def test_whatsapp_outbox_queues_email_fallback_when_connection_unavailable() -> None:
    db = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:8]
        instance_id = str(10_000_000 + (uuid.uuid4().int % 89_999_999))
        org = Organization(
            name=f"Fallback Club {suffix}",
            slug=f"fallback-club-{suffix}",
            is_active=True,
            communications_enabled=True,
        )
        db.add(org)
        db.commit()
        db.refresh(org)

        connection = WhatsAppConnection(
            org_id=org.id,
            instance_name=f"assonam-org-{org.id}",
            provider="green_api",
            provider_instance_id=instance_id,
            status="not_connected",
        )
        db.add(connection)
        db.commit()
        db.refresh(connection)

        chat = WhatsAppChat(
            org_id=org.id,
            connection_id=connection.id,
            external_chat_id="393331234567@s.whatsapp.net",
            display_name="Mario Rossi",
        )
        db.add(chat)
        db.commit()
        db.refresh(chat)

        message = queue_outbound_message(
            db,
            connection=connection,
            chat=chat,
            text_body="La tua prenotazione e confermata.",
            fallback_email_to="mario@example.com",
            fallback_email_subject="Conferma prenotazione",
        )
        db.commit()

        stats = process_queued_outbound_messages(db, limit=5)
        db.refresh(message)

        assert stats["fallback_email"] == 1
        assert message.status == "failed"
        assert message.fallback_email_outbox_id
        fallback = db.query(EmailOutbox).filter(EmailOutbox.id == message.fallback_email_outbox_id).first()
        assert fallback is not None
        assert fallback.to_email == "mario@example.com"
        assert fallback.subject == "Conferma prenotazione"
        assert fallback.dedupe_key == f"whatsapp-fallback:{message.id}"
    finally:
        db.close()
