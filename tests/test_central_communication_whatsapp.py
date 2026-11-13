"""Synthetic publications and a fake provider: never send real WhatsApp messages."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
import json
from types import SimpleNamespace
import uuid
from unittest.mock import Mock

import pytest
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AdminRole, AdminUser, AffiliateCommunication, AffiliateCommunicationRecipient,
    AffiliateCommunicationWhatsApp, Organization,
)
from app.services import affiliate_communications as publication
from app.services import central_communication_whatsapp as service
from app.workers import whatsapp_webhook_worker as worker


@pytest.fixture
def db(client):
    with SessionLocal() as session:
        session.query(AffiliateCommunicationWhatsApp).delete()
        session.commit()
        yield session
        session.rollback()
        session.query(AffiliateCommunicationWhatsApp).delete()
        session.commit()


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "AC" + "a" * 32)
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "fake-test-token")
    monkeypatch.setattr(settings, "TWILIO_WHATSAPP_FROM", "whatsapp:+390299914307")
    monkeypatch.setattr(settings, "TWILIO_CENTRAL_COMMUNICATION_CONTENT_SID", "HX" + "b" * 32, raising=False)
    monkeypatch.setattr(settings, "EMAIL_MODE", "test")


@pytest.fixture
def provider(monkeypatch):
    client = SimpleNamespace(messages=SimpleNamespace(create=Mock(
        return_value=SimpleNamespace(sid="SM" + "c" * 32, status="queued"),
    )))
    monkeypatch.setattr(service, "_create_twilio_client", lambda: client)
    return client.messages.create


def make_org(db, *, phone="+393331234567", admins=1):
    suffix = uuid.uuid4().hex[:10]
    org = Organization(name=f"Associazione {suffix}", slug=f"central-wa-{suffix}", whatsapp_e164=phone)
    db.add(org)
    db.flush()
    accounts = [AdminUser(org_id=org.id, email=f"{suffix}-{i}@example.com", role=AdminRole.ORG_ADMIN,
                          is_active=True) for i in range(admins)]
    db.add_all(accounts)
    db.commit()
    return org, accounts


def make_message(db):
    row = AffiliateCommunication(subject="Comunicazione sintetica", body="Test", audience="selected",
                                 idempotency_key=uuid.uuid4().hex, request_fingerprint="test",
                                 created_by_email="test@example.com")
    db.add(row)
    db.flush()
    return row


def queued_job(db):
    org, admins = make_org(db)
    message = make_message(db)
    db.add(AffiliateCommunicationRecipient(communication_id=message.id, organization_id=org.id,
                                         organization_name=org.name))
    job = service.enqueue_central_whatsapp(db, communication_id=message.id, org=org, admins=admins)
    db.commit()
    return job, org, admins, message


def publish(client, org):
    client.cookies.clear()
    assert client.post("/api/super-admin/auth/login", json={"email":"admin@assonam.it", "password":"admin"}).status_code == 200
    payload = {"subject":"Circolare sintetica", "body":"Una comunicazione di prova.", "audience":"selected",
               "organization_ids":[org.id], "idempotency_key":uuid.uuid4().hex}
    return payload


def test_publication_queues_one_per_org_and_only_worker_calls_provider(client, db, provider):
    org, admins = make_org(db, admins=2)
    other, _ = make_org(db)
    payload = publish(client, org)
    preview = client.post("/api/super-admin/communications/preview", json=payload).json()
    assert preview["whatsapp_configured"] is True
    assert preview["whatsapp_count"] == 1 and preview["whatsapp_skipped_count"] == 0
    assert preview["recipients"][0]["whatsapp_available"] is True
    assert "phone" not in json.dumps(preview)
    response = client.post("/api/super-admin/communications", json=payload)
    assert response.status_code == 200, response.text
    item = response.json()["item"]
    provider.assert_not_called()
    assert item["whatsapp_status_counts"] == {"queued":1}
    jobs = db.query(AffiliateCommunicationWhatsApp).filter_by(communication_id=item["id"]).all()
    assert len(jobs) == 1 and jobs[0].organization_id == org.id != other.id
    replay = client.post("/api/super-admin/communications", json=payload)
    assert replay.json()["replayed"] is True
    assert db.query(AffiliateCommunicationWhatsApp).filter_by(communication_id=item["id"]).count() == 1
    result = service.process_central_whatsapp_outbox_once()
    assert result["accepted"] == 1
    provider.assert_called_once()
    sent = provider.call_args.kwargs
    assert sent == {"to":"whatsapp:+393331234567", "from_":"whatsapp:+390299914307",
                    "content_sid":"HX" + "b" * 32,
                    "content_variables":json.dumps({"1":org.name, "2":str(item["id"])}, ensure_ascii=False)}
    history = client.get(f"/api/super-admin/communications/{item['id']}").json()["item"]
    assert history["whatsapp_status_counts"] == {"accepted":1}
    assert "to_phone" not in history and "provider_message_id" not in history


def test_publication_failure_rolls_back_whatsapp_with_other_effects(client, db, provider, monkeypatch):
    org, _ = make_org(db)
    payload = publish(client, org)
    monkeypatch.setattr(publication, "enqueue_email", Mock(side_effect=RuntimeError("synthetic outbox failure")))
    with pytest.raises(RuntimeError, match="synthetic outbox failure"):
        client.post("/api/super-admin/communications", json=payload)
    assert db.query(AffiliateCommunication).filter_by(idempotency_key=payload["idempotency_key"]).count() == 0
    assert db.query(AffiliateCommunicationWhatsApp).count() == 0
    assert service.process_central_whatsapp_outbox_once()["claimed"] == 0
    provider.assert_not_called()


@pytest.mark.parametrize("missing,expected", [("phone", "missing_or_invalid_phone"), ("admin", "no_active_admin"), ("config", "configuration_missing")])
def test_unavailable_recipients_are_explicitly_skipped(db, provider, monkeypatch, missing, expected):
    org, admins = make_org(db, phone=None if missing == "phone" else "+393331234567", admins=0 if missing == "admin" else 1)
    if missing == "config":
        monkeypatch.setattr(settings, "TWILIO_CENTRAL_COMMUNICATION_CONTENT_SID", "")
    message = make_message(db)
    job = service.enqueue_central_whatsapp(db, communication_id=message.id, org=org, admins=admins)
    db.commit()
    assert job.status == "skipped" and job.last_error == expected
    assert publication.preview_audience(db, [org])["whatsapp_count"] == 0
    assert service.process_central_whatsapp_outbox_once()["claimed"] == 0
    provider.assert_not_called()


def test_enqueue_and_database_unique_guard_prevent_duplicates(db):
    job, org, admins, message = queued_job(db)
    assert service.enqueue_central_whatsapp(db, communication_id=message.id, org=org, admins=admins).id == job.id
    db.add(AffiliateCommunicationWhatsApp(communication_id=message.id, organization_id=org.id, organization_name=org.name))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    assert db.query(AffiliateCommunicationWhatsApp).filter_by(communication_id=message.id).count() == 1


def test_invalid_configuration_cannot_break_publication_snapshot(db, monkeypatch):
    org, admins = make_org(db)
    org.name = " \n\t "
    monkeypatch.setattr(settings, "TWILIO_CENTRAL_COMMUNICATION_CONTENT_SID", "https://invalid-content-id.example/" + "x" * 70)
    message = make_message(db)
    job = service.enqueue_central_whatsapp(db, communication_id=message.id, org=org, admins=admins)
    db.commit()
    assert job.content_sid is None and job.organization_name == "Associazione"
    assert job.status == "skipped" and job.last_error == "configuration_missing"


@pytest.mark.parametrize("change", ["inactive", "deleted", "phone", "admin", "audience", "sender", "template"])
def test_delivery_rechecks_current_authorization_and_phone(db, provider, monkeypatch, change):
    job, org, admins, message = queued_job(db)
    if change == "inactive": org.is_active = False
    elif change == "deleted": org.deleted_at = datetime.utcnow()
    elif change == "phone": org.whatsapp_e164 = "+393339999999"
    elif change == "admin": admins[0].is_active = False
    elif change == "audience": db.query(AffiliateCommunicationRecipient).filter_by(communication_id=message.id).delete()
    elif change == "sender": monkeypatch.setattr(settings, "TWILIO_WHATSAPP_FROM", "+390211111111")
    elif change == "template": monkeypatch.setattr(settings, "TWILIO_CENTRAL_COMMUNICATION_CONTENT_SID", "HX" + "d" * 32)
    db.commit()
    assert service.process_central_whatsapp_outbox_once()["skipped"] == 1
    db.refresh(job)
    assert job.status == "skipped"
    provider.assert_not_called()


class ProviderError(Exception):
    def __init__(self, status, code):
        super().__init__("sensitive recipient/content must not be logged or persisted")
        self.status, self.code = status, code


def test_rate_limit_is_the_only_automatic_retry_and_preserves_explicit_payload(db, provider):
    job, *_ = queued_job(db)
    provider.side_effect = [ProviderError(429, 20429), SimpleNamespace(sid="SM" + "e" * 32, status="queued")]
    assert service.process_central_whatsapp_outbox_once()["retry"] == 1
    db.refresh(job)
    assert job.status == "retry" and job.attempts == 1
    assert service.process_central_whatsapp_outbox_once()["claimed"] == 0
    job.next_attempt_at = datetime.utcnow() - timedelta(seconds=1)
    db.commit()
    assert service.process_central_whatsapp_outbox_once()["accepted"] == 1
    db.refresh(job)
    assert job.attempts == 2 and job.last_error is None and job.provider_message_id == "SM" + "e" * 32
    assert provider.call_args_list[0] == provider.call_args_list[1]


@pytest.mark.parametrize("error,state", [(ProviderError(400,63016),"failed"), (ProviderError(500,20500),"uncertain"), (TimeoutError("secret phone"),"uncertain")])
def test_permanent_and_ambiguous_errors_never_blindly_resend(db, provider, caplog, error, state):
    job, *_ = queued_job(db)
    provider.side_effect = error
    assert service.process_central_whatsapp_outbox_once()[state] == 1
    db.refresh(job)
    assert job.status == state and job.attempts == 1
    assert "secret" not in job.last_error and "sensitive" not in job.last_error
    assert "sensitive" not in caplog.text and "secret phone" not in caplog.text
    assert service.process_central_whatsapp_outbox_once()["claimed"] == 0
    provider.assert_called_once()


def test_stale_claim_becomes_uncertain_without_resend(db, provider):
    job, *_ = queued_job(db)
    assert service.claim_next_central_whatsapp(now=datetime.utcnow() - timedelta(minutes=10)) is None
    assert service.claim_next_central_whatsapp() == job.id
    db.refresh(job)
    job.updated_at = datetime.utcnow() - timedelta(minutes=10)
    db.commit()
    stats = service.process_central_whatsapp_outbox_once()
    assert stats["recovered_uncertain"] == 1 and stats["claimed"] == 0
    db.refresh(job)
    assert job.status == "uncertain"
    provider.assert_not_called()


def test_two_workers_claim_a_job_only_once(db):
    job, *_ = queued_job(db)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: service.claim_next_central_whatsapp(), range(2)))
    assert results.count(job.id) == 1 and results.count(None) == 1


def test_old_communication_without_queue_never_backfills(db, provider):
    message = make_message(db)
    db.commit()
    assert service.process_central_whatsapp_outbox_once()["claimed"] == 0
    assert publication.serialize_communication(message)["whatsapp_status_counts"] == {}
    provider.assert_not_called()


def test_purge_removes_whatsapp_snapshot_without_removing_central_history(client, db, provider):
    job, org, _, message = queued_job(db)
    message_id, job_id = message.id, job.id
    publish(client, org)
    result = client.delete(f"/api/admin/associations/{org.id}?mode=purge&force=true")
    assert result.status_code == 200, result.text
    assert db.query(AffiliateCommunicationWhatsApp).filter_by(id=job_id).count() == 0
    assert db.get(AffiliateCommunication, message_id) is not None
    assert service.process_central_whatsapp_outbox_once()["claimed"] == 0
    provider.assert_not_called()


def test_rate_limit_retry_budget_is_bounded(db, provider):
    job, *_ = queued_job(db)
    provider.side_effect = ProviderError(429,20429)
    for attempt in range(3):
        stats = service.process_central_whatsapp_outbox_once()
        assert stats["retry" if attempt < 2 else "failed"] == 1
        db.refresh(job)
        job.next_attempt_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()
    assert job.attempts == 3 and job.status == "failed"
    assert service.process_central_whatsapp_outbox_once()["claimed"] == 0
    assert provider.call_count == 3


def test_success_without_provider_id_is_uncertain_and_never_retried(db, provider):
    job, *_ = queued_job(db)
    provider.return_value = SimpleNamespace(sid=None)
    assert service.process_central_whatsapp_outbox_once()["uncertain"] == 1
    assert service.process_central_whatsapp_outbox_once()["claimed"] == 0
    db.refresh(job)
    assert job.status == "uncertain"
    provider.assert_called_once()


def test_worker_isolates_both_queues_and_does_not_log_exception_text(monkeypatch, caplog):
    webhook = Mock(side_effect=RuntimeError("secret webhook data"))
    outbound = Mock(return_value={"claimed":0})
    monkeypatch.setattr(worker, "process_webhook_outbox_once", webhook)
    monkeypatch.setattr(worker, "process_central_whatsapp_outbox_once", outbound)
    assert worker._process_cycle(4) is False
    outbound.assert_called_once_with(limit=4)
    assert "secret webhook data" not in caplog.text
    webhook.side_effect = None
    webhook.return_value = {}
    outbound.side_effect = RuntimeError("secret outbound data")
    assert worker._process_cycle(4) is False
    assert webhook.call_count == 2
    assert "secret outbound data" not in caplog.text


def test_worker_bounds_outbound_batch_to_keep_webhooks_responsive(monkeypatch):
    webhook = Mock(return_value={})
    outbound = Mock(return_value={})
    monkeypatch.setattr(worker, "process_webhook_outbox_once", webhook)
    monkeypatch.setattr(worker, "process_central_whatsapp_outbox_once", outbound)
    assert worker._process_cycle(50) is True
    webhook.assert_called_once_with(limit=50)
    outbound.assert_called_once_with(limit=5)
