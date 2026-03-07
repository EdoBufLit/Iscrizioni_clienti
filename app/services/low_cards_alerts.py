from __future__ import annotations

import logging
from datetime import datetime

from app.db import SessionLocal
from app.models import Organization
from app.services.card_inventory import (
    compute_org_card_stock,
    get_remaining_cards,
    get_remaining_cards_by_org,
    get_total_cards_by_org,
)
from app.services.org_admin_notifications import notify_org_admins_low_cards
from app.services.twilio_notifications import (
    execute_low_cards_alert_flow,
    twilio_alerts_are_configured,
)

logger = logging.getLogger(__name__)

LOW_CARDS_THRESHOLD = 50

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
        "emails_queued": 0,
        "notifications_created": 0,
        "twilio_sent": 0,
        "skipped_threshold": 0,
        "skipped_recent": 0,
        "skipped_never_reached_threshold": 0,
        "skipped_missing_phone": 0,
        "skipped_missing_admins": 0,
        "skipped_not_determinable": 0,
        "errors": 0,
    }
    logger.info(
        "low_cards_alert_job_start force=%s threshold=%s now=%s",
        force,
        LOW_CARDS_THRESHOLD,
        current_time.isoformat(),
    )

    twilio_enabled = twilio_alerts_are_configured()
    if not twilio_enabled:
        logger.info("low_cards_alert_job_twilio_disabled notifications_and_email_only")

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
    bulk_total_capacity: dict[int, int] = {}
    bulk_lookup_failed = False
    if organizations:
        try:
            bulk_remaining = get_remaining_cards_by_org(
                db,
                [org.id for org in organizations],
                now=current_time,
            )
            bulk_total_capacity = get_total_cards_by_org(
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
            stock = compute_org_card_stock(db, org.id, now=current_time)
            remaining = stock.get("remaining")
            total_capacity = int(stock.get("total", 0) or 0)
        else:
            remaining = bulk_remaining.get(org.id, 0)
            total_capacity = bulk_total_capacity.get(org.id, 0)
        if remaining is None:
            stats["skipped_not_determinable"] += 1
            continue
        if remaining >= LOW_CARDS_THRESHOLD:
            if org.last_low_cards_alert_at is not None:
                org.last_low_cards_alert_at = None
                db.add(org)
                db.commit()
            stats["skipped_threshold"] += 1
            continue

        if total_capacity < LOW_CARDS_THRESHOLD:
            stats["skipped_never_reached_threshold"] += 1
            logger.info(
                "low_cards_alert_skipped_never_reached_threshold org_id=%s slug=%s remaining=%s total_capacity=%s",
                org.id,
                org.slug,
                remaining,
                total_capacity,
            )
            continue

        stats["eligible"] += 1
        logger.info(
            "low_cards_alert_candidate org_id=%s slug=%s remaining=%s total_capacity=%s force=%s",
            org.id,
            org.slug,
            remaining,
            total_capacity,
            force,
        )
        if not force and org.last_low_cards_alert_at is not None:
            stats["skipped_recent"] += 1
            continue

        try:
            execution_sid = None
            if twilio_enabled:
                execution_sid = execute_low_cards_alert_flow(
                    org=org,
                    remaining=remaining,
                )
                if execution_sid:
                    stats["twilio_sent"] += 1
                elif not getattr(org, "whatsapp_e164", None):
                    stats["skipped_missing_phone"] += 1

            notification_result = notify_org_admins_low_cards(
                db,
                organization=org,
                remaining=remaining,
                now=current_time,
            )
            notifications_created = int(
                notification_result.get("notifications_created", 0)
            )
            emails_queued = int(notification_result.get("emails_queued", 0))
            stats["notifications_created"] += notifications_created
            stats["emails_queued"] += emails_queued

            if not execution_sid and notifications_created == 0 and emails_queued == 0:
                stats["skipped_missing_admins"] += 1
                logger.info(
                    "low_cards_alert_skipped_unconfigured org_id=%s slug=%s remaining=%s",
                    org.id,
                    org.slug,
                    remaining,
                )
                continue

            org.last_low_cards_alert_at = current_time
            db.add(org)
            db.commit()
            stats["sent"] += 1
            logger.info(
                "low_cards_alert_sent org_id=%s slug=%s remaining=%s execution_sid=%s notifications=%s emails=%s",
                org.id,
                org.slug,
                remaining,
                execution_sid,
                notifications_created,
                emails_queued,
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

    logger.info("low_cards_alert_job_done %s", stats)
    return stats


def run_low_cards_alert_job_once(
    *,
    now: datetime | None = None,
    force: bool = False,
) -> dict[str, int | bool | str]:
    with SessionLocal() as db:
        return run_low_cards_alert_job(db=db, now=now, force=force)
