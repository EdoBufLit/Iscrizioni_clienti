"""Bound event-loop stalls in each supervised web worker.

Uvicorn's multiprocess health check runs on a separate thread, so it can remain
healthy while the request event loop is blocked. This monitor requires an
acknowledgement from that loop and terminates only its own worker on a sustained
stall. Run web workers under a process supervisor so they are replaced on exit.
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import threading
from collections.abc import Callable

logger = logging.getLogger(__name__)

_STALL_MESSAGE = "Web worker event loop is unresponsive; terminating worker for recovery."


def _terminate_worker() -> None:
    # A blocked loop cannot reliably run graceful shutdown or raise SystemExit.
    os._exit(1)


def _log_stall() -> None:
    try:
        logger.critical(_STALL_MESSAGE)
    except Exception:
        pass


class EventLoopWatchdog:
    """Probe the running loop from a daemon thread, with one probe outstanding.

    Start after application initialization, inside the worker's async lifespan,
    and call stop before graceful shutdown. The default recovery threshold is
    at most 50 seconds (the next 5-second probe plus its 45-second deadline).
    The optional callback and shorter intervals are intended for isolated tests.
    """

    def __init__(
        self,
        *,
        interval_seconds: float = 5.0,
        timeout_seconds: float = 45.0,
        on_unresponsive: Callable[[], None] | None = None,
    ) -> None:
        for name, value in (
            ("interval_seconds", interval_seconds),
            ("timeout_seconds", timeout_seconds),
        ):
            if not math.isfinite(value) or value <= 0:
                raise ValueError(f"{name} must be finite and positive")
        self._interval_seconds = interval_seconds
        self._timeout_seconds = timeout_seconds
        self._on_unresponsive = (
            _terminate_worker if on_unresponsive is None else on_unresponsive
        )
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._pending: threading.Event | None = None
        self._thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def start(self, loop: asyncio.AbstractEventLoop | None = None) -> None:
        """Start once for the current running loop; repeated starts are harmless."""
        loop = asyncio.get_running_loop() if loop is None else loop
        if loop.is_closed() or not loop.is_running():
            raise RuntimeError("Event-loop watchdog requires a running loop")
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                if loop is not self._loop:
                    raise RuntimeError("Event-loop watchdog already monitors another loop")
                return
            self._stop.clear()
            self._loop = loop
            self._thread = threading.Thread(
                target=self._monitor,
                args=(loop,),
                name="web-event-loop-watchdog",
                daemon=True,
            )
            self._thread.start()

    def stop(self) -> None:
        """Interrupt a pending probe without waiting for its timeout."""
        self._stop.set()
        with self._lock:
            if self._pending is not None:
                self._pending.set()
            thread = self._thread
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=1.0)

    def _monitor(self, loop: asyncio.AbstractEventLoop) -> None:
        while not self._stop.wait(self._interval_seconds):
            if loop.is_closed():
                return
            acknowledged = threading.Event()
            with self._lock:
                if self._stop.is_set():
                    return
                self._pending = acknowledged
            try:
                loop.call_soon_threadsafe(acknowledged.set)
            except RuntimeError:
                # The loop may close between the check and callback scheduling.
                with self._lock:
                    self._pending = None
                return
            responsive = acknowledged.wait(self._timeout_seconds)
            with self._lock:
                self._pending = None
                if self._stop.is_set() or loop.is_closed():
                    return
            if not responsive:
                try:
                    # Logging can itself be the source of a stall. Keep its
                    # locks and output I/O off the recovery thread as well.
                    threading.Thread(target=_log_stall, daemon=True).start()
                finally:
                    self._on_unresponsive()
                return
