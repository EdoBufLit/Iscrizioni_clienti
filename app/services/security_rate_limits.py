"""Distributed rate limits for public authentication and signup endpoints."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.services.db_rate_limit import enforce_db_rate_limit


AUTH_RATE_LIMIT_BUCKET = "security:auth:global"
JOIN_RATE_LIMIT_BUCKET = "security:join:global"
PAYMENT_STATUS_RATE_LIMIT_BUCKET = "security:payment-status:global"
_RATE_LIMIT_DETAIL = "Too many requests. Please try again later."


def _enforce_security_rate_limit(
    db: Session,
    *,
    bucket: str,
    client_ip: str,
    max_requests: int,
) -> None:
    """Apply a global-per-IP limit while preserving the legacy 429 response."""

    try:
        enforce_db_rate_limit(
            db,
            bucket=bucket,
            client_ip=client_ip,
            window_seconds=60,
            max_requests=max_requests,
        )
    except HTTPException as exc:
        if exc.status_code == 429:
            raise HTTPException(status_code=429, detail=_RATE_LIMIT_DETAIL) from None
        raise


def enforce_auth_rate_limit(db: Session, *, client_ip: str) -> None:
    """Allow at most five authentication requests per IP every 60 seconds."""

    _enforce_security_rate_limit(
        db,
        bucket=AUTH_RATE_LIMIT_BUCKET,
        client_ip=client_ip,
        max_requests=5,
    )


def enforce_join_rate_limit(db: Session, *, client_ip: str) -> None:
    """Allow at most three signup/checkout requests per IP every 60 seconds."""

    _enforce_security_rate_limit(
        db,
        bucket=JOIN_RATE_LIMIT_BUCKET,
        client_ip=client_ip,
        max_requests=3,
    )


def enforce_payment_status_rate_limit(db: Session, *, client_ip: str) -> None:
    """Permit normal three-second polling while constraining ID enumeration."""

    _enforce_security_rate_limit(
        db,
        bucket=PAYMENT_STATUS_RATE_LIMIT_BUCKET,
        client_ip=client_ip,
        max_requests=30,
    )
