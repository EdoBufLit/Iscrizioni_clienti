from __future__ import annotations

import csv
import io
from datetime import date, datetime, time, timedelta
from typing import Iterable

from sqlalchemy import or_
from sqlalchemy.orm import Query, Session

from app.log_redaction import redact_mapping
from app.models import OperationLog, Organization
from app.services.csv_safety import neutralize_csv_formula


ALLOWED_AUDIT_OUTCOMES = {"success", "failure", "blocked", "warning"}
MAX_AUDIT_PAGE_SIZE = 100


def _filtered_query(
    db: Session,
    *,
    org_id: int | None,
    cursor: int | None,
    category: str | None,
    action: str | None,
    outcome: str | None,
    date_from: date | None,
    date_to: date | None,
    search: str | None,
) -> Query:
    query = db.query(OperationLog)
    if org_id is not None:
        # Tenant boundary: legacy rows without an explicit organization are not
        # exposed to association administrators.
        query = query.filter(OperationLog.org_id == org_id)
    if cursor is not None:
        query = query.filter(OperationLog.id < cursor)
    if category:
        query = query.filter(OperationLog.category == category.strip().lower())
    if action:
        query = query.filter(OperationLog.action == action.strip())
    if outcome:
        normalized_outcome = outcome.strip().lower()
        if normalized_outcome in ALLOWED_AUDIT_OUTCOMES:
            query = query.filter(OperationLog.outcome == normalized_outcome)
    if date_from:
        query = query.filter(OperationLog.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.filter(
            OperationLog.created_at < datetime.combine(date_to + timedelta(days=1), time.min)
        )
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                OperationLog.action.ilike(pattern),
                OperationLog.entity_type.ilike(pattern),
                OperationLog.actor_role.ilike(pattern),
            )
        )
    return query


def _organization_names(db: Session, rows: Iterable[OperationLog]) -> dict[int, str]:
    org_ids = {row.org_id for row in rows if row.org_id is not None}
    if not org_ids:
        return {}
    return dict(
        db.query(Organization.id, Organization.name)
        .filter(Organization.id.in_(org_ids))
        .all()
    )


def serialize_audit_event(row: OperationLog, organization_name: str | None) -> dict:
    return {
        "id": row.id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "category": row.category or (row.action or "other").partition(".")[0],
        "action": row.action,
        "outcome": row.outcome or "success",
        "actor": {
            "role": row.actor_role,
            "admin_id": row.actor_admin_id,
            "member_id": row.actor_member_id,
        },
        "organization": {
            "id": row.org_id,
            "name": organization_name,
        }
        if row.org_id is not None
        else None,
        "entity": {"type": row.entity_type, "id": row.entity_id},
        "request_id": row.request_id,
        # Redact again at read time to protect older records written before the
        # centralized redaction policy existed.
        "metadata": redact_mapping(row.metadata_json) if row.metadata_json else None,
    }


def list_audit_events(
    db: Session,
    *,
    org_id: int | None = None,
    cursor: int | None = None,
    limit: int = 50,
    category: str | None = None,
    action: str | None = None,
    outcome: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
) -> dict:
    page_size = max(1, min(int(limit), MAX_AUDIT_PAGE_SIZE))
    rows = (
        _filtered_query(
            db,
            org_id=org_id,
            cursor=cursor,
            category=category,
            action=action,
            outcome=outcome,
            date_from=date_from,
            date_to=date_to,
            search=search,
        )
        .order_by(OperationLog.id.desc())
        .limit(page_size + 1)
        .all()
    )
    has_more = len(rows) > page_size
    page = rows[:page_size]
    names = _organization_names(db, page)
    return {
        "items": [serialize_audit_event(row, names.get(row.org_id)) for row in page],
        "next_cursor": page[-1].id if has_more and page else None,
        "has_more": has_more,
    }


def audit_events_csv(
    db: Session,
    *,
    org_id: int | None = None,
    category: str | None = None,
    action: str | None = None,
    outcome: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
    max_rows: int = 10_000,
) -> io.StringIO:
    rows = (
        _filtered_query(
            db,
            org_id=org_id,
            cursor=None,
            category=category,
            action=action,
            outcome=outcome,
            date_from=date_from,
            date_to=date_to,
            search=search,
        )
        .order_by(OperationLog.id.desc())
        .limit(max_rows)
        .all()
    )
    names = _organization_names(db, rows)
    output = io.StringIO()
    output.write("\ufeff")
    writer = csv.writer(output)
    writer.writerow(
        [
            neutralize_csv_formula(cell)
            for cell in [
                "data_utc",
                "categoria",
                "azione",
                "esito",
                "ruolo_attore",
                "associazione",
                "tipo_entita",
                "id_entita",
                "request_id",
            ]
        ]
    )
    for row in rows:
        writer.writerow(
            [
                neutralize_csv_formula(cell)
                for cell in [
                    row.created_at.isoformat() if row.created_at else "",
                    row.category or (row.action or "other").partition(".")[0],
                    row.action or "",
                    row.outcome or "success",
                    row.actor_role or "",
                    names.get(row.org_id, ""),
                    row.entity_type or "",
                    row.entity_id if row.entity_id is not None else "",
                    row.request_id or "",
                ]
            ]
        )
    output.seek(0)
    return output
