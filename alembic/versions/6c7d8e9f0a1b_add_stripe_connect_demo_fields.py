"""add stripe connect demo fields

Revision ID: 6c7d8e9f0a1b
Revises: 4a5b6c7d8e9f
Create Date: 2026-03-10 11:45:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "6c7d8e9f0a1b"
down_revision = "4a5b6c7d8e9f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("stripe_connected_account_id", sa.String(), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column("stripe_platform_subscription_status", sa.String(), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column("stripe_platform_subscription_id", sa.String(), nullable=True),
    )
    op.create_unique_constraint(
        "uq_organizations_stripe_connected_account_id",
        "organizations",
        ["stripe_connected_account_id"],
    )

    op.create_table(
        "stripe_webhook_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.String(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column(
            "livemode",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("processed_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_stripe_webhook_events_event_id",
        "stripe_webhook_events",
        ["event_id"],
        unique=True,
    )
    op.create_index(
        "ix_stripe_webhook_events_event_type",
        "stripe_webhook_events",
        ["event_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_stripe_webhook_events_event_type", table_name="stripe_webhook_events")
    op.drop_index("ix_stripe_webhook_events_event_id", table_name="stripe_webhook_events")
    op.drop_table("stripe_webhook_events")
    op.drop_constraint(
        "uq_organizations_stripe_connected_account_id",
        "organizations",
        type_="unique",
    )
    op.drop_column("organizations", "stripe_platform_subscription_id")
    op.drop_column("organizations", "stripe_platform_subscription_status")
    op.drop_column("organizations", "stripe_connected_account_id")
