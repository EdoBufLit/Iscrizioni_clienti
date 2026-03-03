from __future__ import annotations

import argparse
import logging
import sys
import time

from app.config import settings
from app.services.low_cards_alerts import run_low_cards_alert_job_once

logger = logging.getLogger(__name__)


def _configure_worker_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        stream=sys.stdout,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        force=True,
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Persistent low-cards WhatsApp alert worker")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run one low-cards scan and exit.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ignore the 24h anti-spam cooldown.",
    )
    return parser.parse_args()


def _run_low_cards_alerts_safely(*, force: bool) -> dict[str, object]:
    try:
        return run_low_cards_alert_job_once(force=force)
    except Exception as exc:
        logger.exception("low_cards_alert_job_unhandled_failure")
        return {
            "ok": False,
            "ran": False,
            "errors": 1,
            "error": str(exc) or exc.__class__.__name__,
        }


def main() -> int:
    _configure_worker_logging()
    args = _parse_args()
    interval_seconds = max(30, int(settings.LOW_CARDS_ALERT_JOB_INTERVAL_SECONDS))
    logger.info(
        "low_cards_worker_start once=%s interval_seconds=%s force=%s",
        args.once,
        interval_seconds,
        args.force,
    )

    if args.once:
        result = _run_low_cards_alerts_safely(force=args.force)
        logger.info("low_cards_worker_cycle %s", result)
        return 0

    while True:
        result = _run_low_cards_alerts_safely(force=args.force)
        logger.info("low_cards_worker_cycle %s", result)
        time.sleep(interval_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
