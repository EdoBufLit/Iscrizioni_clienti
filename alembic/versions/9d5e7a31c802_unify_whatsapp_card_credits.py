"""Include historical WhatsApp orders in the card receivables ledger.

Revision ID: 9d5e7a31c802
Revises: 8c4d9e21f603
Create Date: 2026-09-12
"""

from datetime import datetime

from alembic import op
import sqlalchemy as sa


revision = "9d5e7a31c802"
down_revision = "8c4d9e21f603"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Keep this data migration independent of future application models. It can
    # be replayed after rollout to catch an order written by an old worker during
    # the deployment window; already-classified requests are never changed.
    requests = sa.table(
        "recharge_requests",
        sa.column("id", sa.Integer),
        sa.column("source", sa.String),
        sa.column("billing_status", sa.String),
        sa.column("amount_due_cents", sa.Integer),
        sa.column("paid_at", sa.DateTime),
        sa.column("paid_by_admin_id", sa.Integer),
        sa.column("payment_reference", sa.String),
        sa.column("accounting_note", sa.Text),
        sa.column("accounting_updated_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )
    events = sa.table(
        "recharge_request_accounting_events",
        sa.column("recharge_request_id", sa.Integer),
        sa.column("actor_admin_id", sa.Integer),
        sa.column("previous_status", sa.String),
        sa.column("new_status", sa.String),
        sa.column("changes_json", sa.JSON),
        sa.column("created_at", sa.DateTime),
    )
    connection = op.get_bind()
    rows = connection.execute(
        sa.select(requests)
        .where(requests.c.source == "whatsapp", requests.c.billing_status == "not_applicable")
        .order_by(requests.c.id)
        .with_for_update()
    ).mappings().all()
    now = datetime.utcnow()
    for row in rows:
        before = {
            "billing_status": row["billing_status"],
            "paid_at": row["paid_at"].isoformat() if row["paid_at"] else None,
            "paid_by_admin_id": row["paid_by_admin_id"],
            "payment_reference": row["payment_reference"],
            "accounting_note": row["accounting_note"],
        }
        connection.execute(
            requests.update().where(requests.c.id == row["id"]).values(
                billing_status="unpaid", accounting_updated_at=now, updated_at=now,
            )
        )
        connection.execute(events.insert().values(
            recharge_request_id=row["id"], actor_admin_id=None,
            previous_status="not_applicable", new_status="unpaid",
            changes_json={
                "migration": revision,
                "reason": "Inclusione delle richieste WhatsApp nel registro crediti tessere",
                "amount_due_cents": row["amount_due_cents"],
                "before": before,
                "after": {**before, "billing_status": "unpaid"},
            },
            created_at=now,
        ))


def downgrade() -> None:
    # A rollback must not erase receivables or payments recorded since rollout.
    # This migration adds no schema objects; accounting and its audit stay intact.
    pass
