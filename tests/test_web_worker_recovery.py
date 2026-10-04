"""Real Uvicorn supervisor recovery proof; run with pytest --noconftest.

Uses an isolated temporary app and localhost socket. Linux-only process-group
cleanup guarantees that supervisor, workers and resource tracker cannot outlive
the test; Windows should run this check in the disposable Linux QA container.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
from textwrap import dedent
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

import pytest


_PROBE_APP = dedent(
    """
    import asyncio
    from contextlib import asynccontextmanager
    import json
    import os
    from pathlib import Path
    import time

    from fastapi import FastAPI
    from app.runtime_guard import EventLoopWatchdog

    @asynccontextmanager
    async def lifespan(app):
        guard = EventLoopWatchdog(interval_seconds=0.1, timeout_seconds=0.5)
        guard.start()
        Path(f"ready-{os.getpid()}.json").write_text(
            json.dumps({"pid": os.getpid()}), encoding="utf-8"
        )
        try:
            yield
        finally:
            guard.stop()

    app = FastAPI(lifespan=lifespan)

    @app.get("/health")
    async def health():
        return {"pid": os.getpid(), "served_at": time.monotonic()}

    @app.post("/stall")
    async def stall():
        pid = os.getpid()
        def block_event_loop():
            Path(f"blocked-{pid}.json").write_text(
                json.dumps({"pid": pid, "blocked_at": time.monotonic()}),
                encoding="utf-8",
            )
            time.sleep(30)
        # Let the PID response flush before this worker deliberately blocks.
        asyncio.get_running_loop().call_later(0.1, block_event_loop)
        return {"pid": pid}
    """
)


def _request_json(base_url, path, *, method="GET", timeout=0.25):
    request = Request(f"{base_url}{path}", method=method, headers={"Connection": "close"})
    with urlopen(request, timeout=timeout) as response:
        assert response.status == 200
        return json.load(response)


def _try_health(base_url):
    try:
        return _request_json(base_url, "/health")
    except (URLError, OSError, TimeoutError):
        return None


def _ready_pids(directory):
    return {int(path.stem.removeprefix("ready-")) for path in directory.glob("ready-*.json")}


def _stop_process_group(process):
    # Popen(start_new_session=True) makes this PID the dedicated process-group
    # ID. Both signals target only processes created for this integration test.
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass
    finally:
        # Also remove descendants if the parent exited before they did.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=5)


@pytest.mark.skipif(os.name == "nt", reason="Run the supervisor proof in isolated Linux QA for guaranteed process-tree cleanup")
def test_uvicorn_replaces_guard_terminated_worker_while_other_worker_serves(tmp_path):
    (tmp_path / "worker_recovery_probe.py").write_text(_PROBE_APP, encoding="utf-8")
    with socket.socket() as port_reservation:
        port_reservation.bind(("127.0.0.1", 0))
        port = port_reservation.getsockname()[1]
    base_url = f"http://127.0.0.1:{port}"
    project_root = Path(__file__).resolve().parents[1]
    # No application database URL, provider credentials or production settings
    # enter the tiny probe. Only interpreter/OS necessities are inherited.
    env = {
        name: os.environ[name]
        for name in ("PATH", "HOME", "LANG", "LC_ALL", "LD_LIBRARY_PATH", "TMPDIR")
        if name in os.environ
    }
    env.update(
        APP_ENV="test",
        PYTHONPATH=str(project_root),
        PYTHONUNBUFFERED="1",
        PYTHONDONTWRITEBYTECODE="1",
    )
    log_path = tmp_path / "uvicorn-supervisor.log"
    with log_path.open("wb") as log_file:
        process = subprocess.Popen(
            [
                sys.executable, "-m", "uvicorn", "worker_recovery_probe:app",
                "--host", "127.0.0.1", "--port", str(port),
                "--workers", "2", "--timeout-worker-healthcheck", "1",
                "--timeout-graceful-shutdown", "1", "--log-level", "info",
            ],
            cwd=tmp_path,
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        try:
            startup_deadline = time.monotonic() + 15
            initial_pids = set()
            while time.monotonic() < startup_deadline:
                if process.poll() is not None:
                    pytest.fail(f"Uvicorn failed to start: {log_path.read_text(encoding='utf-8')}")
                initial_pids = _ready_pids(tmp_path)
                if len(initial_pids) == 2 and _try_health(base_url) is not None:
                    break
                time.sleep(0.03)
            assert len(initial_pids) == 2, log_path.read_text(encoding="utf-8")

            stalled_pid = _request_json(base_url, "/stall", method="POST", timeout=1)["pid"]
            assert stalled_pid in initial_pids
            blocking_marker = tmp_path / f"blocked-{stalled_pid}.json"
            marker_deadline = time.monotonic() + 2
            blocked_at = None
            while time.monotonic() < marker_deadline:
                try:
                    blocked_at = json.loads(blocking_marker.read_text(encoding="utf-8"))["blocked_at"]
                    break
                except (FileNotFoundError, json.JSONDecodeError):
                    time.sleep(0.005)
            assert blocked_at is not None, "Worker never entered the deliberate event-loop stall"

            surviving_pid = (initial_pids - {stalled_pid}).pop()
            during_stall = _request_json(base_url, "/health", timeout=0.25)
            assert during_stall["pid"] == surviving_pid
            # The watchdog cannot terminate before its 0.5-second deadline.
            # The other worker serves while the original child is still stuck.
            assert blocked_at <= during_stall["served_at"] < blocked_at + 0.45

            replacement_pid = None
            recovery_deadline = time.monotonic() + 10
            while time.monotonic() < recovery_deadline:
                response = _try_health(base_url)
                if response is not None:
                    assert response["pid"] != stalled_pid
                    if response["pid"] not in initial_pids:
                        replacement_pid = response["pid"]
                        break
                time.sleep(0.01)
            assert replacement_pid is not None, log_path.read_text(encoding="utf-8")
            assert replacement_pid in _ready_pids(tmp_path)
            assert process.poll() is None, "Supervisor itself must survive worker recovery"
        finally:
            _stop_process_group(process)
