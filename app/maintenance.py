from __future__ import annotations

import json
from datetime import datetime

from app import audit
from app.db import SessionLocal
from app.services.member_maintenance import deactivate_expired_annual_memberships


def run_member_maintenance(*, purge_pii: bool = True) -> dict[str, object]:
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        result = deactivate_expired_annual_memberships(db=db, now=now)
        audit.log_operation(
            db,
            action="annual_cards_deactivated",
            entity_type="annual_membership_term",
            actor_role="system",
            metadata={
                "membership_year": result["membership_year"],
                "valid_through": result["valid_through"],
                "deactivated_count": result["deactivated_count"],
                "destructive_purge_disabled": True,
            },
        )
        db.commit()
        return {
            "ok": True,
            "ran_at": now.isoformat() + "Z",
            "purged_count": 0,
            "destructive_purge_disabled": True,
            **result,
        }
    finally:
        db.close()


if __name__ == "__main__":
    print(json.dumps(run_member_maintenance(), ensure_ascii=False))
