"""add stripe connect demo fields

Revision ID: 6c7d8e9f0a1b
Revises: 4a5b6c7d8e9f
Create Date: 2026-03-10 11:45:00.000000

NOTE:
This migration is intentionally idempotent. In this repo some dev/bootstrap
paths may create tables from SQLAlchemy metadata before Alembic runs. When that
has already happened, we must not recreate or drop `stripe_webhook_events`;
instead we only add missing columns/indexes/constraints.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "6c7d8e9f0a1b"
down_revision = "4a5b6c7d8e9f"
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in _inspector().get_table_names()


def _column_names(table_name: str) -> set[str]:
    if not _table_exists(table_name):
        return set()
    return {column["name"] for column in _inspector().get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    if not _table_exists(table_name):
        return set()
    return {index["name"] for index in _inspector().get_indexes(table_name)}


def _has_unique_constraint(table_name: str, columns: list[str]) -> bool:
    if not _table_exists(table_name):
        return False

    expected = tuple(columns)
    inspector = _inspector()
    for constraint in inspector.get_unique_constraints(table_name):
        if tuple(constraint.get("column_names") or []) == expected:
            return True

    for index in inspector.get_indexes(table_name):
        if index.get("unique") and tuple(index.get("column_names") or []) == expected:
            return True

    return False


def upgrade() -> None:
    bind = op.get_bind()
    dialect_name = (bind.dialect.name or "").lower()
    organization_columns = _column_names("organizations")

    if "stripe_connected_account_id" not in organization_columns:
        op.add_column(
            "organizations",
            sa.Column("stripe_connected_account_id", sa.String(), nullable=True),
        )
    if "stripe_platform_subscription_status" not in organization_columns:
        op.add_column(
            "organizations",
            sa.Column("stripe_platform_subscription_status", sa.String(), nullable=True),
        )
    if "stripe_platform_subscription_id" not in organization_columns:
        op.add_column(
            "organizations",
            sa.Column("stripe_platform_subscription_id", sa.String(), nullable=True),
        )

    if not _has_unique_constraint("organizations", ["stripe_connected_account_id"]):
        if dialect_name == "sqlite":
            op.create_index(
                "uq_organizations_stripe_connected_account_id",
                "organizations",
                ["stripe_connected_account_id"],
                unique=True,
            )
        else:
            op.create_unique_constraint(
                "uq_organizations_stripe_connected_account_id",
                "organizations",
                ["stripe_connected_account_id"],
            )

    if not _table_exists("stripe_webhook_events"):
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
    else:
        webhook_columns = _column_names("stripe_webhook_events")
        # Conservative shape repair for tables created earlier via bootstrap.
        # We only add missing non-destructive columns here; we do not attempt to
        # recreate primary keys or rewrite existing data.
        if "event_id" not in webhook_columns:
            op.add_column(
                "stripe_webhook_events",
                sa.Column("event_id", sa.String(), nullable=True),
            )
        if "event_type" not in webhook_columns:
            op.add_column(
                "stripe_webhook_events",
                sa.Column("event_type", sa.String(), nullable=True),
            )
        if "livemode" not in webhook_columns:
            op.add_column(
                "stripe_webhook_events",
                sa.Column(
                    "livemode",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.text("false"),
                ),
            )
        if "processed_at" not in webhook_columns:
            op.add_column(
                "stripe_webhook_events",
                sa.Column("processed_at", sa.DateTime(), nullable=True),
            )

    webhook_index_names = _index_names("stripe_webhook_events")
    if "ix_stripe_webhook_events_event_id" not in webhook_index_names:
        op.create_index(
            "ix_stripe_webhook_events_event_id",
            "stripe_webhook_events",
            ["event_id"],
            unique=True,
        )
    if "ix_stripe_webhook_events_event_type" not in webhook_index_names:
        op.create_index(
            "ix_stripe_webhook_events_event_type",
            "stripe_webhook_events",
            ["event_type"],
            unique=False,
        )


def downgrade() -> None:
    # Intentionally non-destructive for stripe_webhook_events.
    # This table may have been created earlier by bootstrap/create_all paths, so
    # downgrade must not drop it blindly or remove its indexes without clear
    # provenance. Keeping the table is safer than risking data loss.

    if _has_unique_constraint("organizations", ["stripe_connected_account_id"]):
        try:
            if (op.get_bind().dialect.name or "").lower() == "sqlite":
                op.drop_index(
                    "uq_organizations_stripe_connected_account_id",
                    table_name="organizations",
                )
            else:
                op.drop_constraint(
                    "uq_organizations_stripe_connected_account_id",
                    "organizations",
                    type_="unique",
                )
        except Exception:
            # The constraint may exist under a database-generated name if the
            # schema was created earlier via SQLAlchemy metadata/create_all().
            pass

    organization_columns = _column_names("organizations")
    if "stripe_platform_subscription_id" in organization_columns:
        op.drop_column("organizations", "stripe_platform_subscription_id")
    if "stripe_platform_subscription_status" in organization_columns:
        op.drop_column("organizations", "stripe_platform_subscription_status")
    if "stripe_connected_account_id" in organization_columns:
        op.drop_column("organizations", "stripe_connected_account_id")
