from __future__ import annotations

import argparse
import logging
import os
import shutil
import time
from pathlib import Path

from sqlalchemy import text

from app.config import settings
from app.db import SessionLocal

logger = logging.getLogger(__name__)
# Container-local readiness marker only; it never stores user data.
READY_MARKER_PATH = Path(
    os.getenv("AFFILIATION_VIDEO_READY_MARKER", "/tmp/worker.ready")
).resolve()  # nosec B108


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _has_env(name: str) -> bool:
    return bool((os.getenv(name) or "").strip())


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw.strip())
    except ValueError:
        return default


def _log_startup(args: argparse.Namespace, worker_enabled: bool) -> None:
    voice_id_present = _has_env("ELEVENLABS_VOICE_ID") or _has_env("ELEVENLABS_VOICE_IDS")
    model_present = _has_env("ELEVENLABS_MODEL") or _has_env("ELEVENLABS_MODEL_ID")
    logger.info(
        (
            "affiliation_video_worker_boot "
            "git_sha=%s build_time=%s poll_seconds=%s limit=%s "
            "affiliazione_enabled=%s video_enabled=%s worker_enabled=%s "
            "env_database_url=%s env_elevenlabs_api_key=%s "
            "env_elevenlabs_voice_id=%s env_elevenlabs_model=%s ffmpeg_in_path=%s"
        ),
        (settings.GIT_SHA or "n/a"),
        (settings.BUILD_TIME or "n/a"),
        args.poll_seconds,
        args.limit,
        bool(settings.AFFILIAZIONE_ENABLED),
        bool(settings.AFFILIATION_VIDEO_ENABLED),
        worker_enabled,
        _has_env("DATABASE_URL"),
        _has_env("ELEVENLABS_API_KEY"),
        voice_id_present,
        model_present,
        bool(shutil.which("ffmpeg")),
    )


def _write_ready_marker() -> None:
    READY_MARKER_PATH.parent.mkdir(parents=True, exist_ok=True)
    READY_MARKER_PATH.write_text("ready\n", encoding="utf-8")
    logger.info("affiliation_video_worker_ready marker=%s", READY_MARKER_PATH)


def _remove_ready_marker() -> None:
    try:
        READY_MARKER_PATH.unlink(missing_ok=True)
    except Exception:
        logger.exception("Unable to remove worker ready marker.")


def _idle_disabled(reason: str, poll_seconds: int, once: bool) -> int:
    logger.error("affiliation_video_worker_disabled %s", reason)
    if once:
        return 0
    sleep_seconds = max(10, poll_seconds)
    while True:
        time.sleep(sleep_seconds)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Affiliation video render worker")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Process one batch and exit.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=1,
        help="Max queued jobs per cycle.",
    )
    parser.add_argument(
        "--poll-seconds",
        type=int,
        default=max(1, _env_int("AFFILIATION_VIDEO_POLL_SECONDS", 5)),
        help="Polling interval while running continuously.",
    )
    return parser.parse_args()


def main() -> int:
    if not logging.getLogger().handlers:
        logging.basicConfig(
            level=os.getenv("LOG_LEVEL", "INFO"),
            format="%(asctime)s %(levelname)s %(name)s %(message)s",
        )

    args = _parse_args()
    _remove_ready_marker()

    worker_enabled = _env_bool("AFFILIATION_VIDEO_WORKER_ENABLED", default=False)
    _log_startup(args, worker_enabled)

    if not worker_enabled:
        logger.info(
            "affiliation_video_worker_disabled AFFILIATION_VIDEO_WORKER_ENABLED=false; exiting."
        )
        return 0

    if not settings.AFFILIATION_VIDEO_ENABLED:
        return _idle_disabled(
            "AFFILIATION_VIDEO_ENABLED=false",
            args.poll_seconds,
            args.once,
        )

    if not _has_env("DATABASE_URL"):
        return _idle_disabled(
            "DATABASE_URL missing while video worker is enabled",
            args.poll_seconds,
            args.once,
        )

    if not shutil.which("ffmpeg"):
        return _idle_disabled(
            "ffmpeg not available in PATH",
            args.poll_seconds,
            args.once,
        )

    renderer_dir = Path(settings.AFFILIATION_VIDEO_RENDERER_DIR)
    if not renderer_dir.exists():
        return _idle_disabled(
            (
                "AFFILIATION_VIDEO_RENDERER_DIR not found "
                f"({settings.AFFILIATION_VIDEO_RENDERER_DIR})"
            ),
            args.poll_seconds,
            args.once,
        )

    with SessionLocal() as db:
        db.execute(text("SELECT 1"))

    try:
        from app.services.affiliation_video import (
            VideoJobsTableMissingError,
            process_video_jobs_once,
        )
    except Exception as exc:
        raise RuntimeError(
            "Unable to import app.services.affiliation_video. "
            "Check image contents and optional affiliation modules."
        ) from exc

    _write_ready_marker()

    if args.once:
        try:
            stats = process_video_jobs_once(limit=args.limit)
            logger.info("affiliation_video_worker_cycle %s", stats)
        except VideoJobsTableMissingError as exc:
            logger.error(str(exc))
            time.sleep(max(10, args.poll_seconds))
        return 0

    try:
        while True:
            stats = {"claimed": 0}
            try:
                stats = process_video_jobs_once(limit=args.limit)
                logger.info("affiliation_video_worker_cycle %s", stats)
            except VideoJobsTableMissingError as exc:
                logger.error(str(exc))
                sleep_seconds = max(10, args.poll_seconds)
                time.sleep(sleep_seconds)
                continue
            except Exception:
                logger.exception("affiliation_video_worker_cycle_failed")
            sleep_seconds = 1 if stats.get("claimed", 0) > 0 else max(1, args.poll_seconds)
            time.sleep(sleep_seconds)
    except KeyboardInterrupt:
        logger.info("affiliation_video_worker_stopped")
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        logger.error("affiliation_video_worker_config_error: %s", exc)
        raise SystemExit(1) from exc
