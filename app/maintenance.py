from __future__ import annotations

import json
from app.services.member_maintenance import run_annual_membership_maintenance_job_once, run_card_lot_closure_job_once


def run_member_maintenance(*, purge_pii: bool = True) -> dict[str, object]:
    """Compatibility CLI: close old lots and terms, never purge member data."""

    lot_result = run_card_lot_closure_job_once()
    annual_result = run_annual_membership_maintenance_job_once()
    return {
        **annual_result,
        "ok": bool(lot_result["ok"] and annual_result["ok"]),
        "card_lot_closure": lot_result,
        "purge_pii_requested_but_ignored": bool(purge_pii),
    }


if __name__ == "__main__":
    print(json.dumps(run_member_maintenance(), ensure_ascii=False))
