from __future__ import annotations

import argparse
import json

from app.services.low_cards_alerts import run_low_cards_alert_job_once


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run low-cards WhatsApp alert job")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ignore the 24h anti-spam cooldown.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    result = run_low_cards_alert_job_once(force=args.force)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
