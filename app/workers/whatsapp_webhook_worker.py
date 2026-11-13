from __future__ import annotations

import argparse
import logging
import time

from app.config import settings
from app.services.whatsapp_webhook_outbox import process_webhook_outbox_once
from app.services.central_communication_whatsapp import process_central_whatsapp_outbox_once

logger = logging.getLogger(__name__)


def _configure_worker_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s:%(name)s:%(message)s",
    )


def _process_cycle(limit: int) -> bool:
    ok = True
    for name, processor in (
        ("webhook", process_webhook_outbox_once),
        ("central_communication", process_central_whatsapp_outbox_once),
    ):
        try:
            # Each outbound request can take ten seconds. Keep this shared
            # worker responsive to incoming webhook events during an outage.
            batch_limit = min(limit, 5) if name == "central_communication" else limit
            stats = processor(limit=batch_limit)
            logger.info("whatsapp_worker_cycle queue=%s stats=%s", name, stats)
        except Exception as exc:
            ok = False
            # Provider/database exceptions can contain recipient data.
            logger.error("whatsapp_worker_cycle_failed queue=%s type=%s", name, type(exc).__name__)
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description="Persistent WhatsApp webhook and central notification worker")
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
        return 0 if _process_cycle(args.limit) else 1

    while True:
        _process_cycle(args.limit)
        sleep_seconds = max(1, int(args.poll_seconds or 1))
        time.sleep(sleep_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
