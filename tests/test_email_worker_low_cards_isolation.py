import argparse

from app.workers import email_sender


def test_email_worker_once_processes_outbox_only(monkeypatch):
    claimed_limits: list[int] = []

    monkeypatch.setattr(
        email_sender,
        "_parse_args",
        lambda: argparse.Namespace(
            once=True,
            limit=7,
        ),
    )
    monkeypatch.setattr(
        email_sender,
        "process_outbox_once",
        lambda limit: claimed_limits.append(limit)
        or {"claimed": 3, "sent": 3, "retry_scheduled": 0, "permanent_failed": 0},
    )

    result = email_sender.main()
    assert result == 0
    assert claimed_limits == [7]
