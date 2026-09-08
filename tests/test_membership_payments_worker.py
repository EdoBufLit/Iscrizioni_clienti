from __future__ import annotations

import os
import sys
import time

import pytest

from app.workers import membership_payments as worker


@pytest.fixture(autouse=True)
def isolated_heartbeat(tmp_path, monkeypatch):
    monkeypatch.setattr(worker, "HEARTBEAT_PATH", tmp_path / "worker.ready")


def test_worker_retries_after_failure_without_logging_provider_secret(monkeypatch, caplog):
    calls = []

    def reconcile(*, limit):
        calls.append(limit)
        if len(calls) == 1:
            raise RuntimeError("provider-secret-must-not-appear")
        return {"processed": 1}

    def sleep(seconds):
        assert seconds == 60
        if len(calls) == 2:
            raise KeyboardInterrupt

    monkeypatch.setattr(sys, "argv", ["worker"])
    monkeypatch.setattr(worker, "_validate_schema", lambda: None)
    monkeypatch.setattr(worker, "_reconcile_once", reconcile)
    monkeypatch.setattr(worker.time, "sleep", sleep)
    monkeypatch.setattr(worker.settings, "MEMBERSHIP_PAYMENT_RECONCILE_INTERVAL_SECONDS", 60)
    with pytest.raises(KeyboardInterrupt):
        worker.main()
    assert calls == [50, 50]
    assert "cycle_failed error_type=RuntimeError" in caplog.text
    assert "provider-secret-must-not-appear" not in caplog.text
    assert worker._healthcheck(interval_seconds=60) == 0


@pytest.mark.parametrize("failure,expected_exit", [(False, 0), (True, 1)])
def test_once_exit_status_reports_reconciliation_failure(monkeypatch, failure, expected_exit):
    def reconcile(*, limit):
        assert limit == 7
        if failure:
            raise RuntimeError("unavailable")
        return {"processed": 0}

    monkeypatch.setattr(sys, "argv", ["worker", "--once", "--limit", "7"])
    monkeypatch.setattr(worker, "_validate_schema", lambda: None)
    monkeypatch.setattr(worker, "_reconcile_once", reconcile)
    monkeypatch.setattr(worker.time, "sleep", lambda _: pytest.fail("once must not sleep"))
    assert worker.main() == expected_exit
    assert worker.HEARTBEAT_PATH.exists() is (not failure)


def test_stale_schema_prevents_reconciliation(monkeypatch):
    import init_db

    def stale(_):
        raise RuntimeError("database Alembic revision does not exactly match code head")

    monkeypatch.setattr(sys, "argv", ["worker", "--once"])
    monkeypatch.setattr(init_db, "_deployed_schema_mode", lambda: True)
    monkeypatch.setattr(init_db, "_validate_deployed_alembic_revision", stale)
    monkeypatch.setattr(worker, "_reconcile_once", lambda **_: pytest.fail("schema gate bypassed"))
    with pytest.raises(RuntimeError, match="does not exactly match code head"):
        worker.main()


def test_healthcheck_exposes_missing_or_stale_successful_cycle(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["worker", "--healthcheck"])
    monkeypatch.setattr(worker, "_validate_schema", lambda: pytest.fail("healthcheck must not mutate DB"))
    assert worker.main() == 1
    worker.HEARTBEAT_PATH.touch()
    assert worker.main() == 0
    stale_time = time.time() - 181
    os.utime(worker.HEARTBEAT_PATH, (stale_time, stale_time))
    assert worker.main() == 1


def test_item_errors_fail_once_without_hiding_worker_progress(monkeypatch, caplog):
    monkeypatch.setattr(sys, "argv", ["worker", "--once"])
    monkeypatch.setattr(worker, "_validate_schema", lambda: None)
    monkeypatch.setattr(worker, "_reconcile_once", lambda **_: {"processed": 2, "errors": 1})
    assert worker.main() == 1
    assert "cycle_errors count=1" in caplog.text
    assert worker._healthcheck(interval_seconds=60) == 0


def test_long_batch_renews_health_after_each_processed_payment(monkeypatch):
    from app.services import card_reservations

    def reconcile(*, limit, heartbeat):
        assert limit == 50
        heartbeat()
        assert worker._healthcheck(interval_seconds=60) == 0
        stale_time = time.time() - 181
        os.utime(worker.HEARTBEAT_PATH, (stale_time, stale_time))
        assert worker._healthcheck(interval_seconds=60) == 1
        heartbeat()
        assert worker._healthcheck(interval_seconds=60) == 0
        return {"processed": 2, "errors": 0}

    monkeypatch.setattr(card_reservations, "reconcile_membership_payments_once", reconcile)
    assert worker._run_once(limit=50)
