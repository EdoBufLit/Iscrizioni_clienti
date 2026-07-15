from __future__ import annotations

import argparse
import logging
import time

from app.config import settings
from app.services.file_deletion import process_file_deletions_once

logger = logging.getLogger(__name__)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Persistent file deletion outbox worker")
    parser.add_argument("--once", action="store_true", help="Process one batch and exit.")
    parser.add_argument(
        "--limit",
        type=int,
        default=settings.FILE_DELETION_BATCH_SIZE,
        help="Maximum deletion intents to claim per batch.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    logger.info(
        "file_deletion_worker_start once=%s batch_size=%s poll_seconds=%s",
        args.once,
        args.limit,
        settings.FILE_DELETION_POLL_SECONDS,
    )
    if args.once:
        logger.info("file_deletion_worker_cycle %s", process_file_deletions_once(args.limit))
        return 0

    while True:
        stats = process_file_deletions_once(args.limit)
        logger.info("file_deletion_worker_cycle %s", stats)
        sleep_seconds = 1 if stats["claimed"] else max(
            1, int(settings.FILE_DELETION_POLL_SECONDS)
        )
        time.sleep(sleep_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
