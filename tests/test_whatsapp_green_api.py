from __future__ import annotations

import uuid

import pytest
from starlette.requests import Request

from app.config import (
    GREEN_API_OFFICIAL_WEBHOOK_IPS,
    parse_ip_network_allowlist,
    settings,
)
from app.db import SessionLocal
from app.middleware import get_client_ip
from app.models import (
    EmailOutbox,
    Organization,
    WhatsAppChat,
    WhatsAppConnection,
    WhatsAppMessage,
    WhatsAppWebhookEvent,
    WhatsAppWebhookEventStatus,
)
from app.services.whatsapp_provider import (
    GreenApiProvider,
    encrypt_green_api_token,
    green_api_webhook_source_ip_allowed,
    hash_webhook_secret,
)
from app.services.whatsapp_sync import (
    ingest_green_api_webhook,
    process_queued_outbound_messages,
    queue_outbound_message,
)
from app.services.whatsapp_webhook_outbox import drain_webhook_outbox_for_tests


def _create_green_webhook_connection(
    db,
    *,
    webhook_secret: str | None,
    is_active: bool = True,
) -> WhatsAppConnection:
    suffix = uuid.uuid4().hex[:8]
    instance_id = str(10_000_000 + (uuid.uuid4().int % 89_999_999))
    org = Organization(
        name=f"Green Webhook Club {suffix}",
        slug=f"green-webhook-{suffix}",
        is_active=is_active,
        communications_enabled=True,
    )
    db.add(org)
    db.flush()
    connection = WhatsAppConnection(
        org_id=org.id,
        instance_name=f"assonam-org-{org.id}",
        provider="green_api",
        provider_instance_id=instance_id,
        provider_webhook_secret_hash=hash_webhook_secret(webhook_secret),
        status="connected",
    )
    db.add(connection)
    db.commit()
    db.refresh(connection)
    return connection


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


def test_green_api_webhook_requires_configured_secret_and_deduplicates(
    client,
    monkeypatch,
) -> None:
    original_values = (
        settings.ENABLE_WHATSAPP,
        settings.GREEN_API_WEBHOOK_REQUIRE_SECRET,
        settings.GREEN_API_WEBHOOK_SECRET,
        settings.GREEN_API_WEBHOOK_ALLOWED_IPS,
    )
    settings.ENABLE_WHATSAPP = True
    # A per-connection secret must be enforced even during a compatibility rollout.
    settings.GREEN_API_WEBHOOK_REQUIRE_SECRET = False
    settings.GREEN_API_WEBHOOK_SECRET = None
    settings.GREEN_API_WEBHOOK_ALLOWED_IPS = ("46.101.109.139/32",)
    # Even an official source IP must never bypass a configured secret.
    monkeypatch.setattr(
        "app.routes.whatsapp_evolution.get_client_ip",
        lambda _request: "46.101.109.139",
    )
    db = SessionLocal()
    try:
        secret = "green-webhook-secret-sentinel"
        connection = _create_green_webhook_connection(db, webhook_secret=secret)
        payload = {
            "typeWebhook": "stateInstanceChanged",
            "instanceData": {"idInstance": int(connection.provider_instance_id)},
            "timestamp": 1_780_000_001,
            "stateInstance": "authorized",
        }

        missing = client.post("/api/internal/whatsapp/green-api", json=payload)
        wrong = client.post(
            "/api/internal/whatsapp/green-api",
            json=payload,
            headers={"Authorization": "Bearer wrong-secret"},
        )
        assert missing.status_code == 403
        assert wrong.status_code == 403
        assert (
            db.query(WhatsAppWebhookEvent)
            .filter(WhatsAppWebhookEvent.instance_name == connection.provider_instance_id)
            .count()
            == 0
        )

        accepted = client.post(
            "/api/internal/whatsapp/green-api",
            json=payload,
            headers={"Authorization": f"Bearer {secret}"},
        )
        duplicate = client.post(
            "/api/internal/whatsapp/green-api",
            json=payload,
            headers={"Authorization": f"Bearer {secret}"},
        )
        legacy_header = client.post(
            "/api/internal/whatsapp/green-api",
            json={**payload, "timestamp": 1_780_000_003},
            headers={"X-Green-Api-Secret": secret},
        )
        assert accepted.status_code == 200, accepted.text
        assert duplicate.status_code == 200, duplicate.text
        assert legacy_header.status_code == 200, legacy_header.text
        assert duplicate.json()["event_id"] == accepted.json()["event_id"]

        drain_webhook_outbox_for_tests()
        db.expire_all()
        event = (
            db.query(WhatsAppWebhookEvent)
            .filter(WhatsAppWebhookEvent.id == accepted.json()["event_id"])
            .one()
        )
        assert event.status == WhatsAppWebhookEventStatus.PROCESSED.value
        assert event.payload_json == {"redacted": True}

        duplicate_after_redaction = client.post(
            "/api/internal/whatsapp/green-api",
            json=payload,
            headers={"Authorization": f"Bearer {secret}"},
        )
        assert duplicate_after_redaction.status_code == 200
        assert duplicate_after_redaction.json()["event_id"] == event.id
        assert drain_webhook_outbox_for_tests(max_loops=1)["claimed"] == 0
    finally:
        db.close()
        (
            settings.ENABLE_WHATSAPP,
            settings.GREEN_API_WEBHOOK_REQUIRE_SECRET,
            settings.GREEN_API_WEBHOOK_SECRET,
            settings.GREEN_API_WEBHOOK_ALLOWED_IPS,
        ) = original_values


def test_green_api_webhook_production_enforcement_global_secret_and_limits(client) -> None:
    original_values = (
        settings.ENABLE_WHATSAPP,
        settings.GREEN_API_WEBHOOK_REQUIRE_SECRET,
        settings.GREEN_API_WEBHOOK_SECRET,
        settings.WHATSAPP_WEBHOOK_MAX_BODY_BYTES,
    )
    settings.ENABLE_WHATSAPP = True
    settings.GREEN_API_WEBHOOK_REQUIRE_SECRET = True
    settings.GREEN_API_WEBHOOK_SECRET = "global-green-webhook-secret"
    settings.WHATSAPP_WEBHOOK_MAX_BODY_BYTES = 1024
    db = SessionLocal()
    try:
        connection = _create_green_webhook_connection(db, webhook_secret=None)
        inactive_connection = _create_green_webhook_connection(
            db,
            webhook_secret=None,
            is_active=False,
        )
        payload = {
            "typeWebhook": "stateInstanceChanged",
            "instanceData": {"idInstance": int(connection.provider_instance_id)},
            "timestamp": 1_780_000_002,
            "stateInstance": "authorized",
        }

        missing = client.post("/api/internal/whatsapp/green-api", json=payload)
        accepted = client.post(
            "/api/internal/whatsapp/green-api",
            json=payload,
            headers={"Authorization": "Bearer global-green-webhook-secret"},
        )
        unknown = client.post(
            "/api/internal/whatsapp/green-api",
            json={**payload, "instanceData": {"idInstance": 99999999}},
            headers={"Authorization": "Bearer global-green-webhook-secret"},
        )
        inactive = client.post(
            "/api/internal/whatsapp/green-api",
            json={
                **payload,
                "instanceData": {
                    "idInstance": int(inactive_connection.provider_instance_id),
                },
            },
            headers={"Authorization": "Bearer global-green-webhook-secret"},
        )
        oversized = client.post(
            "/api/internal/whatsapp/green-api",
            json={**payload, "padding": "x" * 2048},
            headers={"Authorization": "Bearer global-green-webhook-secret"},
        )

        assert missing.status_code == 403
        assert accepted.status_code == 200, accepted.text
        assert unknown.status_code == 403
        assert inactive.status_code == 403
        assert oversized.status_code == 413
    finally:
        db.close()
        (
            settings.ENABLE_WHATSAPP,
            settings.GREEN_API_WEBHOOK_REQUIRE_SECRET,
            settings.GREEN_API_WEBHOOK_SECRET,
            settings.WHATSAPP_WEBHOOK_MAX_BODY_BYTES,
        ) = original_values


def test_green_api_webhook_without_secret_requires_allowed_ip_and_known_instance(
    client,
    monkeypatch,
) -> None:
    original_values = (
        settings.ENABLE_WHATSAPP,
        settings.GREEN_API_WEBHOOK_REQUIRE_SECRET,
        settings.GREEN_API_WEBHOOK_SECRET,
        settings.GREEN_API_WEBHOOK_ALLOWED_IPS,
    )
    settings.ENABLE_WHATSAPP = True
    settings.GREEN_API_WEBHOOK_REQUIRE_SECRET = False
    settings.GREEN_API_WEBHOOK_SECRET = None
    settings.GREEN_API_WEBHOOK_ALLOWED_IPS = ("46.101.109.139/32",)
    resolved_source = {"ip": "46.101.109.139"}
    monkeypatch.setattr(
        "app.routes.whatsapp_evolution.get_client_ip",
        lambda _request: resolved_source["ip"],
    )
    db = SessionLocal()
    try:
        connection = _create_green_webhook_connection(db, webhook_secret=None)
        payload = {
            "typeWebhook": "stateInstanceChanged",
            "instanceData": {"idInstance": int(connection.provider_instance_id)},
            "timestamp": 1_780_000_100,
            "stateInstance": "authorized",
        }

        allowed = client.post("/api/internal/whatsapp/green-api", json=payload)
        assert allowed.status_code == 200, allowed.text

        resolved_source["ip"] = "8.8.8.8"
        denied = client.post(
            "/api/internal/whatsapp/green-api",
            json={**payload, "timestamp": 1_780_000_101},
        )
        assert denied.status_code == 403

        resolved_source["ip"] = "46.101.109.139"
        settings.GREEN_API_WEBHOOK_REQUIRE_SECRET = True
        strict_without_secret = client.post(
            "/api/internal/whatsapp/green-api",
            json={**payload, "timestamp": 1_780_000_102},
        )
        assert strict_without_secret.status_code == 403

        settings.GREEN_API_WEBHOOK_REQUIRE_SECRET = False
        unknown_instance = client.post(
            "/api/internal/whatsapp/green-api",
            json={
                **payload,
                "instanceData": {"idInstance": 99999999},
                "timestamp": 1_780_000_103,
            },
        )
        assert unknown_instance.status_code == 403
    finally:
        db.close()
        (
            settings.ENABLE_WHATSAPP,
            settings.GREEN_API_WEBHOOK_REQUIRE_SECRET,
            settings.GREEN_API_WEBHOOK_SECRET,
            settings.GREEN_API_WEBHOOK_ALLOWED_IPS,
        ) = original_values


def test_green_api_ip_allowlist_configuration_is_fail_closed() -> None:
    official_networks = parse_ip_network_allowlist(GREEN_API_OFFICIAL_WEBHOOK_IPS)

    assert len(official_networks) == 12
    assert "46.101.109.139/32" in official_networks
    assert green_api_webhook_source_ip_allowed(
        "46.101.109.139",
        official_networks,
    )
    assert not green_api_webhook_source_ip_allowed("8.8.8.8", official_networks)
    assert parse_ip_network_allowlist("46.101.109.139, 46.101.109.139/32") == (
        "46.101.109.139/32",
    )
    with pytest.raises(ValueError, match="Invalid IP/CIDR"):
        parse_ip_network_allowlist("not-an-ip")
    with pytest.raises(ValueError, match="accept-all"):
        parse_ip_network_allowlist("0.0.0.0/0")


def test_get_client_ip_uses_forwarding_only_from_trusted_proxy() -> None:
    def build_request(peer: str, forwarded_for: str) -> Request:
        return Request(
            {
                "type": "http",
                "method": "POST",
                "scheme": "https",
                "path": "/api/internal/whatsapp/green-api",
                "raw_path": b"/api/internal/whatsapp/green-api",
                "query_string": b"",
                "headers": [(b"x-forwarded-for", forwarded_for.encode("ascii"))],
                "client": (peer, 12345),
                "server": ("testserver", 443),
            }
        )

    assert get_client_ip(build_request("127.0.0.1", "46.101.109.139")) == (
        "46.101.109.139"
    )
    assert get_client_ip(build_request("8.8.8.8", "46.101.109.139")) == "8.8.8.8"
