from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models_affiliation import (
    AffiliationApplication,
    AffiliationVideoMode,
    VideoJob,
    VideoJobStatus,
)

logger = logging.getLogger(__name__)


_RENDER_SCRIPT_RELATIVE = Path("dist") / "renderHud.cjs"


class VideoJobsTableMissingError(RuntimeError):
    """Raised when the video_jobs table is not available yet."""


def _normalize_mode(mode: str) -> str:
    normalized = (mode or "").strip().lower()
    if normalized in {
        AffiliationVideoMode.REVIEW.value,
        AffiliationVideoMode.PAYMENT_PENDING.value,
        AffiliationVideoMode.APPROVED.value,
    }:
        return normalized
    return AffiliationVideoMode.REVIEW.value


def enqueue_affiliation_video_job(
    db: Session,
    *,
    application_id: int,
    mode: str,
    payload: dict[str, Any] | None = None,
) -> VideoJob:
    job = VideoJob(
        application_id=application_id,
        mode=_normalize_mode(mode),
        status=VideoJobStatus.QUEUED.value,
        payload_json=payload or {},
    )
    db.add(job)
    db.flush()
    return job


def video_job_output_url(job: VideoJob | None) -> str | None:
    if not job or not job.output_rel_path:
        return None
    rel = str(job.output_rel_path).replace("\\", "/").lstrip("/")
    if rel.startswith("affiliation-videos/"):
        return f"/uploads/{rel}"
    return f"/generated-videos/{rel}"


def serialize_video_job(job: VideoJob | None) -> dict[str, Any] | None:
    if job is None:
        return None
    return {
        "id": job.id,
        "application_id": job.application_id,
        "mode": job.mode,
        "status": job.status,
        "provider": job.provider,
        "output_url": video_job_output_url(job),
        "error_text": job.error_text,
        "requested_at": job.requested_at.isoformat() if job.requested_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


def _ensure_renderer_build(renderer_dir: Path) -> Path:
    render_script = renderer_dir / _RENDER_SCRIPT_RELATIVE
    if render_script.exists():
        return render_script

    npm_binary = "npm.cmd" if os.name == "nt" else "npm"
    logger.info("affiliation_video_build start renderer_dir=%s", renderer_dir)
    subprocess.run(
        [npm_binary, "run", "build"],
        cwd=str(renderer_dir),
        check=True,
        capture_output=True,
        text=True,
    )

    if not render_script.exists():
        raise RuntimeError("Renderer build completed but dist/renderHud.cjs is missing.")
    return render_script


def _resolve_frontend_base() -> str:
    configured = (settings.FRONTEND_URL or "").strip().rstrip("/")
    if configured:
        return configured
    return (settings.BASE_URL or "").strip().rstrip("/")


def _build_logo_url(application: AffiliationApplication) -> str:
    frontend_base = _resolve_frontend_base()
    # Reuse website logo as default when no dedicated organization logo exists yet.
    if frontend_base:
        return f"{frontend_base}/logo-transparent.png"
    return ""


def _target_video_path(application_id: int) -> tuple[str, Path]:
    file_name = f"{application_id}.mp4"
    relative = os.path.join("welcome", file_name)
    absolute = Path(settings.AFFILIATION_VIDEO_OUTPUT_DIR) / file_name
    absolute.parent.mkdir(parents=True, exist_ok=True)
    return relative.replace("\\", "/"), absolute


def _extract_json_line(stdout: str) -> dict[str, Any]:
    lines = [line.strip() for line in (stdout or "").splitlines() if line.strip()]
    for line in reversed(lines):
        if not line.startswith("{"):
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    raise RuntimeError("Renderer output did not include a JSON payload.")


def _render_job(db: Session, job: VideoJob) -> None:
    application = (
        db.query(AffiliationApplication)
        .filter(AffiliationApplication.id == job.application_id)
        .first()
    )
    if application is None:
        job.status = VideoJobStatus.FAILED.value
        job.error_text = "Application not found"
        job.finished_at = datetime.utcnow()
        return

    renderer_dir = Path(settings.AFFILIATION_VIDEO_RENDERER_DIR)
    if not renderer_dir.exists():
        raise RuntimeError(
            f"Renderer directory not found: {settings.AFFILIATION_VIDEO_RENDERER_DIR}"
        )

    render_script = _ensure_renderer_build(renderer_dir)
    org_name = (
        (application.organization_name or "").strip()
        or (application.organization_legal_name or "").strip()
        or f"Applicazione #{application.id}"
    )
    logo_url = _build_logo_url(application)
    relative_path, absolute_path = _target_video_path(application.id)

    if absolute_path.exists():
        job.status = VideoJobStatus.DONE.value
        job.output_rel_path = relative_path
        job.error_text = None
        job.finished_at = datetime.utcnow()
        return

    command = [
        "node",
        str(render_script),
        "--orgId",
        str(application.id),
        "--orgName",
        org_name,
        "--mode",
        _normalize_mode(job.mode),
        "--template",
        "personalized",
        "--output",
        str(absolute_path),
    ]
    if logo_url:
        command.extend(["--logoUrl", logo_url])

    result = subprocess.run(
        command,
        cwd=str(renderer_dir),
        check=True,
        capture_output=True,
        text=True,
    )
    payload = _extract_json_line(result.stdout)
    source_path = Path(str(payload.get("path") or "").strip())
    if not source_path.exists():
        raise RuntimeError(f"Rendered video not found: {source_path}")

    if source_path.resolve() != absolute_path.resolve():
        shutil.copyfile(source_path, absolute_path)

    job.status = VideoJobStatus.DONE.value
    job.output_rel_path = relative_path
    job.error_text = None
    job.finished_at = datetime.utcnow()


def _error_mentions_missing_video_jobs_table(exc: Exception) -> bool:
    message = str(exc).lower()
    if "video_jobs" not in message:
        return False
    return (
        "undefinedtable" in message
        or "does not exist" in message
        or "no such table" in message
    )


def _claim_jobs_for_processing(db: Session, batch_limit: int) -> list[VideoJob]:
    claimed_ids: list[int] = []
    bind = db.get_bind()
    dialect_name = (bind.dialect.name or "").lower() if bind is not None else ""

    try:
        for _ in range(batch_limit):
            query = (
                db.query(VideoJob)
                .filter(VideoJob.status == VideoJobStatus.QUEUED.value)
                .order_by(VideoJob.requested_at.asc(), VideoJob.id.asc())
            )
            if dialect_name != "sqlite":
                query = query.with_for_update(skip_locked=True)

            job = query.first()
            if job is None:
                break

            job.status = VideoJobStatus.PROCESSING.value
            job.started_at = datetime.utcnow()
            job.finished_at = None
            job.error_text = None
            db.flush()
            if job.id is not None:
                claimed_ids.append(int(job.id))

        db.commit()
    except (ProgrammingError, OperationalError) as exc:
        db.rollback()
        if _error_mentions_missing_video_jobs_table(exc):
            raise VideoJobsTableMissingError(
                "video_jobs table missing — run alembic upgrade head"
            ) from exc
        raise

    if not claimed_ids:
        return []

    return (
        db.query(VideoJob)
        .filter(VideoJob.id.in_(claimed_ids))
        .order_by(VideoJob.requested_at.asc(), VideoJob.id.asc())
        .all()
    )


def process_video_jobs_once(limit: int | None = None) -> dict[str, int]:
    batch_limit = max(1, int(limit or 1))
    stats = {"claimed": 0, "done": 0, "failed": 0}

    with SessionLocal() as db:
        jobs = _claim_jobs_for_processing(db, batch_limit)
        stats["claimed"] = len(jobs)

        for job in jobs:
            try:
                _render_job(db, job)
                db.commit()
                stats["done"] += 1
                logger.info(
                    "affiliation_video_job_done job_id=%s application_id=%s mode=%s",
                    job.id,
                    job.application_id,
                    job.mode,
                )
            except Exception as exc:
                db.rollback()
                failed_job = db.query(VideoJob).filter(VideoJob.id == job.id).first()
                if failed_job is not None:
                    failed_job.status = VideoJobStatus.FAILED.value
                    failed_job.error_text = str(exc)
                    failed_job.finished_at = datetime.utcnow()
                    db.commit()
                stats["failed"] += 1
                logger.exception(
                    "affiliation_video_job_failed job_id=%s application_id=%s",
                    job.id,
                    job.application_id,
                )

    return stats
