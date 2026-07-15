import argparse

from app.workers import low_cards_scheduler


def test_low_cards_worker_once_returns_zero_when_job_succeeds(monkeypatch):
    monkeypatch.setattr(
        low_cards_scheduler,
        "_parse_args",
        lambda: argparse.Namespace(
            once=True,
            force=False,
        ),
    )
    monkeypatch.setattr(
        low_cards_scheduler,
        "run_low_cards_alert_job_once",
        lambda *, force: {"ok": True, "ran": True, "sent": 2, "errors": 0},
    )

    result = low_cards_scheduler.main()

    assert result == 0


def test_low_cards_worker_safe_wrapper_returns_error_payload_on_unhandled_failure(monkeypatch):
    def _boom(*, force: bool):
        raise RuntimeError("network down")

    monkeypatch.setattr(low_cards_scheduler, "run_low_cards_alert_job_once", _boom)

    payload = low_cards_scheduler._run_low_cards_alerts_safely(force=True)

    assert payload["ok"] is False
    assert payload["ran"] is False
    assert payload["errors"] == 1
    assert payload["error"] == "network down"
