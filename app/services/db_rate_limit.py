from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import IngestRateLimit


def _begin_rate_limit_tx(db: Session) -> None:
    bind = db.get_bind()
    dialect_name = ""
    if bind is not None and getattr(bind, "dialect", None) is not None:
        dialect_name = (bind.dialect.name or "").lower()

    if dialect_name == "sqlite":
        db.execute(text("BEGIN IMMEDIATE"))
        return

    if dialect_name == "postgresql":
        # SQLAlchemy session auto-begins transactions on first statement on Postgres.
        return


def enforce_db_rate_limit(
    db: Session,
    *,
    bucket: str,
    client_ip: str,
    window_seconds: int,
    max_requests: int,
    now: datetime | None = None,
) -> None:
    current_time = now or datetime.utcnow()
    normalized_window = max(1, int(window_seconds))
    normalized_max = max(1, int(max_requests))
    normalized_bucket = (bucket or "global").strip().lower()[:255]
    normalized_ip = (client_ip or "unknown").strip()[:64]

    try:
        _begin_rate_limit_tx(db)

        row = (
            db.query(IngestRateLimit)
            .filter(
                IngestRateLimit.org_slug == normalized_bucket,
                IngestRateLimit.client_ip == normalized_ip,
            )
            .first()
        )

        if not row:
            db.add(
                IngestRateLimit(
                    org_slug=normalized_bucket,
                    client_ip=normalized_ip,
                    window_started_at=current_time,
                    request_count=1,
                )
            )
            db.commit()
            return

        elapsed_seconds = (
            (current_time - row.window_started_at).total_seconds()
            if row.window_started_at
            else normalized_window
        )
        if elapsed_seconds >= normalized_window:
            row.window_started_at = current_time
            row.request_count = 1
            row.updated_at = current_time
            db.commit()
            return

        if row.request_count >= normalized_max:
            db.rollback()
            raise HTTPException(status_code=429, detail="Too many requests")

        row.request_count = row.request_count + 1
        row.updated_at = current_time
        db.commit()
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise
