from __future__ import annotations

import logging
from datetime import datetime, timedelta

from app.db import SessionLocal
from app.models import Organization
from app.services.card_inventory import get_remaining_cards, get_remaining_cards_by_org
from app.services.twilio_notifications import (
    execute_low_cards_alert_flow,
    twilio_alerts_are_configured,
)

logger = logging.getLogger(__name__)

LOW_CARDS_THRESHOLD = 50
LOW_CARDS_ALERT_COOLDOWN = timedelta(hours=24)

def run_low_cards_alert_job(
    *,
    db,
    now: datetime | None = None,
    force: bool = False,
) -> dict[str, int | bool | str]:
    current_time = now or datetime.utcnow()
    stats: dict[str, int | bool | str] = {
        "ok": True,
        "ran": True,
        "threshold": LOW_CARDS_THRESHOLD,
        "scanned": 0,
        "eligible": 0,
        "sent": 0,
        "skipped_threshold": 0,
        "skipped_recent": 0,
        "skipped_missing_phone": 0,
        "skipped_not_determinable": 0,
        "errors": 0,
    }

    if not twilio_alerts_are_configured():
        logger.warning("low_cards_alert_job_skipped missing_twilio_alert_config")
        stats["ok"] = False
        stats["ran"] = False
        return stats

    organizations = (
        db.query(Organization)
        .filter(
            Organization.deleted_at.is_(None),
            Organization.is_active.is_(True),
        )
        .order_by(Organization.id.asc())
        .all()
    )

    bulk_remaining: dict[int, int] = {}
    bulk_lookup_failed = False
    if organizations:
        try:
            bulk_remaining = get_remaining_cards_by_org(
                db,
                [org.id for org in organizations],
                now=current_time,
            )
        except Exception:
            bulk_lookup_failed = True
            logger.exception(
                "low_cards_alert_bulk_remaining_failed organizations=%s",
                len(organizations),
            )

    for org in organizations:
        stats["scanned"] += 1
        if bulk_lookup_failed:
            remaining = get_remaining_cards(db, org.id, now=current_time)
        else:
            remaining = bulk_remaining.get(org.id, 0)
        if remaining is None:
            stats["skipped_not_determinable"] += 1
            continue
        if remaining >= LOW_CARDS_THRESHOLD:
            stats["skipped_threshold"] += 1
            continue

        stats["eligible"] += 1
        if (
            not force
            and org.last_low_cards_alert_at is not None
            and org.last_low_cards_alert_at > current_time - LOW_CARDS_ALERT_COOLDOWN
        ):
            stats["skipped_recent"] += 1
            continue

        try:
            execution_sid = execute_low_cards_alert_flow(
                org=org,
                remaining=remaining,
            )
            if not execution_sid:
                logger.info(
                    "low_cards_alert_skipped_unconfigured org_id=%s slug=%s remaining=%s",
                    org.id,
                    org.slug,
                    remaining,
                )
                if not getattr(org, "whatsapp_e164", None):
                    stats["skipped_missing_phone"] += 1
                continue
            org.last_low_cards_alert_at = current_time
            db.add(org)
            db.commit()
            stats["sent"] += 1
            logger.info(
                "low_cards_alert_sent org_id=%s slug=%s remaining=%s execution_sid=%s",
                org.id,
                org.slug,
                remaining,
                execution_sid,
            )
        except Exception as exc:
            db.rollback()
            stats["errors"] += 1
            logger.exception(
                "low_cards_alert_failed org_id=%s slug=%s remaining=%s reason=%s",
                org.id,
                org.slug,
                remaining,
                exc,
            )

    return stats


def run_low_cards_alert_job_once(
    *,
    now: datetime | None = None,
    force: bool = False,
) -> dict[str, int | bool | str]:
    with SessionLocal() as db:
        return run_low_cards_alert_job(db=db, now=now, force=force)
