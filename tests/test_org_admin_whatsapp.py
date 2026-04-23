from __future__ import annotations

from datetime import datetime, timedelta
import uuid

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import AdminRole, AdminUser, OrgAdminToken, Organization, WhatsAppChat, WhatsAppMessage
from app.services.whatsapp_evolution import EvolutionLiteClient
from app.services.whatsapp_evolution import (
    EvolutionConnectionSnapshot,
    EvolutionContact,
    EVOLUTION_WEBHOOK_EVENTS,
    EvolutionSendTextResult,
    parse_connection_snapshot,
)
from app.services.whatsapp_sync import apply_connection_snapshot, get_or_create_connection
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture(autouse=True)
def _restore_whatsapp_settings():
    original_enabled = settings.ENABLE_WHATSAPP_EVOLUTION
    original_api_key = settings.EVOLUTION_API_KEY
    try:
        settings.ENABLE_WHATSAPP_EVOLUTION = True
        settings.EVOLUTION_API_KEY = "test-evolution-key"
        yield
    finally:
        settings.ENABLE_WHATSAPP_EVOLUTION = original_enabled
        settings.EVOLUTION_API_KEY = original_api_key


def _login_org_admin(client, db, admin_id: int) -> None:
    token_str = f"org-whatsapp-{admin_id}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)


def _create_org_admin(db, *, communications_enabled: bool) -> tuple[Organization, AdminUser]:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"WhatsApp Club {suffix}",
        slug=f"whatsapp-{suffix}",
        is_active=True,
        communications_enabled=communications_enabled,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    admin = AdminUser(
        email=f"whatsapp-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return org, admin


def test_whatsapp_feature_flag_disabled_returns_not_found(client, db):
    settings.ENABLE_WHATSAPP_EVOLUTION = False
    org, admin = _create_org_admin(db, communications_enabled=True)
    _login_org_admin(client, db, admin.id)

    response = client.get("/api/org-admin/communications/whatsapp/connection")

    assert response.status_code == 404, response.text
    assert "Feature WhatsApp Evolution" in response.json()["detail"]


def test_whatsapp_module_locked_returns_403(client, db):
    org, admin = _create_org_admin(db, communications_enabled=False)
    _login_org_admin(client, db, admin.id)

    response = client.get("/api/org-admin/communications/whatsapp/connection")

    assert response.status_code == 403, response.text
    assert "Modulo Comunicazioni" in response.json()["detail"]


def test_whatsapp_connect_send_and_disconnect(client, db, monkeypatch):
    org, admin = _create_org_admin(db, communications_enabled=True)
    _login_org_admin(client, db, admin.id)
    outbound_texts: list[str] = []
    send_counter = {"value": 0}

    def fake_ensure_instance(self, *, org_id: int):
        assert org_id == org.id
        return {"instance": {"instanceName": f"assonam-org-{org_id}"}}

    def fake_connect(self, instance_name: str):
        assert instance_name == f"assonam-org-{org.id}"
        return EvolutionConnectionSnapshot(
            raw_state="connecting",
            status="qr_required",
            qr_code="data:image/png;base64,abc123",
            phone_number=None,
            profile_name=None,
            last_error=None,
            connected_at=None,
            raw={},
        )

    def fake_send_text(self, instance_name: str, *, number: str, text: str):
        assert instance_name == f"assonam-org-{org.id}"
        assert "39333" in number
        outbound_texts.append(text)
        send_counter["value"] += 1
        external_id = f"wamid-outbound-{org.id}-{send_counter['value']}"
        return EvolutionSendTextResult(
            external_message_id=external_id,
            status="sent",
            raw={"id": external_id, "status": "sent"},
        )

    def fake_logout(self, instance_name: str):
        assert instance_name == f"assonam-org-{org.id}"
        return {"ok": True}

    monkeypatch.setattr(
        "app.routes.whatsapp_evolution.EvolutionLiteClient.ensure_instance",
        fake_ensure_instance,
    )
    monkeypatch.setattr(
        "app.routes.whatsapp_evolution.EvolutionLiteClient.connect",
        fake_connect,
    )
    monkeypatch.setattr(
        "app.routes.whatsapp_evolution.EvolutionLiteClient.send_text",
        fake_send_text,
    )
    monkeypatch.setattr(
        "app.routes.whatsapp_evolution.EvolutionLiteClient.logout",
        fake_logout,
    )

    connect_res = client.post("/api/org-admin/communications/whatsapp/connect")
    assert connect_res.status_code == 200, connect_res.text
    connect_payload = connect_res.json()["connection"]
    assert connect_payload["status"] == "qr_required"
    assert connect_payload["has_qr"] is True

    connection = get_or_create_connection(db, org)
    connection.status = "connected"
    db.commit()

    outbound_res = client.post(
        "/api/org-admin/communications/whatsapp/outbound",
        json={
            "number": "333 1234567",
            "display_name": "Mario Rossi",
            "text": "Primo contatto dal test",
        },
    )
    assert outbound_res.status_code == 200, outbound_res.text
    outbound_payload = outbound_res.json()
    assert outbound_payload["chat"]["display_name"] == "Mario Rossi"
    assert outbound_payload["chat"]["external_chat_id"] == "393331234567@s.whatsapp.net"
    assert outbound_payload["message"]["direction"] == "outbound"
    assert outbound_payload["message"]["status"] == "sent"
    chat_id = outbound_payload["chat"]["id"]

    send_res = client.post(
        f"/api/org-admin/communications/whatsapp/chats/{chat_id}/messages",
        json={"text": "Ciao dal test"},
    )
    assert send_res.status_code == 200, send_res.text
    send_payload = send_res.json()["message"]
    assert send_payload["direction"] == "outbound"
    assert send_payload["external_message_id"] == f"wamid-outbound-{org.id}-2"
    assert send_payload["status"] == "sent"
    assert outbound_texts == ["Primo contatto dal test", "Ciao dal test"]

    other_org, _other_admin = _create_org_admin(db, communications_enabled=True)
    other_connection = get_or_create_connection(db, other_org)
    other_chat = WhatsAppChat(
        org_id=other_org.id,
        connection_id=other_connection.id,
        external_chat_id="393339999999@s.whatsapp.net",
        display_name="Altro contatto",
    )
    db.add(other_chat)
    db.commit()
    db.refresh(other_chat)

    isolation_res = client.get(f"/api/org-admin/communications/whatsapp/chats/{other_chat.id}/messages")
    assert isolation_res.status_code == 404, isolation_res.text

    disconnect_res = client.post("/api/org-admin/communications/whatsapp/disconnect")
    assert disconnect_res.status_code == 200, disconnect_res.text
    assert disconnect_res.json()["connection"]["status"] == "not_connected"


def test_whatsapp_contacts_and_draft_chat(client, db, monkeypatch):
    org, admin = _create_org_admin(db, communications_enabled=True)
    _login_org_admin(client, db, admin.id)
    connection = get_or_create_connection(db, org)
    connection.status = "connected"
    connection.phone_number = "+393404244452"
    db.commit()

    monkeypatch.setattr(
        "app.routes.whatsapp_evolution.EvolutionLiteClient.list_contacts",
        lambda self, instance_name: [
            EvolutionContact(
                remote_jid="393331234567@s.whatsapp.net",
                display_name="Mario Rossi",
                phone_number="+393331234567",
                profile_pic_url=None,
                created_at=None,
                updated_at=datetime(2026, 3, 18, 21, 35, 0),
                raw={},
            )
        ],
    )

    contacts_res = client.get("/api/org-admin/communications/whatsapp/contacts")
    assert contacts_res.status_code == 200, contacts_res.text
    contacts_payload = contacts_res.json()
    assert contacts_payload["total"] == 1
    assert contacts_payload["items"][0]["display_name"] == "Mario Rossi"

    draft_res = client.post(
        "/api/org-admin/communications/whatsapp/draft-chat",
        json={"number": "333 1234567", "display_name": "Mario Rossi"},
    )
    assert draft_res.status_code == 200, draft_res.text
    draft_payload = draft_res.json()["chat"]
    assert draft_payload["display_name"] == "Mario Rossi"
    assert draft_payload["external_chat_id"] == "393331234567@s.whatsapp.net"

    messages_res = client.get(f"/api/org-admin/communications/whatsapp/chats/{draft_payload['id']}/messages")
    assert messages_res.status_code == 200, messages_res.text
    assert messages_res.json()["total"] == 0


def test_internal_webhook_syncs_connection_messages_and_dedupes(client, db):
    org, admin = _create_org_admin(db, communications_enabled=True)
    _login_org_admin(client, db, admin.id)
    connection = get_or_create_connection(db, org)
    db.commit()
    db.refresh(connection)

    qr_res = client.post(
        "/api/internal/whatsapp/evolution",
        json={
            "event": "qrcode.updated",
            "instance": connection.instance_name,
            "date_time": "2026-03-18T18:10:00Z",
            "data": {"qrcode": {"base64": "data:image/png;base64,test-qr"}},
        },
        headers={"X-Evolution-ApiKey": settings.EVOLUTION_API_KEY},
    )
    assert qr_res.status_code == 200, qr_res.text

    connection_res = client.post(
        "/api/internal/whatsapp/evolution",
        json={
            "event": "connection.update",
            "instance": connection.instance_name,
            "date_time": "2026-03-18T18:11:00Z",
            "data": {
                "state": "open",
                "instance": {
                    "number": "393331234567@s.whatsapp.net",
                    "profileName": "Segreteria Club",
                },
            },
        },
        headers={"X-Evolution-ApiKey": settings.EVOLUTION_API_KEY},
    )
    assert connection_res.status_code == 200, connection_res.text

    message_payload = {
        "event": "messages.upsert",
        "instance": connection.instance_name,
        "date_time": "2026-03-18T18:12:00Z",
        "data": {
            "messages": [
                {
                    "key": {
                        "id": "wamid-inbound-1",
                        "remoteJid": "393338765432@s.whatsapp.net",
                        "fromMe": False,
                    },
                    "pushName": "Luca Bianchi",
                    "message": {"conversation": "Buonasera, vorrei info."},
                    "messageTimestamp": 1773857520,
                }
            ]
        },
    }
    first_message_res = client.post(
        "/api/internal/whatsapp/evolution",
        json=message_payload,
        headers={"X-Evolution-ApiKey": settings.EVOLUTION_API_KEY},
    )
    assert first_message_res.status_code == 200, first_message_res.text

    duplicate_message_res = client.post(
        "/api/internal/whatsapp/evolution",
        json=message_payload,
        headers={"X-Evolution-ApiKey": settings.EVOLUTION_API_KEY},
    )
    assert duplicate_message_res.status_code == 200, duplicate_message_res.text

    outbound_res = client.post(
        "/api/internal/whatsapp/evolution",
        json={
            "event": "send.message",
            "instance": connection.instance_name,
            "date_time": "2026-03-18T18:13:00Z",
            "data": {
                "key": {
                    "id": "wamid-outbound-2",
                    "remoteJid": "393338765432@s.whatsapp.net",
                    "fromMe": True,
                },
                "message": {"conversation": "Ti scriviamo a breve."},
                "messageTimestamp": 1773857580,
            },
        },
        headers={"X-Evolution-ApiKey": settings.EVOLUTION_API_KEY},
    )
    assert outbound_res.status_code == 200, outbound_res.text

    update_res = client.post(
        "/api/internal/whatsapp/evolution",
        json={
            "event": "messages.update",
            "instance": connection.instance_name,
            "date_time": "2026-03-18T18:14:00Z",
            "data": [
                {
                    "key": {
                        "id": "wamid-outbound-2",
                        "remoteJid": "393338765432@s.whatsapp.net",
                        "fromMe": True,
                    },
                    "update": {"status": 4},
                }
            ],
        },
        headers={"X-Evolution-ApiKey": settings.EVOLUTION_API_KEY},
    )
    assert update_res.status_code == 200, update_res.text

    status_res = client.get("/api/org-admin/communications/whatsapp/connection")
    assert status_res.status_code == 200, status_res.text
    status_payload = status_res.json()
    assert status_payload["status"] == "connected"
    assert status_payload["phone_number"] == "+393331234567"
    assert status_payload["profile_name"] == "Segreteria Club"

    chats_res = client.get("/api/org-admin/communications/whatsapp/chats")
    assert chats_res.status_code == 200, chats_res.text
    chats_payload = chats_res.json()
    assert chats_payload["total"] == 1
    chat = chats_payload["items"][0]
    assert chat["display_name"] == "Luca Bianchi"
    assert chat["unread_count"] == 1

    messages_res = client.get(f"/api/org-admin/communications/whatsapp/chats/{chat['id']}/messages")
    assert messages_res.status_code == 200, messages_res.text
    messages_payload = messages_res.json()["items"]
    assert len(messages_payload) == 2
    inbound = next(item for item in messages_payload if item["external_message_id"] == "wamid-inbound-1")
    outbound = next(item for item in messages_payload if item["external_message_id"] == "wamid-outbound-2")
    assert inbound["text_body"] == "Buonasera, vorrei info."
    assert outbound["status"] == "read"

    chats_res_after_read = client.get("/api/org-admin/communications/whatsapp/chats")
    assert chats_res_after_read.status_code == 200, chats_res_after_read.text
    assert chats_res_after_read.json()["items"][0]["unread_count"] == 0


def test_internal_webhook_merges_alias_chat_ids_and_prefers_better_contact_name(client, db):
    org, admin = _create_org_admin(db, communications_enabled=True)
    _login_org_admin(client, db, admin.id)
    connection = get_or_create_connection(db, org)
    connection.status = "connected"
    connection.phone_number = "+393404244452"
    db.commit()
    db.refresh(connection)
    legacy_dedupe_key = f"legacy-alias-message-{org.id}"
    merged_message_id = f"wamid-merged-{org.id}"

    alias_chat = WhatsAppChat(
        org_id=org.id,
        connection_id=connection.id,
        external_chat_id="393338765432:18@s.whatsapp.net",
        display_name="+393338765432",
        last_message_text="Storico alias",
        last_message_at=datetime(2026, 3, 18, 18, 5, 0),
        unread_count=1,
    )
    db.add(alias_chat)
    db.flush()
    db.add(
        WhatsAppMessage(
            org_id=org.id,
            connection_id=connection.id,
            chat_id=alias_chat.id,
            dedupe_key=legacy_dedupe_key,
            direction="inbound",
            status="sent",
            sender_phone="+393338765432",
            recipient_phone=connection.phone_number,
            text_body="Messaggio storico",
            sent_at=datetime(2026, 3, 18, 18, 5, 0),
            created_at=datetime(2026, 3, 18, 18, 5, 0),
        )
    )
    db.commit()

    webhook_res = client.post(
        "/api/internal/whatsapp/evolution",
        json={
            "event": "messages.upsert",
            "instance": connection.instance_name,
            "date_time": "2026-03-18T18:15:00Z",
            "data": {
                "messages": [
                    {
                        "key": {
                            "id": merged_message_id,
                            "remoteJid": "393338765432@s.whatsapp.net",
                            "fromMe": False,
                        },
                        "pushName": "Mario Rossi",
                        "message": {"conversation": "Nuovo messaggio"},
                        "messageTimestamp": 1773857700,
                    }
                ]
            },
        },
        headers={"X-Evolution-ApiKey": settings.EVOLUTION_API_KEY},
    )
    assert webhook_res.status_code == 200, webhook_res.text

    chats_res = client.get("/api/org-admin/communications/whatsapp/chats")
    assert chats_res.status_code == 200, chats_res.text
    chats_payload = chats_res.json()
    assert chats_payload["total"] == 1
    chat = chats_payload["items"][0]
    assert chat["external_chat_id"] == "393338765432@s.whatsapp.net"
    assert chat["display_name"] == "Mario Rossi"
    assert chat["unread_count"] == 2

    messages_res = client.get(f"/api/org-admin/communications/whatsapp/chats/{chat['id']}/messages")
    assert messages_res.status_code == 200, messages_res.text
    message_texts = [item["text_body"] for item in messages_res.json()["items"]]
    assert "Messaggio storico" in message_texts
    assert "Nuovo messaggio" in message_texts

    verification_db = SessionLocal()
    try:
        merged_chats = (
            verification_db.query(WhatsAppChat)
            .filter(WhatsAppChat.connection_id == connection.id)
            .all()
        )
        assert len(merged_chats) == 1
        assert merged_chats[0].external_chat_id == "393338765432@s.whatsapp.net"
        assert merged_chats[0].display_name == "Mario Rossi"
    finally:
        verification_db.close()


def test_whatsapp_sync_does_not_use_own_profile_name_for_chats(client, db):
    org, admin = _create_org_admin(db, communications_enabled=True)
    _login_org_admin(client, db, admin.id)
    connection = get_or_create_connection(db, org)
    connection.status = "connected"
    connection.phone_number = "+393404244452"
    connection.profile_name = "Edoardo Oscar Buffa"
    db.flush()
    outbound_message_id = f"wamid-own-profile-outbound-{org.id}"
    bad_chat = WhatsAppChat(
        org_id=org.id,
        connection_id=connection.id,
        external_chat_id="393331234567@s.whatsapp.net",
        display_name="Edoardo Oscar Buffa",
    )
    db.add(bad_chat)
    db.commit()

    outbound_res = client.post(
        "/api/internal/whatsapp/evolution",
        json={
            "event": "send.message",
            "instance": connection.instance_name,
            "date_time": "2026-03-18T18:15:00Z",
            "data": {
                "key": {
                    "id": outbound_message_id,
                    "remoteJid": "393331234567@s.whatsapp.net",
                    "fromMe": True,
                },
                "pushName": "Edoardo Oscar Buffa",
                "message": {"conversation": "Messaggio inviato"},
                "messageTimestamp": 1773857700,
            },
        },
        headers={"X-Evolution-ApiKey": settings.EVOLUTION_API_KEY},
    )
    assert outbound_res.status_code == 200, outbound_res.text

    chats_res = client.get("/api/org-admin/communications/whatsapp/chats")
    assert chats_res.status_code == 200, chats_res.text
    payload = chats_res.json()
    assert payload["total"] == 1
    assert payload["items"][0]["display_name"] == "+393331234567"

    contact_res = client.post(
        "/api/internal/whatsapp/evolution",
        json={
            "event": "contacts.upsert",
            "instance": connection.instance_name,
            "date_time": "2026-03-18T18:16:00Z",
            "data": {
                "remoteJid": "393331234567@s.whatsapp.net",
                "pushName": "Mario Rossi",
            },
        },
        headers={"X-Evolution-ApiKey": settings.EVOLUTION_API_KEY},
    )
    assert contact_res.status_code == 200, contact_res.text

    chats_res = client.get("/api/org-admin/communications/whatsapp/chats")
    assert chats_res.status_code == 200, chats_res.text
    assert chats_res.json()["items"][0]["display_name"] == "Mario Rossi"


def test_evolution_client_uses_lite_namespaced_paths(monkeypatch):
    captured: list[tuple[str, str, object | None]] = []
    settings_by_instance: dict[str, dict[str, object]] = {}

    class DummyResponse:
        def __init__(self, payload: dict[str, object] | None = None):
            self.ok = True
            self.status_code = 200
            self._payload = payload or {}

        def json(self):
            return self._payload

    def fake_request(method, url, json=None, headers=None, timeout=None):
        captured.append((method, url, json))
        if url.endswith("/settings/find/assonam-org-7"):
            return DummyResponse(settings_by_instance.get("assonam-org-7", {}))
        if url.endswith("/settings/set/assonam-org-7"):
            settings_by_instance["assonam-org-7"] = dict(json or {})
            return DummyResponse({"settings": {"instanceName": "assonam-org-7", "settings": json or {}}})
        return DummyResponse({"instance": {"state": "close"}})

    monkeypatch.setattr("app.services.whatsapp_evolution.requests.request", fake_request)

    client = EvolutionLiteClient(base_url="http://evolution-api:8080", api_key="test-key")
    client.ensure_instance(org_id=7)
    client.set_webhook("assonam-org-7")
    client.connect("assonam-org-7")
    client.get_connection_state("assonam-org-7")
    client.get_qr("assonam-org-7")
    client.logout("assonam-org-7")
    client.send_text("assonam-org-7", number="+393331234567", text="ciao")

    assert captured == [
        (
            "POST",
            "http://evolution-api:8080/instance/create",
            {
                "instanceName": "assonam-org-7",
                "qrcode": False,
                "integration": "WHATSAPP-BAILEYS",
                "webhook": {
                    "enabled": True,
                    "url": "http://web:8000/api/internal/whatsapp/evolution",
                    "headers": {"X-Evolution-ApiKey": "test-key"},
                    "events": EVOLUTION_WEBHOOK_EVENTS,
                    "byEvents": False,
                    "base64": False,
                },
            },
        ),
        (
            "POST",
            "http://evolution-api:8080/webhook/set/assonam-org-7",
            {
                "webhook": {
                    "enabled": True,
                    "url": "http://web:8000/api/internal/whatsapp/evolution",
                    "headers": {"X-Evolution-ApiKey": "test-key"},
                    "events": EVOLUTION_WEBHOOK_EVENTS,
                    "byEvents": False,
                    "base64": False,
                }
            },
        ),
        ("GET", "http://evolution-api:8080/settings/find/assonam-org-7", None),
        (
            "POST",
            "http://evolution-api:8080/settings/set/assonam-org-7",
            {
                "rejectCall": False,
                "msgCall": "",
                "groupsIgnore": False,
                "alwaysOnline": False,
                "readMessages": False,
                "readStatus": False,
                "syncFullHistory": True,
                "wavoipToken": "",
            },
        ),
        (
            "POST",
            "http://evolution-api:8080/webhook/set/assonam-org-7",
            {
                "webhook": {
                    "enabled": True,
                    "url": "http://web:8000/api/internal/whatsapp/evolution",
                    "headers": {"X-Evolution-ApiKey": "test-key"},
                    "events": EVOLUTION_WEBHOOK_EVENTS,
                    "byEvents": False,
                    "base64": False,
                }
            },
        ),
        ("GET", "http://evolution-api:8080/settings/find/assonam-org-7", None),
        ("GET", "http://evolution-api:8080/instance/connect/assonam-org-7", None),
        ("GET", "http://evolution-api:8080/instance/connectionState/assonam-org-7", None),
        ("GET", "http://evolution-api:8080/instance/connect/assonam-org-7", None),
        ("DELETE", "http://evolution-api:8080/instance/logout/assonam-org-7", None),
        (
            "POST",
            "http://evolution-api:8080/message/sendText/assonam-org-7",
            {"number": "+393331234567", "text": "ciao"},
        ),
    ]


def test_apply_connection_snapshot_preserves_existing_qr():
    connection = type(
        "ConnectionStub",
        (),
        {
            "status": "not_connected",
            "phone_number": None,
            "profile_name": None,
            "last_error": None,
            "last_event_at": None,
            "connected_at": None,
            "qr_code": "existing-qr",
        },
    )()
    snapshot = EvolutionConnectionSnapshot(
        raw_state="close",
        status="not_connected",
        qr_code=None,
        phone_number=None,
        profile_name=None,
        last_error=None,
        connected_at=None,
        raw={},
    )

    apply_connection_snapshot(connection, snapshot)

    assert connection.status == "qr_required"
    assert connection.qr_code == "existing-qr"


def test_parse_connection_snapshot_handles_top_level_qr_payload():
    snapshot = parse_connection_snapshot(
        {
            "count": 0,
            "base64": "data:image/png;base64,test-qr",
            "code": "qr-code",
            "pairingCode": None,
        }
    )

    assert snapshot.raw_state == "connecting"
    assert snapshot.status == "qr_required"
    assert snapshot.qr_code == "data:image/png;base64,test-qr"


def test_ensure_instance_treats_already_in_use_as_idempotent(monkeypatch):
    requests_seen: list[tuple[str, str]] = []
    settings_calls: list[tuple[str, str]] = []

    class DummyResponse:
        def __init__(self, status_code: int, payload: dict[str, object]):
            self.status_code = status_code
            self.ok = status_code < 400
            self._payload = payload

        def json(self):
            return self._payload

    def fake_request(method, url, json=None, headers=None, timeout=None):
        requests_seen.append((method, url))
        if url.endswith("/instance/create"):
            return DummyResponse(
                403,
                {
                    "status": 403,
                    "error": "Forbidden",
                    "response": {"message": ['This name "assonam-org-7" is already in use.']},
                },
            )
        return DummyResponse(200, {"ok": True})

    monkeypatch.setattr("app.services.whatsapp_evolution.requests.request", fake_request)

    client = EvolutionLiteClient(base_url="http://evolution-api:8080", api_key="test-key")
    payload = client.ensure_instance(org_id=7)

    assert payload == {"instance": {"instanceName": "assonam-org-7"}}
    assert requests_seen == [
        ("POST", "http://evolution-api:8080/instance/create"),
        ("GET", "http://evolution-api:8080/instance/fetchInstances"),
        ("POST", "http://evolution-api:8080/webhook/set/assonam-org-7"),
        ("GET", "http://evolution-api:8080/settings/find/assonam-org-7"),
        ("POST", "http://evolution-api:8080/settings/set/assonam-org-7"),
    ]


def test_ensure_instance_recreates_device_removed_session(monkeypatch):
    requests_seen: list[tuple[str, str]] = []

    class DummyResponse:
        def __init__(self, status_code: int, payload):
            self.status_code = status_code
            self.ok = status_code < 400
            self._payload = payload

        def json(self):
            return self._payload

    create_calls = {"count": 0}

    def fake_request(method, url, json=None, headers=None, timeout=None):
        requests_seen.append((method, url))
        if url.endswith("/instance/create"):
            create_calls["count"] += 1
            if create_calls["count"] == 1:
                return DummyResponse(
                    403,
                    {
                        "status": 403,
                        "error": "Forbidden",
                        "response": {"message": ['This name "assonam-org-7" is already in use.']},
                    },
                )
            return DummyResponse(200, {"instance": {"instanceName": "assonam-org-7"}})
        if url.endswith("/instance/fetchInstances"):
            return DummyResponse(
                200,
                [
                    {
                        "name": "assonam-org-7",
                        "connectionStatus": "connecting",
                        "disconnectionReasonCode": 401,
                        "disconnectionObject": '{"error":{"output":{"payload":{"message":"Stream Errored (conflict)"}}},"data":{"content":[{"tag":"conflict","attrs":{"type":"device_removed"}}]}}',
                    }
                ],
            )
        return DummyResponse(200, {"ok": True})

    monkeypatch.setattr("app.services.whatsapp_evolution.requests.request", fake_request)

    client = EvolutionLiteClient(base_url="http://evolution-api:8080", api_key="test-key")
    payload = client.ensure_instance(org_id=7)

    assert payload == {"instance": {"instanceName": "assonam-org-7"}}
    assert requests_seen == [
        ("POST", "http://evolution-api:8080/instance/create"),
        ("GET", "http://evolution-api:8080/instance/fetchInstances"),
        ("DELETE", "http://evolution-api:8080/instance/delete/assonam-org-7"),
        ("POST", "http://evolution-api:8080/instance/create"),
        ("POST", "http://evolution-api:8080/webhook/set/assonam-org-7"),
        ("GET", "http://evolution-api:8080/settings/find/assonam-org-7"),
        ("POST", "http://evolution-api:8080/settings/set/assonam-org-7"),
    ]
