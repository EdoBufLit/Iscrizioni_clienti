"""Add in-app card replenishment requests and credit tracking.

Revision ID: a6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-07-18 18:30:00.000000
"""

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "a6b7c8d9e0f1"
down_revision = "f5a6b7c8d9e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("recharge_requests") as batch_op:
        batch_op.add_column(sa.Column("requested_year", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "source",
                sa.String(),
                nullable=False,
                server_default="whatsapp",
            )
        )
        batch_op.add_column(sa.Column("requested_by_admin_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("idempotency_key", sa.String(length=64), nullable=True))
        batch_op.add_column(
            sa.Column(
                "unit_price_cents",
                sa.Integer(),
                nullable=False,
                server_default="100",
            )
        )
        batch_op.add_column(
            sa.Column(
                "amount_due_cents",
                sa.Integer(),
                nullable=False,
                server_default="0",
            )
        )
        batch_op.add_column(
            sa.Column(
                "currency",
                sa.String(length=3),
                nullable=False,
                server_default="EUR",
            )
        )
        batch_op.add_column(
            sa.Column(
                "billing_status",
                sa.String(),
                nullable=False,
                server_default="not_applicable",
            )
        )
        batch_op.add_column(sa.Column("paid_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("paid_by_admin_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("payment_reference", sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column("accounting_note", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("accounting_updated_at", sa.DateTime(), nullable=True))
        batch_op.add_column(
            sa.Column("notification_email_outbox_id", sa.String(length=36), nullable=True)
        )
        batch_op.add_column(sa.Column("super_admin_notified_at", sa.DateTime(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            )
        )
        batch_op.create_foreign_key(
            "fk_recharge_requests_requested_by_admin_id",
            "admin_users",
            ["requested_by_admin_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_foreign_key(
            "fk_recharge_requests_paid_by_admin_id",
            "admin_users",
            ["paid_by_admin_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_foreign_key(
            "fk_recharge_requests_notification_email_outbox_id",
            "email_outbox",
            ["notification_email_outbox_id"],
            ["id"],
            ondelete="SET NULL",
        )

    # Historical WhatsApp requests remain outside the new receivables ledger.
    # Their economic snapshot is still completed so every row is self-contained.
    op.execute(
        sa.text(
            """
            UPDATE recharge_requests
               SET source = 'whatsapp',
                   unit_price_cents = 100,
                   amount_due_cents = requested_cards * 100,
                   currency = 'EUR',
                   billing_status = 'not_applicable',
                   updated_at = COALESCE(created_at, CURRENT_TIMESTAMP)
            """
        )
    )
    # Preserve the year of an already-linked historical lot where possible;
    # otherwise snapshot the deployment year before making the column required.
    op.execute(
        sa.text(
            """
            UPDATE recharge_requests
               SET requested_year = (
                   SELECT card_batches.year
                     FROM card_batches
                    WHERE card_batches.id = recharge_requests.card_batch_id
               )
             WHERE requested_year IS NULL
               AND card_batch_id IS NOT NULL
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE recharge_requests
               SET requested_year = :fallback_year
             WHERE requested_year IS NULL
            """
        ).bindparams(fallback_year=datetime.now(timezone.utc).year)
    )

    with op.batch_alter_table("recharge_requests") as batch_op:
        batch_op.alter_column(
            "requested_year",
            existing_type=sa.Integer(),
            nullable=False,
        )
        batch_op.create_unique_constraint(
            "uq_recharge_requests_org_idempotency_key",
            ["association_id", "idempotency_key"],
        )
        batch_op.create_check_constraint(
            "ck_recharge_requests_requested_cards_range",
            "requested_cards >= 1 AND requested_cards <= 5000",
        )
        batch_op.create_check_constraint(
            "ck_recharge_requests_unit_price_one_euro",
            "unit_price_cents = 100",
        )
        batch_op.create_check_constraint(
            "ck_recharge_requests_amount_due",
            "amount_due_cents = requested_cards * unit_price_cents",
        )
        batch_op.create_check_constraint(
            "ck_recharge_requests_currency_eur",
            "currency = 'EUR'",
        )
        batch_op.create_check_constraint(
            "ck_recharge_requests_billing_status",
            "billing_status IN ('not_applicable', 'unpaid', 'paid')",
        )

    op.create_index("ix_recharge_requests_source", "recharge_requests", ["source"])
    op.create_index(
        "ix_recharge_requests_requested_by_admin_id",
        "recharge_requests",
        ["requested_by_admin_id"],
    )
    op.create_index(
        "ix_recharge_requests_billing_status",
        "recharge_requests",
        ["billing_status"],
    )

    op.create_table(
        "recharge_request_accounting_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("recharge_request_id", sa.Integer(), nullable=False),
        sa.Column("actor_admin_id", sa.Integer(), nullable=True),
        sa.Column("previous_status", sa.String(), nullable=False),
        sa.Column("new_status", sa.String(), nullable=False),
        sa.Column("changes_json", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["actor_admin_id"],
            ["admin_users.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["recharge_request_id"],
            ["recharge_requests.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_recharge_request_accounting_events_id",
        "recharge_request_accounting_events",
        ["id"],
    )
    op.create_index(
        "ix_recharge_request_accounting_events_request_id",
        "recharge_request_accounting_events",
        ["recharge_request_id"],
    )
    op.create_index(
        "ix_recharge_request_accounting_events_actor_admin_id",
        "recharge_request_accounting_events",
        ["actor_admin_id"],
    )
    op.create_index(
        "ix_recharge_request_accounting_events_created_at",
        "recharge_request_accounting_events",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_recharge_request_accounting_events_created_at",
        table_name="recharge_request_accounting_events",
    )
    op.drop_index(
        "ix_recharge_request_accounting_events_actor_admin_id",
        table_name="recharge_request_accounting_events",
    )
    op.drop_index(
        "ix_recharge_request_accounting_events_request_id",
        table_name="recharge_request_accounting_events",
    )
    op.drop_index(
        "ix_recharge_request_accounting_events_id",
        table_name="recharge_request_accounting_events",
    )
    op.drop_table("recharge_request_accounting_events")

    op.drop_index("ix_recharge_requests_billing_status", table_name="recharge_requests")
    op.drop_index(
        "ix_recharge_requests_requested_by_admin_id",
        table_name="recharge_requests",
    )
    op.drop_index("ix_recharge_requests_source", table_name="recharge_requests")

    with op.batch_alter_table("recharge_requests") as batch_op:
        batch_op.drop_constraint(
            "ck_recharge_requests_billing_status",
            type_="check",
        )
        batch_op.drop_constraint("ck_recharge_requests_currency_eur", type_="check")
        batch_op.drop_constraint("ck_recharge_requests_amount_due", type_="check")
        batch_op.drop_constraint(
            "ck_recharge_requests_unit_price_one_euro",
            type_="check",
        )
        batch_op.drop_constraint(
            "ck_recharge_requests_requested_cards_range",
            type_="check",
        )
        batch_op.drop_constraint(
            "uq_recharge_requests_org_idempotency_key",
            type_="unique",
        )
        batch_op.drop_constraint(
            "fk_recharge_requests_notification_email_outbox_id",
            type_="foreignkey",
        )
        batch_op.drop_constraint(
            "fk_recharge_requests_paid_by_admin_id",
            type_="foreignkey",
        )
        batch_op.drop_constraint(
            "fk_recharge_requests_requested_by_admin_id",
            type_="foreignkey",
        )
        batch_op.drop_column("updated_at")
        batch_op.drop_column("super_admin_notified_at")
        batch_op.drop_column("notification_email_outbox_id")
        batch_op.drop_column("accounting_updated_at")
        batch_op.drop_column("accounting_note")
        batch_op.drop_column("payment_reference")
        batch_op.drop_column("paid_by_admin_id")
        batch_op.drop_column("paid_at")
        batch_op.drop_column("billing_status")
        batch_op.drop_column("currency")
        batch_op.drop_column("amount_due_cents")
        batch_op.drop_column("unit_price_cents")
        batch_op.drop_column("idempotency_key")
        batch_op.drop_column("requested_by_admin_id")
        batch_op.drop_column("source")
        batch_op.drop_column("requested_year")
