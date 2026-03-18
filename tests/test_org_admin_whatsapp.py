from __future__ import annotations

from datetime import datetime, timedelta
import uuid

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import AdminRole, AdminUser, OrgAdminToken, Organization, WhatsAppChat
from app.services.whatsapp_evolution import (
    EvolutionConnectionSnapshot,
    EvolutionSendTextResult,
)
from app.services.whatsapp_sync import get_or_create_connection
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
        assert text == "Ciao dal test"
        return EvolutionSendTextResult(
            external_message_id="wamid-outbound-1",
            status="sent",
            raw={"id": "wamid-outbound-1", "status": "sent"},
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
    chat = WhatsAppChat(
        org_id=org.id,
        connection_id=connection.id,
        external_chat_id="393331234567@s.whatsapp.net",
        display_name="Mario Rossi",
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)

    send_res = client.post(
        f"/api/org-admin/communications/whatsapp/chats/{chat.id}/messages",
        json={"text": "Ciao dal test"},
    )
    assert send_res.status_code == 200, send_res.text
    send_payload = send_res.json()["message"]
    assert send_payload["direction"] == "outbound"
    assert send_payload["external_message_id"] == "wamid-outbound-1"
    assert send_payload["status"] == "sent"

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
