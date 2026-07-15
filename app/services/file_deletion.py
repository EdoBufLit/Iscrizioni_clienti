from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path, PurePosixPath

from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models_file_deletion import FileDeletionStatus, FileDeletionTask

logger = logging.getLogger(__name__)

UPLOADS_ROOT = "uploads"
_RETRY_SCHEDULE_SECONDS = (30, 60, 120, 300, 600, 1800, 3600)
_WINDOWS_DRIVE_PREFIX = re.compile(r"^[a-zA-Z]:")


class UnsafeFileDeletionPath(ValueError):
    pass


@dataclass(frozen=True)
class ClaimedFileDeletion:
    id: str
    storage_root: str
    relative_path: str
    attempts: int


def utcnow_aware() -> datetime:
    return datetime.now(timezone.utc)


def normalize_relative_storage_path(relative_path: str) -> str:
    raw_path = str(relative_path or "").strip().replace("\\", "/")
    raw_parts = raw_path.split("/")
    if (
        not raw_path
        or "\x00" in raw_path
        or raw_path.startswith("/")
        or raw_path.startswith("//")
        or _WINDOWS_DRIVE_PREFIX.match(raw_path)
        or ":" in raw_path
        or any(part in {"", ".", ".."} for part in raw_parts)
    ):
        raise UnsafeFileDeletionPath("unsafe relative storage path")

    normalized = PurePosixPath(raw_path)
    if normalized.is_absolute() or not normalized.parts:
        raise UnsafeFileDeletionPath("unsafe relative storage path")
    return normalized.as_posix()


def _storage_root_path(storage_root: str) -> Path:
    if storage_root != UPLOADS_ROOT:
        raise UnsafeFileDeletionPath("unknown storage root")
    return Path(settings.UPLOAD_DIR).resolve(strict=False)


def resolve_storage_target(*, storage_root: str, relative_path: str) -> Path:
    normalized_path = normalize_relative_storage_path(relative_path)
    root_path = _storage_root_path(storage_root)
    target_path = root_path.joinpath(*PurePosixPath(normalized_path).parts)
    current_path = root_path
    for path_part in PurePosixPath(normalized_path).parts:
        current_path = current_path / path_part
        if current_path.is_symlink():
            raise UnsafeFileDeletionPath("refusing to follow a symlink")
    resolved_target = target_path.resolve(strict=False)
    try:
        resolved_target.relative_to(root_path)
    except ValueError as exc:
        raise UnsafeFileDeletionPath("storage path escapes its allowed root") from exc
    return target_path


def delete_storage_file(*, storage_root: str, relative_path: str) -> None:
    """Delete one regular file; absent paths succeed and symlinks are refused."""

    target_path = resolve_storage_target(
        storage_root=storage_root,
        relative_path=relative_path,
    )
    if not target_path.exists() and not target_path.is_symlink():
        return
    if target_path.is_dir():
        raise UnsafeFileDeletionPath("refusing to delete a directory")
    target_path.unlink(missing_ok=True)


def enqueue_file_deletion(
    db: Session,
    relative_path: str,
    *,
    storage_root: str = UPLOADS_ROOT,
) -> str:
    """Add a deletion intent to the caller's transaction without committing it."""

    normalized_path = normalize_relative_storage_path(relative_path)
    # Resolve now as well as in the worker so invalid roots and current symlink
    # escapes are rejected before an outbox row can be persisted.
    resolve_storage_target(
        storage_root=storage_root,
        relative_path=normalized_path,
    )
    task = FileDeletionTask(
        storage_root=storage_root,
        relative_path=normalized_path,
        status=FileDeletionStatus.QUEUED.value,
        attempts=0,
        next_retry_at=utcnow_aware(),
    )
    db.add(task)
    db.flush()
    return task.id


def recover_stale_file_deletions(db: Session) -> int:
    cutoff = utcnow_aware() - timedelta(
        seconds=max(30, int(settings.FILE_DELETION_STALE_AFTER_SECONDS))
    )
    recovered = (
        db.query(FileDeletionTask)
        .filter(
            FileDeletionTask.status == FileDeletionStatus.PROCESSING.value,
            FileDeletionTask.updated_at <= cutoff,
        )
        .update(
            {
                FileDeletionTask.status: FileDeletionStatus.FAILED.value,
                FileDeletionTask.last_error: "worker_recovered_stale_processing",
                FileDeletionTask.next_retry_at: utcnow_aware(),
                FileDeletionTask.updated_at: utcnow_aware(),
            },
            synchronize_session=False,
        )
    )
    return int(recovered or 0)


def claim_due_file_deletions(limit: int | None = None) -> list[ClaimedFileDeletion]:
    configured_limit = settings.FILE_DELETION_BATCH_SIZE if limit is None else limit
    batch_limit = max(0, int(configured_limit))
    if batch_limit <= 0:
        return []

    with SessionLocal() as db:
        recovered = recover_stale_file_deletions(db)
        now = utcnow_aware()
        candidate_ids = [
            row_id
            for (row_id,) in (
                db.query(FileDeletionTask.id)
                .filter(
                    FileDeletionTask.status.in_(
                        [
                            FileDeletionStatus.QUEUED.value,
                            FileDeletionStatus.FAILED.value,
                        ]
                    ),
                    FileDeletionTask.next_retry_at <= now,
                    FileDeletionTask.relative_path.isnot(None),
                )
                .order_by(
                    FileDeletionTask.next_retry_at.asc(),
                    FileDeletionTask.created_at.asc(),
                )
                .limit(batch_limit)
                .all()
            )
        ]
        claimed: list[ClaimedFileDeletion] = []
        for task_id in candidate_ids:
            updated = (
                db.query(FileDeletionTask)
                .filter(
                    FileDeletionTask.id == task_id,
                    FileDeletionTask.status.in_(
                        [
                            FileDeletionStatus.QUEUED.value,
                            FileDeletionStatus.FAILED.value,
                        ]
                    ),
                    FileDeletionTask.next_retry_at <= now,
                )
                .update(
                    {
                        FileDeletionTask.status: FileDeletionStatus.PROCESSING.value,
                        FileDeletionTask.attempts: FileDeletionTask.attempts + 1,
                        FileDeletionTask.last_error: None,
                        FileDeletionTask.updated_at: now,
                    },
                    synchronize_session=False,
                )
            )
            if not updated:
                continue
            db.flush()
            task = (
                db.query(FileDeletionTask)
                .filter(FileDeletionTask.id == task_id)
                .first()
            )
            if task is None or task.relative_path is None:
                continue
            claimed.append(
                ClaimedFileDeletion(
                    id=task.id,
                    storage_root=task.storage_root,
                    relative_path=task.relative_path,
                    attempts=int(task.attempts or 1),
                )
            )
        db.commit()
        if recovered:
            logger.warning("file_deletion_worker_recovered_stale count=%s", recovered)
        return claimed


def compute_file_deletion_backoff(attempts: int) -> datetime:
    attempt_number = max(1, int(attempts or 1))
    delay_seconds = _RETRY_SCHEDULE_SECONDS[
        min(attempt_number - 1, len(_RETRY_SCHEDULE_SECONDS) - 1)
    ]
    return utcnow_aware() + timedelta(seconds=delay_seconds)


def _mark_completed(db: Session, task_id: str) -> None:
    task = db.query(FileDeletionTask).filter(FileDeletionTask.id == task_id).first()
    if task is None:
        return
    now = utcnow_aware()
    task.status = FileDeletionStatus.COMPLETED.value
    task.relative_path = None
    task.last_error = None
    task.completed_at = now
    task.next_retry_at = now
    task.updated_at = now
    db.flush()


def _mark_failed(
    db: Session,
    task_id: str,
    *,
    error_type: str,
    next_retry_at: datetime,
) -> None:
    task = db.query(FileDeletionTask).filter(FileDeletionTask.id == task_id).first()
    if task is None:
        return
    task.status = FileDeletionStatus.FAILED.value
    task.last_error = f"{error_type}: file_deletion_failed"[:255]
    task.next_retry_at = next_retry_at
    task.updated_at = utcnow_aware()
    db.flush()


def process_file_deletions_once(limit: int | None = None) -> dict[str, int]:
    jobs = claim_due_file_deletions(limit=limit)
    stats = {"claimed": len(jobs), "deleted": 0, "retry_scheduled": 0}
    for job in jobs:
        try:
            delete_storage_file(
                storage_root=job.storage_root,
                relative_path=job.relative_path,
            )
        except Exception as exc:
            next_retry_at = compute_file_deletion_backoff(job.attempts)
            with SessionLocal() as db:
                _mark_failed(
                    db,
                    job.id,
                    error_type=type(exc).__name__,
                    next_retry_at=next_retry_at,
                )
                db.commit()
            stats["retry_scheduled"] += 1
            logger.warning(
                "file_deletion_worker_result task_id=%s attempts=%s result=retry error_type=%s",
                job.id,
                job.attempts,
                type(exc).__name__,
            )
            continue

        with SessionLocal() as db:
            _mark_completed(db, job.id)
            db.commit()
        stats["deleted"] += 1
        logger.info(
            "file_deletion_worker_result task_id=%s attempts=%s result=completed",
            job.id,
            job.attempts,
        )
    return stats
