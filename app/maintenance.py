from __future__ import annotations

import json
from app.services.member_maintenance import run_annual_membership_maintenance_job_once


def run_member_maintenance(*, purge_pii: bool = True) -> dict[str, object]:
    """Compatibility CLI: catch up overdue terms, never purge member data."""

    return {
        **run_annual_membership_maintenance_job_once(),
        "purge_pii_requested_but_ignored": bool(purge_pii),
    }


if __name__ == "__main__":
    print(json.dumps(run_member_maintenance(), ensure_ascii=False))
