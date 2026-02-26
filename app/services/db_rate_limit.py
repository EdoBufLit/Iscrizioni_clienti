from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import IngestRateLimit


def _dialect_name(db: Session) -> str:
    bind = db.get_bind()
    if bind is None or getattr(bind, "dialect", None) is None:
        return ""
    return (bind.dialect.name or "").lower()


def _begin_rate_limit_tx(db: Session) -> None:
    dialect_name = _dialect_name(db)

    if dialect_name == "sqlite":
        db.execute(text("BEGIN IMMEDIATE"))
        return

    if dialect_name == "postgresql":
        # SQLAlchemy session auto-begins transactions on first statement on Postgres.
        return


def _now_for_dialect(dialect_name: str, now: datetime | None) -> datetime:
    if now is not None:
        return now
    if dialect_name == "postgresql":
        return datetime.now(timezone.utc)
    return datetime.utcnow()


def _as_utc_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        # Legacy/imported rows may be stored as naive UTC.
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _elapsed_seconds(current_time: datetime, window_started_at: datetime | None, fallback: int) -> float:
    if window_started_at is None:
        return float(fallback)

    try:
        return (current_time - window_started_at).total_seconds()
    except TypeError:
        # Post-cutover DBs can contain mixed naive/aware timestamps during transition.
        return (_as_utc_aware(current_time) - _as_utc_aware(window_started_at)).total_seconds()


def enforce_db_rate_limit(
    db: Session,
    *,
    bucket: str,
    client_ip: str,
    window_seconds: int,
    max_requests: int,
    now: datetime | None = None,
) -> None:
    normalized_window = max(1, int(window_seconds))
    normalized_max = max(1, int(max_requests))
    normalized_bucket = (bucket or "global").strip().lower()[:255]
    normalized_ip = (client_ip or "unknown").strip()[:64]
    dialect_name = _dialect_name(db)
    current_time = _now_for_dialect(dialect_name, now)

    try:
        max_attempts = 2 if dialect_name == "postgresql" else 1
        for attempt in range(max_attempts):
            _begin_rate_limit_tx(db)

            row_query = db.query(IngestRateLimit).filter(
                IngestRateLimit.org_slug == normalized_bucket,
                IngestRateLimit.client_ip == normalized_ip,
            )
            if dialect_name == "postgresql":
                row_query = row_query.with_for_update()

            row = row_query.first()

            if not row:
                db.add(
                    IngestRateLimit(
                        org_slug=normalized_bucket,
                        client_ip=normalized_ip,
                        window_started_at=current_time,
                        request_count=1,
                    )
                )
                try:
                    db.commit()
                    return
                except IntegrityError:
                    db.rollback()
                    if dialect_name == "postgresql" and attempt + 1 < max_attempts:
                        # Another concurrent request inserted the row first; retry and lock it.
                        continue
                    raise

            elapsed_seconds = _elapsed_seconds(current_time, row.window_started_at, normalized_window)
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
            return

        raise RuntimeError("Rate limiter update retry exhausted")
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise
