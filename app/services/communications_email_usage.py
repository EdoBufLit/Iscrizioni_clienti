from __future__ import annotations

import html
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import EmailCampaignRecipient, EmailOutbox, Organization
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload

COMMUNICATIONS_MONTHLY_EMAIL_LIMIT = 5000
COMMUNICATIONS_EXTRA_EMAIL_COST_CENTS = 1
MONTHLY_OVERAGE_REPORT_EMAIL_TYPE = "communications_monthly_overage_report"

_ITALIAN_MONTHS = {
    1: "Gennaio",
    2: "Febbraio",
    3: "Marzo",
    4: "Aprile",
    5: "Maggio",
    6: "Giugno",
    7: "Luglio",
    8: "Agosto",
    9: "Settembre",
    10: "Ottobre",
    11: "Novembre",
    12: "Dicembre",
}


def _month_start(value: datetime | date) -> datetime:
    return datetime(int(value.year), int(value.month), 1)


def _next_month_start(value: datetime) -> datetime:
    if value.month == 12:
        return datetime(value.year + 1, 1, 1)
    return datetime(value.year, value.month + 1, 1)


def current_month_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    start = _month_start(now or datetime.utcnow())
    return start, _next_month_start(start)


def previous_month_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    current_start = _month_start(now or datetime.utcnow())
    if current_start.month == 1:
        previous_start = datetime(current_start.year - 1, 12, 1)
    else:
        previous_start = datetime(current_start.year, current_start.month - 1, 1)
    return previous_start, current_start


def format_period_label(period_start: datetime) -> str:
    month_name = _ITALIAN_MONTHS.get(period_start.month, f"Mese {period_start.month}")
    return f"{month_name} {period_start.year}"


def _money_eur_from_cents(cents: int) -> str:
    amount = Decimal(int(cents)) / Decimal(100)
    return f"{amount:.2f} EUR"


def calculate_org_monthly_email_usage(
    db: Session,
    *,
    org_id: int,
    period_start: datetime | None = None,
    period_end: datetime | None = None,
) -> dict[str, Any]:
    start, end = (
        (period_start, period_end)
        if period_start is not None and period_end is not None
        else current_month_bounds()
    )
    if start is None or end is None:
        start, end = current_month_bounds()

    used = (
        db.query(func.count(EmailCampaignRecipient.id))
        .filter(
            EmailCampaignRecipient.association_id == int(org_id),
            EmailCampaignRecipient.sent_at.isnot(None),
            EmailCampaignRecipient.sent_at >= start,
            EmailCampaignRecipient.sent_at < end,
        )
        .scalar()
        or 0
    )
    used_count = int(used)
    extra_count = max(0, used_count - COMMUNICATIONS_MONTHLY_EMAIL_LIMIT)
    extra_cost_cents = extra_count * COMMUNICATIONS_EXTRA_EMAIL_COST_CENTS
    return {
        "period_start": start.date().isoformat(),
        "period_end": end.date().isoformat(),
        "period_label": format_period_label(start),
        "included_limit": COMMUNICATIONS_MONTHLY_EMAIL_LIMIT,
        "used": used_count,
        "extra": extra_count,
        "extra_cost_cents": extra_cost_cents,
        "extra_cost_eur": extra_cost_cents / 100,
        "unit_extra_cost_cents": COMMUNICATIONS_EXTRA_EMAIL_COST_CENTS,
    }


def _active_communications_orgs(db: Session) -> list[Organization]:
    return (
        db.query(Organization)
        .filter(
            Organization.communications_enabled.is_(True),
            Organization.deleted_at.is_(None),
            Organization.is_active.is_(True),
        )
        .order_by(Organization.name.asc(), Organization.id.asc())
        .all()
    )


def build_monthly_overage_report(
    db: Session,
    *,
    period_start: datetime,
    period_end: datetime,
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    total_used = 0
    total_extra = 0
    total_cost_cents = 0

    for org in _active_communications_orgs(db):
        usage = calculate_org_monthly_email_usage(
            db,
            org_id=int(org.id),
            period_start=period_start,
            period_end=period_end,
        )
        row = {
            "org_id": int(org.id),
            "org_name": org.name or f"Org #{org.id}",
            "org_slug": org.slug,
            **usage,
        }
        rows.append(row)
        total_used += int(usage["used"])
        total_extra += int(usage["extra"])
        total_cost_cents += int(usage["extra_cost_cents"])

    return {
        "period_start": period_start.date().isoformat(),
        "period_end": period_end.date().isoformat(),
        "period_label": format_period_label(period_start),
        "included_limit": COMMUNICATIONS_MONTHLY_EMAIL_LIMIT,
        "unit_extra_cost_cents": COMMUNICATIONS_EXTRA_EMAIL_COST_CENTS,
        "rows": rows,
        "totals": {
            "used": total_used,
            "extra": total_extra,
            "extra_cost_cents": total_cost_cents,
            "extra_cost_eur": total_cost_cents / 100,
        },
    }


def _render_report_bodies(report: dict[str, Any]) -> tuple[str, str]:
    period_label = str(report["period_label"])
    rows = list(report.get("rows") or [])
    totals = dict(report.get("totals") or {})
    lines = [
        f"Report mensile email aggiuntive Comunicazioni - {period_label}",
        "",
        f"Limite incluso per organizzazione: {COMMUNICATIONS_MONTHLY_EMAIL_LIMIT} email/mese.",
        "Costo email aggiuntive: 0,01 EUR per ogni email oltre limite.",
        "",
    ]
    html_rows = []

    if rows:
        for row in rows:
            cost_label = _money_eur_from_cents(int(row["extra_cost_cents"]))
            lines.append(
                f"- {row['org_name']}: usate {row['used']}, extra {row['extra']}, da pagare {cost_label}"
            )
            html_rows.append(
                "<tr>"
                f"<td>{html.escape(str(row['org_name']))}</td>"
                f"<td style=\"text-align:right\">{int(row['used'])}</td>"
                f"<td style=\"text-align:right\">{int(row['included_limit'])}</td>"
                f"<td style=\"text-align:right\">{int(row['extra'])}</td>"
                f"<td style=\"text-align:right\">{html.escape(cost_label)}</td>"
                "</tr>"
            )
    else:
        lines.append("- Nessuna organizzazione con modulo Comunicazioni attivo nel periodo.")
        html_rows.append(
            "<tr><td colspan=\"5\">Nessuna organizzazione con modulo Comunicazioni attivo nel periodo.</td></tr>"
        )

    total_cost_label = _money_eur_from_cents(int(totals.get("extra_cost_cents") or 0))
    lines.extend(
        [
            "",
            f"Totale email usate: {int(totals.get('used') or 0)}",
            f"Totale email extra: {int(totals.get('extra') or 0)}",
            f"Totale da pagare: {total_cost_label}",
        ]
    )

    html_body = (
        f"<h2>Report mensile email aggiuntive Comunicazioni - {html.escape(period_label)}</h2>"
        f"<p>Limite incluso per organizzazione: <strong>{COMMUNICATIONS_MONTHLY_EMAIL_LIMIT} email/mese</strong>.</p>"
        "<p>Costo email aggiuntive: <strong>0,01 EUR</strong> per ogni email oltre limite.</p>"
        "<table cellpadding=\"8\" cellspacing=\"0\" style=\"border-collapse:collapse;width:100%;max-width:760px\">"
        "<thead><tr>"
        "<th style=\"text-align:left;border-bottom:1px solid #ddd\">Organizzazione</th>"
        "<th style=\"text-align:right;border-bottom:1px solid #ddd\">Usate</th>"
        "<th style=\"text-align:right;border-bottom:1px solid #ddd\">Limite</th>"
        "<th style=\"text-align:right;border-bottom:1px solid #ddd\">Extra</th>"
        "<th style=\"text-align:right;border-bottom:1px solid #ddd\">Da pagare</th>"
        "</tr></thead>"
        f"<tbody>{''.join(html_rows)}</tbody>"
        "<tfoot><tr>"
        "<td style=\"border-top:1px solid #ddd\"><strong>Totale</strong></td>"
        f"<td style=\"text-align:right;border-top:1px solid #ddd\"><strong>{int(totals.get('used') or 0)}</strong></td>"
        f"<td style=\"text-align:right;border-top:1px solid #ddd\">-</td>"
        f"<td style=\"text-align:right;border-top:1px solid #ddd\"><strong>{int(totals.get('extra') or 0)}</strong></td>"
        f"<td style=\"text-align:right;border-top:1px solid #ddd\"><strong>{html.escape(total_cost_label)}</strong></td>"
        "</tr></tfoot></table>"
    )
    return "\n".join(lines), html_body


def enqueue_monthly_overage_report(
    db: Session,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    period_start, period_end = previous_month_bounds(now)
    period_key = period_start.strftime("%Y-%m")
    dedupe_key = f"communications-overage-report:{period_key}"
    existing = db.query(EmailOutbox.id).filter(EmailOutbox.dedupe_key == dedupe_key).first()
    if existing is not None:
        return {
            "enqueued": False,
            "outbox_id": existing[0],
            "period": period_key,
            "reason": "already_enqueued",
        }

    report = build_monthly_overage_report(
        db,
        period_start=period_start,
        period_end=period_end,
    )
    text_body, html_body = _render_report_bodies(report)
    outbox_id = enqueue_email(
        db,
        email_type=MONTHLY_OVERAGE_REPORT_EMAIL_TYPE,
        to_email=settings.SUPER_ADMIN_EMAIL,
        subject=f"Report email aggiuntive Comunicazioni - {report['period_label']}",
        payload=build_email_payload(
            text_body=text_body,
            html_body=html_body,
            sender=build_sender_payload(mode="system"),
            meta={
                "period": period_key,
                "period_start": report["period_start"],
                "period_end": report["period_end"],
                "report": report,
            },
        ),
        priority=3,
        dedupe_key=dedupe_key,
    )
    db.commit()
    return {
        "enqueued": True,
        "outbox_id": outbox_id,
        "period": period_key,
        "report": report,
    }


def process_monthly_communications_overage_report_once(
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    db = SessionLocal()
    try:
        return enqueue_monthly_overage_report(db, now=now)
    finally:
        db.close()
