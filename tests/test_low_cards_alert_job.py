from datetime import datetime, timedelta
import logging
from types import SimpleNamespace
import uuid

import pytest

from app.db import SessionLocal
from app.models import CardBatch, Organization
from app.services import low_cards_alerts as low_cards_alerts_service
from app.services import twilio_notifications


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _create_org(
    db,
    *,
    name: str | None,
    slug_prefix: str,
    whatsapp_e164: str | None,
    phone: str | None = None,
) -> Organization:
    org = Organization(
        name=name,
        slug=f"{slug_prefix}-{uuid.uuid4().hex[:6]}",
        privacy_version="v1",
        is_active=True,
        whatsapp_e164=whatsapp_e164,
        phone=phone,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _create_batch(db, *, org_id: int, start_no: int, quantity: int) -> None:
    current_year = datetime.utcnow().year
    batch = CardBatch(
        org_id=org_id,
        year=current_year,
        start_no=start_no,
        end_no=start_no + quantity - 1,
        next_no=start_no,
        is_enabled=True,
    )
    db.add(batch)
    db.commit()


def test_low_cards_alert_job_sends_twilio_execution_and_respects_cooldown(
    db,
    monkeypatch,
    caplog,
):
    monkeypatch.setattr(
        low_cards_alerts_service,
        "twilio_alerts_are_configured",
        lambda: True,
    )

    sent_calls: list[dict[str, object]] = []

    def _fake_execute(*, org, remaining: int) -> str | None:
        if not org.whatsapp_e164:
            return None
        sent_calls.append(
            {
                "org_id": org.id,
                "to": f"whatsapp:{org.whatsapp_e164}",
                "remaining": remaining,
            }
        )
        return "FN_exec_123"

    monkeypatch.setattr(
        low_cards_alerts_service,
        "execute_low_cards_alert_flow",
        _fake_execute,
    )

    alerted_org = _create_org(
        db,
        name="Org Alert",
        slug_prefix="org-alert",
        whatsapp_e164="+39333111222",
    )
    skipped_org = _create_org(
        db,
        name="Org Missing Phone",
        slug_prefix="org-missing-phone",
        whatsapp_e164=None,
    )
    _create_batch(db, org_id=alerted_org.id, start_no=910000, quantity=40)
    _create_batch(db, org_id=skipped_org.id, start_no=920000, quantity=30)

    def _fake_bulk_remaining(_db, association_ids: list[int], *, now=None):
        return {
            association_id: (
                40
                if association_id == alerted_org.id
                else 30
                if association_id == skipped_org.id
                else 500
            )
            for association_id in association_ids
        }

    monkeypatch.setattr(
        low_cards_alerts_service,
        "get_remaining_cards_by_org",
        _fake_bulk_remaining,
    )

    now = datetime.utcnow()
    caplog.set_level(logging.INFO)
    first_run = low_cards_alerts_service.run_low_cards_alert_job(
        db=db,
        now=now,
        force=False,
    )
    assert first_run["sent"] == 1
    assert first_run["skipped_missing_phone"] == 1
    assert first_run["errors"] == 0
    assert sent_calls == [
        {
            "org_id": alerted_org.id,
            "to": "whatsapp:+39333111222",
            "remaining": 40,
        }
    ]
    assert "low_cards_alert_sent" in caplog.text
    db.refresh(alerted_org)
    assert alerted_org.last_low_cards_alert_at == now

    second_run = low_cards_alerts_service.run_low_cards_alert_job(
        db=db,
        now=now + timedelta(hours=1),
        force=False,
    )
    assert second_run["sent"] == 0
    assert second_run["skipped_recent"] == 1

    forced_run = low_cards_alerts_service.run_low_cards_alert_job(
        db=db,
        now=now + timedelta(hours=2),
        force=True,
    )
    assert forced_run["sent"] == 1
    assert len(sent_calls) == 2


def test_execute_low_cards_alert_flow_passes_flow_parameters_with_phone_fallback(
    monkeypatch, caplog
):
    create_calls: list[dict[str, object]] = []
    flow_sids: list[str] = []

    class _FakeExecutions:
        def create(self, **kwargs):
            create_calls.append(kwargs)
            return SimpleNamespace(sid="FN_exec_123")

    class _FakeFlows:
        def __call__(self, flow_sid: str):
            flow_sids.append(flow_sid)
            return SimpleNamespace(executions=_FakeExecutions())

    fake_client = SimpleNamespace(
        studio=SimpleNamespace(v2=SimpleNamespace(flows=_FakeFlows()))
    )

    monkeypatch.setattr(
        twilio_notifications,
        "_get_twilio_client",
        lambda: fake_client,
    )
    monkeypatch.setattr(
        twilio_notifications.settings,
        "TWILIO_LOW_CARDS_FLOW_SID",
        "",
    )
    monkeypatch.setenv("TWILIO_LOW_CARDS_FLOW_SID", "FW_alert_123")
    monkeypatch.delenv("TWILIO_STUDIO_FLOW_SID", raising=False)
    monkeypatch.setenv("TWILIO_WHATSAPP_FROM", "whatsapp:+390299914307")

    org = SimpleNamespace(
        id=1,
        slug="org-alert",
        whatsapp_e164="+39333111222",
        phone="333 111 222",
        name="Org Alert",
        club_display_name="Club Alert",
    )

    caplog.set_level(logging.INFO)
    sid = twilio_notifications.execute_low_cards_alert_flow(
        org=org,
        remaining=42,
    )

    assert sid == "FN_exec_123"
    assert flow_sids == ["FW_alert_123"]
    assert create_calls == [
        {
            "to": "whatsapp:+39333111222",
            "from_": "whatsapp:+390299914307",
            "parameters": {
                "to": "whatsapp:+39333111222",
                "association_name": "Org Alert",
                "remaining": "42",
            }
        }
    ]
    assert (
        "low_cards_alert_execution_created sid=FN_exec_123 org_id=1 slug=org-alert"
        in caplog.text
    )
    assert (
        "low_cards_alert_execution_start slug=org-alert to=whatsapp:+39333111222 remaining=42"
        in caplog.text
    )


def test_execute_low_cards_alert_flow_returns_none_when_missing_phone(monkeypatch, caplog):
    create_calls: list[dict[str, object]] = []

    class _FakeExecutions:
        def create(self, **kwargs):
            create_calls.append(kwargs)
            return SimpleNamespace(sid="FN_exec_123")

    fake_client = SimpleNamespace(
        studio=SimpleNamespace(
            v2=SimpleNamespace(
                flows=lambda _flow_sid: SimpleNamespace(executions=_FakeExecutions())
            )
        )
    )

    monkeypatch.setattr(
        twilio_notifications,
        "_get_twilio_client",
        lambda: fake_client,
    )
    monkeypatch.setattr(
        twilio_notifications.settings,
        "TWILIO_LOW_CARDS_FLOW_SID",
        "",
    )
    monkeypatch.setenv("TWILIO_LOW_CARDS_FLOW_SID", "FW_alert_123")
    monkeypatch.delenv("TWILIO_STUDIO_FLOW_SID", raising=False)
    monkeypatch.setenv("TWILIO_WHATSAPP_FROM", "whatsapp:+390299914307")

    org = SimpleNamespace(
        id=7,
        slug="org-missing-phone",
        whatsapp_e164=None,
        phone=None,
        name="Org Missing Phone",
        club_display_name=None,
    )

    caplog.set_level(logging.WARNING)
    sid = twilio_notifications.execute_low_cards_alert_flow(
        org=org,
        remaining=12,
    )

    assert sid is None
    assert create_calls == []
    assert "low_cards_alert_missing_whatsapp org_id=7 slug=org-missing-phone" in caplog.text


@pytest.mark.parametrize(
    ("missing_env", "expected_fragment"),
    [
        ("TWILIO_WHATSAPP_FROM", "env=TWILIO_WHATSAPP_FROM"),
        ("FLOW", "env=TWILIO_LOW_CARDS_FLOW_SID|TWILIO_STUDIO_FLOW_SID|TWILIO_ALERT_FLOW_SID"),
    ],
)
def test_execute_low_cards_alert_flow_returns_none_when_required_env_missing(
    monkeypatch,
    caplog,
    missing_env: str,
    expected_fragment: str,
):
    create_calls: list[dict[str, object]] = []

    class _FakeExecutions:
        def create(self, **kwargs):
            create_calls.append(kwargs)
            return SimpleNamespace(sid="FN_exec_123")

    fake_client = SimpleNamespace(
        studio=SimpleNamespace(
            v2=SimpleNamespace(
                flows=lambda _flow_sid: SimpleNamespace(executions=_FakeExecutions())
            )
        )
    )

    monkeypatch.setattr(
        twilio_notifications,
        "_get_twilio_client",
        lambda: fake_client,
    )
    monkeypatch.setattr(
        twilio_notifications.settings,
        "TWILIO_LOW_CARDS_FLOW_SID",
        "" if missing_env == "FLOW" else "FW_alert_123",
    )
    monkeypatch.setattr(
        twilio_notifications.settings,
        "TWILIO_ALERT_FLOW_SID",
        "",
    )
    monkeypatch.delenv("TWILIO_LOW_CARDS_FLOW_SID", raising=False)
    monkeypatch.delenv("TWILIO_STUDIO_FLOW_SID", raising=False)
    monkeypatch.delenv("TWILIO_ALERT_FLOW_SID", raising=False)
    monkeypatch.delenv("TWILIO_WHATSAPP_FROM", raising=False)
    if missing_env != "FLOW":
        monkeypatch.setenv("TWILIO_LOW_CARDS_FLOW_SID", "FW_alert_123")
    if missing_env != "TWILIO_WHATSAPP_FROM":
        monkeypatch.setenv("TWILIO_WHATSAPP_FROM", "whatsapp:+390299914307")

    org = SimpleNamespace(
        id=8,
        slug="org-env-missing",
        whatsapp_e164="+39333111222",
        phone=None,
        name="Org Env Missing",
        club_display_name=None,
    )

    caplog.set_level(logging.INFO)
    sid = twilio_notifications.execute_low_cards_alert_flow(
        org=org,
        remaining=15,
    )

    assert sid is None
    assert create_calls == []
    assert "low_cards_alert_send_skipped_missing_env" in caplog.text
    assert expected_fragment in caplog.text


def test_low_cards_alert_job_skips_unconfigured_execution_without_marking_sent(
    db,
    monkeypatch,
    caplog,
):
    monkeypatch.setattr(
        low_cards_alerts_service,
        "twilio_alerts_are_configured",
        lambda: True,
    )
    monkeypatch.setattr(
        low_cards_alerts_service,
        "execute_low_cards_alert_flow",
        lambda **_kwargs: None,
    )

    org = _create_org(
        db,
        name="Org Unconfigured",
        slug_prefix="org-unconfigured",
        whatsapp_e164="+39333111222",
    )
    _create_batch(db, org_id=org.id, start_no=940000, quantity=20)

    monkeypatch.setattr(
        low_cards_alerts_service,
        "get_remaining_cards_by_org",
        lambda _db, association_ids, *, now=None: {association_id: 20 for association_id in association_ids},
    )

    caplog.set_level(logging.INFO)
    result = low_cards_alerts_service.run_low_cards_alert_job(
        db=db,
        now=datetime.utcnow(),
        force=True,
    )

    db.refresh(org)
    assert result["sent"] == 0
    assert result["errors"] == 0
    assert org.last_low_cards_alert_at is None
    assert f"low_cards_alert_skipped_unconfigured org_id={org.id} slug={org.slug}" in caplog.text
