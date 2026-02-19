from __future__ import annotations

import json
from datetime import datetime

from app import audit
from app.db import SessionLocal
from app.services.member_maintenance import expire_and_purge_members


def run_member_maintenance(*, purge_pii: bool = True) -> dict[str, object]:
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        result = expire_and_purge_members(db=db, now=now, purge_pii=purge_pii)
        audit.log_operation(
            db,
            action="auto_expire_members",
            entity_type="member",
            actor_role="system",
            metadata={
                "expired_count": result["expired_count"],
                "purged_count": result["purged_count"],
                "current_year": result["current_year"],
            },
        )
        db.commit()
        return {"ok": True, "ran_at": now.isoformat() + "Z", **result}
    finally:
        db.close()


if __name__ == "__main__":
    print(json.dumps(run_member_maintenance(), ensure_ascii=False))
