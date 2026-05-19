from __future__ import annotations

import argparse
import logging
import time

from app.config import settings
from app.services.whatsapp_webhook_outbox import process_webhook_outbox_once

logger = logging.getLogger(__name__)


def _configure_worker_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s:%(name)s:%(message)s",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Persistent WhatsApp Evolution webhook worker")
    parser.add_argument("--once", action="store_true", help="Process one batch and exit")
    parser.add_argument("--limit", type=int, default=settings.WHATSAPP_WEBHOOK_BATCH_SIZE)
    parser.add_argument("--poll-seconds", type=int, default=settings.WHATSAPP_WEBHOOK_POLL_SECONDS)
    args = parser.parse_args()

    _configure_worker_logging()
    logger.info(
        "whatsapp_webhook_worker_start once=%s batch_size=%s poll_seconds=%s",
        args.once,
        args.limit,
        args.poll_seconds,
    )

    if args.once:
        stats = process_webhook_outbox_once(limit=args.limit)
        logger.info("whatsapp_webhook_worker_cycle %s", stats)
        return 0

    while True:
        stats = process_webhook_outbox_once(limit=args.limit)
        logger.info("whatsapp_webhook_worker_cycle %s", stats)
        sleep_seconds = max(1, int(args.poll_seconds or 1))
        time.sleep(sleep_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
