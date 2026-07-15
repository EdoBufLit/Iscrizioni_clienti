"""Shared pytest fixtures for smoke tests.

Sets DATABASE_URL to a local test file *before* any app module is imported,
so that the SQLAlchemy engine connects to the right database.
"""

import os
from pathlib import Path
import tempfile

# Must be set before importing anything from app.*
_TEST_DB_PATH = Path(tempfile.gettempdir()) / f"assonam-pytest-{os.getpid()}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-qa")
os.environ.setdefault("BASE_URL", "http://localhost:8000")
os.environ.setdefault("UPLOAD_DIR", "data/uploads")
os.environ.setdefault("SUMUP_CREDENTIALS_ENCRYPTION_KEY", "test-sumup-encryption-key-32-bytes")
os.environ.setdefault("AFFILIAZIONE_ENABLED", "true")
os.environ.setdefault("ENABLE_STRIPE_CONNECT_DEMO", "true")
for stripe_env in [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_ID",
    "STRIPE_PUBLISHABLE_KEY",
]:
    os.environ.pop(stripe_env, None)

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

from app.db import SessionLocal, engine
from app.main import app
from app.models import EmailOutbox
from app.services.email_outbox import drain_outbox_for_tests
from app.utils import clear_captured_emails
from init_db import init_db


# Direct SessionLocal-based tests need the schema repaired before the TestClient lifespan runs.
init_db()


@pytest.fixture(scope="session")
def client():
    """Create a TestClient whose lifespan triggers DB init + seed data.
    Also patches rate limiter to avoid 429 in tests.
    """
    with patch("app.middleware.RateLimiter.check"), patch(
        "app.services.security_rate_limits.enforce_db_rate_limit"
    ):
        with TestClient(app) as c:
            yield c

    # Cleanup
    try:
        _TEST_DB_PATH.unlink()
    except OSError:
        pass


def pytest_sessionfinish(session, exitstatus):
    """Leave no shared SQLite state that can contaminate the next test run."""

    engine.dispose()
    try:
        _TEST_DB_PATH.unlink()
    except OSError:
        pass


@pytest.fixture
def drain_email_outbox():
    def _drain():
        return drain_outbox_for_tests()

    return _drain


@pytest.fixture(autouse=True)
def reset_email_delivery_state():
    clear_captured_emails()
    db = SessionLocal()
    try:
        db.query(EmailOutbox).delete()
        db.commit()
    finally:
        db.close()
    yield
    clear_captured_emails()
    db = SessionLocal()
    try:
        db.query(EmailOutbox).delete()
        db.commit()
    finally:
        db.close()
