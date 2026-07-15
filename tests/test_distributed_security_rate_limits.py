from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.main import app
from app.models import IngestRateLimit, Organization
from app.services import security_rate_limits
from app.services.db_rate_limit import enforce_db_rate_limit as real_enforce_db_rate_limit
from app.services.security_rate_limits import (
    AUTH_RATE_LIMIT_BUCKET,
    JOIN_RATE_LIMIT_BUCKET,
    enforce_auth_rate_limit,
    enforce_join_rate_limit,
)


@pytest.fixture(autouse=True)
def _enable_real_distributed_limiter(monkeypatch) -> None:
    """Override the broad TestClient fixture bypass for this focused test module."""

    monkeypatch.setattr(
        security_rate_limits,
        "enforce_db_rate_limit",
        real_enforce_db_rate_limit,
    )


def _delete_limits(*, client_ip: str) -> None:
    db = SessionLocal()
    try:
        db.query(IngestRateLimit).filter(
            IngestRateLimit.org_slug.in_([AUTH_RATE_LIMIT_BUCKET, JOIN_RATE_LIMIT_BUCKET]),
            IngestRateLimit.client_ip == client_ip,
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def test_auth_limit_is_shared_by_independent_database_sessions() -> None:
    client_ip = f"198.51.100.{uuid.uuid4().int % 200 + 1}"
    _delete_limits(client_ip=client_ip)
    try:
        for _ in range(5):
            db = SessionLocal()
            try:
                enforce_auth_rate_limit(db, client_ip=client_ip)
            finally:
                db.close()

        sixth_process = SessionLocal()
        try:
            with pytest.raises(HTTPException) as exc_info:
                enforce_auth_rate_limit(sixth_process, client_ip=client_ip)
        finally:
            sixth_process.close()

        assert exc_info.value.status_code == 429
        assert exc_info.value.detail == "Too many requests. Please try again later."
    finally:
        _delete_limits(client_ip=client_ip)


def test_join_and_auth_limits_use_distinct_global_buckets() -> None:
    client_ip = f"203.0.113.{uuid.uuid4().int % 200 + 1}"
    _delete_limits(client_ip=client_ip)
    db = SessionLocal()
    try:
        for _ in range(3):
            enforce_join_rate_limit(db, client_ip=client_ip)

        with pytest.raises(HTTPException) as exc_info:
            enforce_join_rate_limit(db, client_ip=client_ip)
        assert exc_info.value.status_code == 429

        # Exhausting signup traffic must not consume the independent auth budget.
        enforce_auth_rate_limit(db, client_ip=client_ip)

        rows = {
            row.org_slug: row.request_count
            for row in db.query(IngestRateLimit)
            .filter(
                IngestRateLimit.org_slug.in_([AUTH_RATE_LIMIT_BUCKET, JOIN_RATE_LIMIT_BUCKET]),
                IngestRateLimit.client_ip == client_ip,
            )
            .all()
        }
        assert rows == {JOIN_RATE_LIMIT_BUCKET: 3, AUTH_RATE_LIMIT_BUCKET: 1}
    finally:
        db.close()
        _delete_limits(client_ip=client_ip)


def test_rate_limit_commit_does_not_commit_caller_business_transaction() -> None:
    client_ip = f"192.0.2.{uuid.uuid4().int % 200 + 1}"
    slug = f"pending-rate-limit-{uuid.uuid4().hex}"
    _delete_limits(client_ip=client_ip)
    business_db = SessionLocal()
    try:
        business_db.add(Organization(name="Pending limiter organization", slug=slug))
        enforce_auth_rate_limit(business_db, client_ip=client_ip)

        verifier = SessionLocal()
        try:
            assert verifier.query(Organization).filter(Organization.slug == slug).first() is None
            assert (
                verifier.query(IngestRateLimit)
                .filter(
                    IngestRateLimit.org_slug == AUTH_RATE_LIMIT_BUCKET,
                    IngestRateLimit.client_ip == client_ip,
                )
                .one()
                .request_count
                == 1
            )
        finally:
            verifier.close()
    finally:
        business_db.rollback()
        business_db.close()
        _delete_limits(client_ip=client_ip)


def test_auth_endpoint_uses_database_limit_when_legacy_limiter_is_bypassed() -> None:
    client_ip = "testclient"
    _delete_limits(client_ip=client_ip)
    try:
        with patch("app.middleware.RateLimiter.check") as legacy_check:
            with TestClient(app) as rate_client:
                responses = [
                    rate_client.post(
                        "/api/auth/login",
                        data={"email": "rate-limit-missing@example.invalid"},
                    )
                    for _ in range(6)
                ]

        assert [response.status_code for response in responses[:5]] == [200] * 5
        assert responses[5].status_code == 429
        assert responses[5].json()["detail"] == "Too many requests. Please try again later."
        legacy_check.assert_not_called()
    finally:
        _delete_limits(client_ip=client_ip)
