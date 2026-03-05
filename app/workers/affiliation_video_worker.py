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
READY_MARKER_PATH = Path("/tmp/worker.ready")


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _has_env(name: str) -> bool:
    return bool((os.getenv(name) or "").strip())


def _log_startup(args: argparse.Namespace, worker_enabled: bool) -> None:
    voice_id_present = _has_env("ELEVENLABS_VOICE_ID") or _has_env("ELEVENLABS_VOICE_IDS")
    model_present = _has_env("ELEVENLABS_MODEL") or _has_env("ELEVENLABS_MODEL_ID")
    logger.info(
        (
            "affiliation_video_worker_boot "
            "git_sha=%s build_time=%s poll_seconds=%s limit=%s "
            "affiliazione_enabled=%s worker_enabled=%s "
            "env_database_url=%s env_elevenlabs_api_key=%s "
            "env_elevenlabs_voice_id=%s env_elevenlabs_model=%s ffmpeg_in_path=%s"
        ),
        (settings.GIT_SHA or "n/a"),
        (settings.BUILD_TIME or "n/a"),
        args.poll_seconds,
        args.limit,
        bool(settings.AFFILIAZIONE_ENABLED),
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
        default=15,
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

    if not _has_env("DATABASE_URL"):
        raise RuntimeError(
            "DATABASE_URL is required when AFFILIATION_VIDEO_WORKER_ENABLED=true."
        )

    with SessionLocal() as db:
        db.execute(text("SELECT 1"))

    try:
        from app.services.affiliation_video import process_video_jobs_once
    except Exception as exc:
        raise RuntimeError(
            "Unable to import app.services.affiliation_video. "
            "Check image contents and optional affiliation modules."
        ) from exc

    _write_ready_marker()

    if args.once:
        stats = process_video_jobs_once(limit=args.limit)
        logger.info("affiliation_video_worker_cycle %s", stats)
        return 0

    try:
        while True:
            stats = {"claimed": 0}
            try:
                stats = process_video_jobs_once(limit=args.limit)
                logger.info("affiliation_video_worker_cycle %s", stats)
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
