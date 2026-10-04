import asyncio
import subprocess
import sys
import threading
import time
from pathlib import Path
from textwrap import dedent

import pytest

from app.runtime_guard import EventLoopWatchdog


class _StalledLoop:
    """Record queued probes while deliberately withholding acknowledgement."""

    def __init__(self):
        self.closed = False
        self.scheduled = threading.Event()
        self.callbacks = []

    def is_closed(self):
        return self.closed

    def is_running(self):
        return not self.closed

    def call_soon_threadsafe(self, callback):
        if self.closed:
            raise RuntimeError("Event loop is closed")
        self.callbacks.append(callback)
        self.scheduled.set()


def test_responsive_asyncio_loop_does_not_trigger_recovery():
    unresponsive = threading.Event()

    async def exercise():
        guard = EventLoopWatchdog(
            interval_seconds=0.01,
            timeout_seconds=0.2,
            on_unresponsive=unresponsive.set,
        )
        guard.start()
        guard.start()  # Lifespan wiring cannot accidentally create two monitors.
        try:
            await asyncio.sleep(0.25)
        finally:
            guard.stop()

    asyncio.run(exercise())
    assert not unresponsive.is_set()


def test_stalled_loop_has_only_one_outstanding_probe_and_recovers_once(caplog, monkeypatch):
    from app import runtime_guard

    loop = _StalledLoop()
    recoveries = []
    recovered = threading.Event()
    logged = threading.Event()
    original_log = runtime_guard.logger.critical

    def record_log(message):
        original_log(message)
        logged.set()

    monkeypatch.setattr(runtime_guard.logger, "critical", record_log)

    def recover():
        recoveries.append(True)
        recovered.set()

    guard = EventLoopWatchdog(
        interval_seconds=0.01,
        timeout_seconds=0.2,
        on_unresponsive=recover,
    )
    guard.start(loop)
    try:
        assert loop.scheduled.wait(1)
        time.sleep(0.05)
        assert len(loop.callbacks) == 1
        assert recovered.wait(1)
        assert logged.wait(1)
    finally:
        guard.stop()

    assert recoveries == [True]
    assert len(loop.callbacks) == 1
    assert "Web worker event loop is unresponsive; terminating worker for recovery." in caplog.text


def test_blocked_logging_cannot_delay_worker_recovery(monkeypatch):
    from app import runtime_guard

    log_started = threading.Event()
    release_log = threading.Event()
    recovered = threading.Event()

    def blocked_log(_message):
        log_started.set()
        release_log.wait(2)

    monkeypatch.setattr(runtime_guard.logger, "critical", blocked_log)
    guard = EventLoopWatchdog(interval_seconds=0.01, timeout_seconds=0.1, on_unresponsive=recovered.set)
    guard.start(_StalledLoop())
    try:
        assert log_started.wait(1)
        assert recovered.wait(0.5), "Recovery must not wait for logging locks or stdout"
        assert not release_log.is_set()
    finally:
        release_log.set()
        guard.stop()


def test_shutdown_interrupts_pending_probe_without_triggering_recovery():
    loop = _StalledLoop()
    unresponsive = threading.Event()
    guard = EventLoopWatchdog(
        interval_seconds=0.01,
        timeout_seconds=5,
        on_unresponsive=unresponsive.set,
    )
    guard.start(loop)
    assert loop.scheduled.wait(1)
    started = time.monotonic()
    guard.stop()

    assert time.monotonic() - started < 1.5
    assert not guard._thread.is_alive()
    assert not unresponsive.is_set()
    # A late acknowledgement from the old probe is harmless after shutdown.
    loop.callbacks[0]()
    assert not unresponsive.is_set()


def test_loop_closing_with_a_pending_probe_does_not_trigger_recovery():
    loop = _StalledLoop()
    unresponsive = threading.Event()
    guard = EventLoopWatchdog(
        interval_seconds=0.01,
        timeout_seconds=0.1,
        on_unresponsive=unresponsive.set,
    )
    guard.start(loop)
    try:
        assert loop.scheduled.wait(1)
        loop.closed = True
        guard._thread.join(timeout=1)
        assert not guard._thread.is_alive()
        assert not unresponsive.is_set()
    finally:
        guard.stop()


def test_loop_closing_while_scheduling_a_probe_does_not_trigger_recovery():
    class ClosingLoop(_StalledLoop):
        def call_soon_threadsafe(self, callback):
            self.closed = True
            self.scheduled.set()
            raise RuntimeError("Event loop is closed")

    loop = ClosingLoop()
    unresponsive = threading.Event()
    guard = EventLoopWatchdog(
        interval_seconds=0.01,
        timeout_seconds=0.1,
        on_unresponsive=unresponsive.set,
    )
    guard.start(loop)
    try:
        assert loop.scheduled.wait(1)
        guard._thread.join(timeout=1)
        assert not guard._thread.is_alive()
        assert not unresponsive.is_set()
    finally:
        guard.stop()


def test_real_blocked_loop_terminates_only_the_isolated_worker_process():
    script = dedent(
        """
        import asyncio
        import time
        from app.runtime_guard import EventLoopWatchdog

        async def run():
            guard = EventLoopWatchdog(interval_seconds=0.01, timeout_seconds=0.1)
            guard.start()
            print("worker_started", flush=True)
            time.sleep(5)
            print("worker_still_stuck", flush=True)

        asyncio.run(run())
        """
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=Path(__file__).resolve().parents[1],
        capture_output=True,
        text=True,
        timeout=3,
        check=False,
    )

    assert result.returncode == 1
    assert result.stdout.strip() == "worker_started"
    assert "Web worker event loop is unresponsive; terminating worker for recovery." in result.stderr


def test_gracefully_stopped_real_worker_does_not_exit():
    script = dedent(
        """
        import asyncio
        import time
        from app.runtime_guard import EventLoopWatchdog

        async def run():
            guard = EventLoopWatchdog(interval_seconds=0.01, timeout_seconds=0.1)
            guard.start()
            await asyncio.sleep(0.15)
            guard.stop()
            time.sleep(0.2)
            print("worker_stopped", flush=True)

        asyncio.run(run())
        """
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=Path(__file__).resolve().parents[1],
        capture_output=True,
        text=True,
        timeout=3,
        check=False,
    )

    assert result.returncode == 0
    assert result.stdout.strip() == "worker_stopped"
    assert not result.stderr


@pytest.mark.parametrize("value", [0, -1, float("nan"), float("inf")])
@pytest.mark.parametrize("setting", ["interval_seconds", "timeout_seconds"])
def test_invalid_thresholds_are_rejected(setting, value):
    with pytest.raises(ValueError, match="must be finite and positive"):
        EventLoopWatchdog(**{setting: value})


def test_start_requires_a_running_loop():
    loop = asyncio.new_event_loop()
    try:
        with pytest.raises(RuntimeError, match="requires a running loop"):
            EventLoopWatchdog().start(loop)
    finally:
        loop.close()
