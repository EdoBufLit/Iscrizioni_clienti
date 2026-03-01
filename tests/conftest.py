"""Shared pytest fixtures for smoke tests.

Sets DATABASE_URL to a local test file *before* any app module is imported,
so that the SQLAlchemy engine connects to the right database.
"""

import os

# Must be set before importing anything from app.*
os.environ["DATABASE_URL"] = "sqlite:///test_qa.db"
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-qa")
os.environ.setdefault("BASE_URL", "http://localhost:8000")
os.environ.setdefault("UPLOAD_DIR", "data/uploads")

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

from app.db import SessionLocal
from app.main import app
from app.models import EmailOutbox
from app.services.email_outbox import drain_outbox_for_tests
from app.utils import clear_captured_emails


@pytest.fixture(scope="session")
def client():
    """Create a TestClient whose lifespan triggers DB init + seed data.
    Also patches rate limiter to avoid 429 in tests.
    """
    with patch("app.middleware.RateLimiter.check"):
        with TestClient(app) as c:
            yield c

    # Cleanup
    try:
        os.remove("test_qa.db")
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
