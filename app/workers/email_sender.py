from __future__ import annotations

import argparse
import logging
import time

from app.config import settings
from app.services.email_outbox import process_outbox_once

logger = logging.getLogger(__name__)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Persistent email outbox worker")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Process one batch and exit.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=settings.EMAIL_OUTBOX_BATCH_SIZE,
        help="Max emails to claim per batch.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    logger.info(
        "email_worker_start once=%s batch_size=%s poll_seconds=%s",
        args.once,
        args.limit,
        settings.EMAIL_OUTBOX_POLL_SECONDS,
    )

    if args.once:
        stats = {"email": process_outbox_once(limit=args.limit)}
        logger.info("email_worker_cycle %s", stats)
        return 0

    while True:
        stats = {"email": process_outbox_once(limit=args.limit)}
        logger.info("email_worker_cycle %s", stats)
        sleep_seconds = max(1, int(settings.EMAIL_OUTBOX_POLL_SECONDS))
        if stats["email"]["claimed"] > 0:
            sleep_seconds = 1
        time.sleep(sleep_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
