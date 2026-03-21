from datetime import datetime
import uuid

import pytest

from app.db import SessionLocal
from app.models import Organization, RechargeRequest, WhatsAppSession
from app.routes import whatsapp as whatsapp_route
from app.services import whatsapp_bot as whatsapp_bot_service


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _create_org(db, *, name: str, slug: str) -> Organization:
    org = Organization(
        name=name,
        slug=f"{slug}-{uuid.uuid4().hex[:6]}",
        privacy_version="v1",
        is_active=True,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def test_whatsapp_bot_creates_recharge_request_after_candidate_selection(
    client,
    db,
    monkeypatch,
):
    monkeypatch.setattr(
        whatsapp_bot_service.whatsapp_bot_rate_limiter,
        "check",
        lambda _key: None,
    )

    token = uuid.uuid4().hex[:6]
    search_term = f"bot-{token}"
    wa_from = f"whatsapp:+39333{token[:6]}"
    _create_org(
        db,
        name=f"Associazione Alfa Nord {search_term}",
        slug=f"alfa-nord-{search_term}",
    )
    selected_org = _create_org(
        db,
        name=f"Associazione Alfa Sud {search_term}",
        slug=f"alfa-sud-{search_term}",
    )

    first = client.post(
        "/api/whatsapp/bot",
        json={
            "from": wa_from,
            "body": "ordino tessere",
            "profile_name": "Mario Rossi",
        },
    )
    assert first.status_code == 200, first.text
    assert "quale associazione" in first.json()["reply"].lower()

    choose_assoc = client.post(
        "/api/whatsapp/bot",
        json={
            "from": wa_from,
            "body": search_term,
            "profile_name": "Mario Rossi",
        },
    )
    assert choose_assoc.status_code == 200, choose_assoc.text
    choose_assoc_reply = choose_assoc.json()["reply"]
    assert f"1. Associazione Alfa Nord {search_term}" in choose_assoc_reply
    assert f"2. Associazione Alfa Sud {search_term}" in choose_assoc_reply

    choose_candidate = client.post(
        "/api/whatsapp/bot",
        json={
            "from": wa_from,
            "body": "2",
            "profile_name": "Mario Rossi",
        },
    )
    assert choose_candidate.status_code == 200, choose_candidate.text
    assert "Quante tessere" in choose_candidate.json()["reply"]

    choose_qty = client.post(
        "/api/whatsapp/bot",
        json={
            "from": wa_from,
            "body": "120",
            "profile_name": "Mario Rossi",
        },
    )
    assert choose_qty.status_code == 200, choose_qty.text
    assert "aggiungere una nota" in choose_qty.json()["reply"].lower()

    finish = client.post(
        "/api/whatsapp/bot",
        json={
            "from": wa_from,
            "body": "no",
            "profile_name": "Mario Rossi",
        },
    )
    assert finish.status_code == 200, finish.text
    assert "Richiesta registrata" in finish.json()["reply"]

    request_row = db.query(RechargeRequest).order_by(RechargeRequest.id.desc()).first()
    assert request_row is not None
    assert request_row.association_id == selected_org.id
    assert request_row.association_name == selected_org.name
    assert request_row.requester_whatsapp == wa_from
    assert request_row.requester_profile_name == "Mario Rossi"
    assert request_row.requested_cards == 120
    assert request_row.notes is None

    session_row = (
        db.query(WhatsAppSession)
        .filter(WhatsAppSession.wa_from == wa_from)
        .first()
    )
    assert session_row is not None
    assert session_row.state == "idle"
    assert session_row.data == {}


def test_whatsapp_bot_sends_telegram_notification_with_same_message_text(
    client,
    db,
    monkeypatch,
):
    monkeypatch.setattr(
        whatsapp_bot_service.whatsapp_bot_rate_limiter,
        "check",
        lambda _key: None,
    )

    sent_messages: list[str] = []

    def _fake_send_telegram_message(text: str) -> str:
        sent_messages.append(text)
        return "12345"

    monkeypatch.setattr(
        whatsapp_bot_service,
        "send_telegram_message",
        _fake_send_telegram_message,
    )

    token = uuid.uuid4().hex[:6]
    search_term = f"telegram-{token}"
    wa_from = f"whatsapp:+39334{token[:6]}"
    selected_org = _create_org(
        db,
        name=f"Associazione Telegram {search_term}",
        slug=f"telegram-{search_term}",
    )

    for body in ("ordino tessere", search_term, "75", "no"):
        response = client.post(
            "/api/whatsapp/bot",
            json={
                "from": wa_from,
                "body": body,
                "profile_name": "Mario Rossi",
            },
        )
        assert response.status_code == 200, response.text

    assert sent_messages == [
        f"Nuovo ordine tessere: {selected_org.name}, 75 tessere, richiedente {wa_from}."
    ]


def test_whatsapp_bot_logs_telegram_error_and_keeps_flow_successful(
    client,
    db,
    monkeypatch,
    caplog,
):
    monkeypatch.setattr(
        whatsapp_bot_service.whatsapp_bot_rate_limiter,
        "check",
        lambda _key: None,
    )

    def _failing_send_telegram_message(_text: str) -> str | None:
        raise RuntimeError("telegram boom")

    monkeypatch.setattr(
        whatsapp_bot_service,
        "send_telegram_message",
        _failing_send_telegram_message,
    )

    token = uuid.uuid4().hex[:6]
    search_term = f"telegram-error-{token}"
    wa_from = f"whatsapp:+39335{token[:6]}"
    _create_org(
        db,
        name=f"Associazione Error {search_term}",
        slug=f"error-{search_term}",
    )

    with caplog.at_level("ERROR"):
        first = client.post(
            "/api/whatsapp/bot",
            json={
                "from": wa_from,
                "body": "ordino tessere",
                "profile_name": "Mario Rossi",
            },
        )
        second = client.post(
            "/api/whatsapp/bot",
            json={
                "from": wa_from,
                "body": search_term,
                "profile_name": "Mario Rossi",
            },
        )
        third = client.post(
            "/api/whatsapp/bot",
            json={
                "from": wa_from,
                "body": "20",
                "profile_name": "Mario Rossi",
            },
        )
        finish = client.post(
            "/api/whatsapp/bot",
            json={
                "from": wa_from,
                "body": "no",
                "profile_name": "Mario Rossi",
            },
        )

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert third.status_code == 200, third.text
    assert finish.status_code == 200, finish.text
    assert "Richiesta registrata" in finish.json()["reply"]
    assert "whatsapp_recharge_request_admin_telegram_failed" in caplog.text


def test_whatsapp_bot_uses_openai_fallback_when_configured(client, monkeypatch):
    monkeypatch.setattr(
        whatsapp_bot_service.whatsapp_bot_rate_limiter,
        "check",
        lambda _key: None,
    )
    monkeypatch.setattr(whatsapp_bot_service.settings, "OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setattr(whatsapp_bot_service.settings, "OPENAI_MODEL", "gpt-4o-mini")

    class _FakeMessage:
        content = "Risposta AI sintetica."

    class _FakeChoice:
        message = _FakeMessage()

    class _FakeResponse:
        choices = [_FakeChoice()]

    class _FakeCompletions:
        @staticmethod
        def create(**_kwargs):
            return _FakeResponse()

    class _FakeChat:
        completions = _FakeCompletions()

    class _FakeOpenAI:
        def __init__(self, api_key: str):
            self.api_key = api_key
            self.chat = _FakeChat()

    monkeypatch.setattr(whatsapp_bot_service, "OpenAI", _FakeOpenAI)

    response = client.post(
        "/api/whatsapp/bot",
        json={
            "from": f"whatsapp:+39{datetime.utcnow().year}{uuid.uuid4().hex[:6]}",
            "body": "Come funziona il servizio?",
            "profile_name": "Giulia",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"reply": "Risposta AI sintetica."}


def test_whatsapp_bot_accepts_form_urlencoded_payload(client, monkeypatch):
    monkeypatch.setattr(
        whatsapp_route,
        "handle_whatsapp_bot_message",
        lambda _db, *, wa_from, body, profile_name=None: (
            f"echo:{wa_from}:{body}:{profile_name or ''}"
        ),
    )

    response = client.post(
        "/api/whatsapp/bot",
        data=(
            "Body=ciao&From=whatsapp:+393891605511&To=whatsapp:+390299914307"
            "&MessageSid=SM123&WaId=393891605511&ProfileName=Test&NumMedia=0"
        ),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "reply": "echo:whatsapp:+393891605511:ciao:Test",
    }


def test_whatsapp_bot_returns_200_with_ok_false_when_form_parse_fails(client):
    response = client.post(
        "/api/whatsapp/bot",
        data="Body=ciao&From=whatsapp:+393891605511&NumMedia=abc",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"ok": False}


def test_docs_route_still_available(client):
    response = client.get("/docs")

    assert response.status_code == 200, response.text
    assert "Swagger UI" in response.text
