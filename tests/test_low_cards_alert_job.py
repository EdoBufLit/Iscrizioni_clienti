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

    def _fake_execute(*, to: str, association_name: str, remaining: str) -> str:
        sent_calls.append(
            {
                "to": to,
                "association_name": association_name,
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
        whatsapp_e164=None,
        phone="+39333111222",
    )
    skipped_org = _create_org(
        db,
        name="Org Missing Phone",
        slug_prefix="org-missing-phone",
        whatsapp_e164=None,
    )
    invalid_org = _create_org(
        db,
        name=None,
        slug_prefix="org-invalid-phone",
        whatsapp_e164="333111222",
    )
    _create_batch(db, org_id=alerted_org.id, start_no=910000, quantity=40)
    _create_batch(db, org_id=skipped_org.id, start_no=920000, quantity=30)
    _create_batch(db, org_id=invalid_org.id, start_no=930000, quantity=20)

    def _fake_bulk_remaining(_db, association_ids: list[int], *, now=None):
        return {
            association_id: (
                40
                if association_id == alerted_org.id
                else 30
                if association_id == skipped_org.id
                else 20
                if association_id == invalid_org.id
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
    assert first_run["skipped_missing_phone"] == 2
    assert sent_calls == [
        {
            "to": "whatsapp:+39333111222",
            "association_name": alerted_org.name,
            "remaining": "40",
        }
    ]
    assert "Sending WhatsApp alert to whatsapp:+39333111222" in caplog.text
    assert f"low_cards_alert_missing_phone org_slug={skipped_org.slug}" in caplog.text
    assert f"Invalid phone format for org {invalid_org.slug}: 333111222" in caplog.text

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


def test_execute_low_cards_alert_flow_passes_flow_parameters(monkeypatch):
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
        "TWILIO_ALERT_FLOW_SID",
        "FW_alert_123",
    )

    sid = twilio_notifications.execute_low_cards_alert_flow(
        to="+39333111222",
        association_name=None,
        remaining=42,
    )

    assert sid == "FN_exec_123"
    assert flow_sids == ["FW_alert_123"]
    assert create_calls == [
        {
            "parameters": {
                "to": "whatsapp:+39333111222",
                "association_name": "Associazione",
                "remaining": "42",
            }
        }
    ]
