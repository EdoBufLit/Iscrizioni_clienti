"""Asynchronous delivery of Google Wallet updates."""
import argparse
import logging
from pathlib import Path
import tempfile
import time

from app.services.google_wallet_sync import process_wallet_sync_once

logger = logging.getLogger(__name__)
HEARTBEAT_PATH = Path(tempfile.gettempdir()) / "google-wallet-sync-worker.ready"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--healthcheck", action="store_true")
    parser.add_argument("--limit", type=int, default=25)
    args = parser.parse_args()
    if args.healthcheck:
        return 0 if HEARTBEAT_PATH.exists() and time.time() - HEARTBEAT_PATH.stat().st_mtime < 180 else 1
    if args.limit < 1:
        parser.error("--limit must be positive")
    from app.db import engine
    from init_db import _deployed_schema_mode, _validate_deployed_alembic_revision
    if _deployed_schema_mode():
        _validate_deployed_alembic_revision(engine)
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            result = process_wallet_sync_once(limit=args.limit, heartbeat=HEARTBEAT_PATH.touch)
            HEARTBEAT_PATH.touch()
            if result["claimed"]:
                logger.info("wallet_sync_cycle %s", result)
            if args.once:
                return 1 if result["failed"] else 0
        except Exception as exc:
            logger.error("wallet_sync_cycle_failed error_type=%s", type(exc).__name__)
            if args.once:
                return 1
        time.sleep(5)


if __name__ == "__main__":
    raise SystemExit(main())
