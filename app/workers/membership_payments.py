"""Reconcile card reservations against authoritative payment-provider state."""

from __future__ import annotations

import argparse
import logging
from pathlib import Path
import sys
import tempfile
import time

from app.config import settings


logger = logging.getLogger(__name__)
HEARTBEAT_PATH = Path(tempfile.gettempdir()) / "membership-payments-worker.ready"


def _validate_schema() -> None:
    from app.db import engine
    from init_db import _deployed_schema_mode, _validate_deployed_alembic_revision

    if _deployed_schema_mode():
        _validate_deployed_alembic_revision(engine)


def _reconcile_once(*, limit: int):
    from app.services.card_reservations import reconcile_membership_payments_once

    return reconcile_membership_payments_once(limit=limit, heartbeat=HEARTBEAT_PATH.touch)


def _run_once(*, limit: int) -> bool:
    try:
        result = _reconcile_once(limit=limit)
        logger.info("membership_payments_worker_cycle %s", result)
        HEARTBEAT_PATH.touch()
        if result.get("errors"):
            logger.warning("membership_payments_worker_cycle_errors count=%s", result["errors"])
            return False
        return True
    except Exception as exc:
        # Provider exceptions can contain request URLs or credentials. Record
        # only the class here; item-level details belong to the service logger.
        logger.error("membership_payments_worker_cycle_failed error_type=%s", type(exc).__name__)
        return False


def _healthcheck(*, interval_seconds: int) -> int:
    try:
        age = time.time() - HEARTBEAT_PATH.stat().st_mtime
        return 0 if age <= max(180, interval_seconds * 3) else 1
    except OSError:
        return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true", help="Reconcile one batch and exit.")
    parser.add_argument("--limit", type=int, default=50, help="Maximum payments per cycle.")
    parser.add_argument("--healthcheck", action="store_true", help="Check the last reconciliation progress.")
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be positive")
    interval_seconds = max(1, int(settings.MEMBERSHIP_PAYMENT_RECONCILE_INTERVAL_SECONDS))
    if args.healthcheck:
        return _healthcheck(interval_seconds=interval_seconds)

    logging.basicConfig(
        level=logging.INFO, stream=sys.stdout,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    _validate_schema()
    HEARTBEAT_PATH.unlink(missing_ok=True)
    logger.info(
        "membership_payments_worker_start once=%s limit=%s interval_seconds=%s",
        args.once, args.limit, interval_seconds,
    )
    while True:
        succeeded = _run_once(limit=args.limit)
        if args.once:
            return 0 if succeeded else 1
        time.sleep(interval_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
