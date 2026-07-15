from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from app import audit
from app.db import SessionLocal
from app.models import EmailOutbox, OperationLog
from app.services.email_outbox import build_email_payload, enqueue_email, mark_failed


def test_log_operation_redacts_recursive_pii_before_db_and_stdout(monkeypatch) -> None:
    sentinels = {
        "email": "audit.sentinel@example.test",
        "phone": "+39 333 987 6543",
        "fiscal_code": "RSSMRA80A01H501U",
        "password": "NeverLogThisPassword!",
        "token": "tok_never_log_this_value",
        "message": "testo privato sentinella senza pattern",
        "provider_instance": "provider-instance-raw-987654",
        "ip": "203.0.113.41",
        "user_agent": "SentinelBrowser/99.1",
    }
    emitted: list[str] = []
    monkeypatch.setattr(audit._logger, "info", lambda message, *args, **kwargs: emitted.append(str(message)))

    db = SessionLocal()
    try:
        entity_id = uuid.uuid4().int % 1_000_000_000
        audit.log_operation(
            db,
            action="security.sentinel",
            entity_type="member",
            entity_id=entity_id,
            metadata={
                "member_id": 42,
                "status": "queued",
                "email": sentinels["email"],
                "phone": sentinels["phone"],
                "fiscal_code": sentinels["fiscal_code"],
                "password": sentinels["password"],
                "access_token": sentinels["token"],
                "message_body": sentinels["message"],
                "raw_provider_payload": {
                    "provider_instance_id": sentinels["provider_instance"],
                },
            },
            ip=sentinels["ip"],
            user_agent=sentinels["user_agent"],
        )
        db.flush()
        row = (
            db.query(OperationLog)
            .filter(
                OperationLog.action == "security.sentinel",
                OperationLog.entity_id == entity_id,
            )
            .one()
        )

        serialized = json.dumps(
            {
                "metadata": row.metadata_json,
                "ip": row.ip,
                "user_agent": row.user_agent,
                "stdout": emitted,
            },
            default=str,
        )
        for sentinel in sentinels.values():
            assert sentinel not in serialized

        assert row.metadata_json["member_id"] == 42
        assert row.metadata_json["status"] == "queued"
        assert str(row.metadata_json["email"]).startswith("identifier_hash:")
        assert row.metadata_json["message_body"] == "[REDACTED]"
        assert row.metadata_json["raw_provider_payload"] == "[REDACTED]"
        assert str(row.ip).startswith("identifier_hash:")
        assert str(row.user_agent).startswith("identifier_hash:")
    finally:
        db.rollback()
        db.close()


def test_email_outbox_failure_persists_only_redacted_provider_error() -> None:
    sentinel_email = f"delivery-{uuid.uuid4().hex}@example.test"
    sentinel_phone = "+39 333 111 2233"
    db = SessionLocal()
    try:
        outbox_id = enqueue_email(
            db,
            email_type="security_redaction_test",
            to_email="recipient@example.test",
            subject="Redaction test",
            payload=build_email_payload(text_body="test"),
            priority=5,
        )
        mark_failed(
            db,
            outbox_id,
            f"Provider rejected {sentinel_email} ({sentinel_phone}) token=secret-value-123456",
            datetime.now(timezone.utc),
        )
        row = db.get(EmailOutbox, outbox_id)
        assert row is not None
        assert sentinel_email not in (row.last_error or "")
        assert sentinel_phone not in (row.last_error or "")
        assert "secret-value-123456" not in (row.last_error or "")
        assert "email_hash:" in (row.last_error or "")
        assert "[REDACTED]" in (row.last_error or "")
    finally:
        db.rollback()
        db.close()
