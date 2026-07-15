from __future__ import annotations

from contextlib import contextmanager
import os
from pathlib import Path
import tempfile
import threading
from typing import Iterator

from app.db import SQLALCHEMY_DATABASE_URL


_PROCESS_LOCK = threading.Lock()


def _sqlite_lock_path() -> Path | None:
    url = (SQLALCHEMY_DATABASE_URL or "").strip()
    if not url.startswith("sqlite:"):
        return None

    raw_path = url.split("?", 1)[0].removeprefix("sqlite:///")
    if not raw_path or raw_path == ":memory:":
        return Path(tempfile.gettempdir()) / "assonam-sqlite-card-allocation.lock"

    database_path = Path(raw_path)
    if not database_path.is_absolute():
        database_path = (Path.cwd() / database_path).resolve()
    return database_path.with_name(f"{database_path.name}.card-allocation.lock")


def _lock_file(handle) -> None:
    if os.name == "nt":
        import msvcrt

        handle.seek(0)
        if handle.read(1) == b"":
            handle.seek(0)
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
        return

    import fcntl

    fcntl.flock(handle.fileno(), fcntl.LOCK_EX)


def _unlock_file(handle) -> None:
    if os.name == "nt":
        import msvcrt

        handle.seek(0)
        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        return

    import fcntl

    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


@contextmanager
def serialize_sqlite_card_allocation_requests() -> Iterator[None]:
    """Serialize complete card-issuing requests when SQLite is in use.

    Card allocation is reached after earlier ORM reads/writes in several real
    flows. SQLite cannot safely upgrade those deferred transactions after a
    competing allocation commits. Holding an inter-process lock from before
    dependency resolution until the request transaction finishes prevents a
    stale allocation snapshot without changing response contracts. PostgreSQL
    continues to use transaction-scoped advisory locks in ``card_allocation``.
    """

    lock_path = _sqlite_lock_path()
    if lock_path is None:
        yield
        return

    lock_path.parent.mkdir(parents=True, exist_ok=True)
    _PROCESS_LOCK.acquire()
    handle = None
    try:
        handle = lock_path.open("a+b")
        _lock_file(handle)
        yield
    finally:
        if handle is not None:
            try:
                _unlock_file(handle)
            finally:
                handle.close()
        _PROCESS_LOCK.release()


def sqlite_card_allocation_request_guard() -> Iterator[None]:
    """FastAPI yield dependency used on routes that can issue a card."""

    with serialize_sqlite_card_allocation_requests():
        yield
