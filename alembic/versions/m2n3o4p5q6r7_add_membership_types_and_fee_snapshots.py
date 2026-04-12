"""add membership types and fee snapshots

Revision ID: m2n3o4p5q6r7
Revises: r1s2u3m4u5p6
Create Date: 2026-04-11 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "m2n3o4p5q6r7"
down_revision = "r1s2u3m4u5p6"
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _column_exists(table_name: str, column_name: str) -> bool:
    try:
        columns = _inspector().get_columns(table_name)
    except Exception:
        return False
    return any(col.get("name") == column_name for col in columns)


def _index_exists(table_name: str, index_name: str) -> bool:
    try:
        indexes = _inspector().get_indexes(table_name)
    except Exception:
        return False
    return any(index.get("name") == index_name for index in indexes)


def upgrade() -> None:
    if not _column_exists("organizations", "temporary_membership_fee_amount"):
        with op.batch_alter_table("organizations") as batch_op:
            batch_op.add_column(sa.Column("temporary_membership_fee_amount", sa.Numeric(10, 2), nullable=True))
            batch_op.add_column(
                sa.Column(
                    "custom_membership_types_enabled",
                    sa.Boolean(),
                    nullable=False,
                    server_default="false",
                )
            )
            batch_op.add_column(sa.Column("temporary_membership_duration_value", sa.Integer(), nullable=True))
            batch_op.add_column(sa.Column("temporary_membership_duration_unit", sa.String(), nullable=True))

    if not _column_exists("members", "membership_type"):
        with op.batch_alter_table("members") as batch_op:
            batch_op.add_column(sa.Column("membership_type", sa.String(), nullable=True))
            batch_op.add_column(sa.Column("valid_from", sa.DateTime(), nullable=True))
            batch_op.add_column(sa.Column("valid_until", sa.DateTime(), nullable=True))
            batch_op.add_column(sa.Column("membership_fee_snapshot", sa.Numeric(10, 2), nullable=True))

    if not _index_exists("members", "ix_members_valid_until"):
        op.create_index("ix_members_valid_until", "members", ["valid_until"], unique=False)

    op.execute(
        sa.text(
            """
            UPDATE organizations
               SET custom_membership_types_enabled = COALESCE(custom_membership_types_enabled, FALSE),
                   membership_fee_currency = COALESCE(NULLIF(trim(membership_fee_currency), ''), 'EUR')
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE members
               SET membership_fee_snapshot = (
                   COALESCE(
                       (
                           SELECT mp.amount
                             FROM membership_payments mp
                            WHERE mp.socio_id = members.id
                              AND lower(COALESCE(mp.status, '')) IN ('completed', 'manual_completed')
                            ORDER BY COALESCE(mp.confirmed_at, mp.created_at) DESC, mp.id DESC
                            LIMIT 1
                       ),
                       (
                           SELECT CAST(mpay.amount_cents AS NUMERIC) / 100.0
                             FROM member_payments mpay
                            WHERE mpay.member_id = members.id
                            ORDER BY COALESCE(mpay.paid_at, mpay.created_at) DESC, mpay.id DESC
                            LIMIT 1
                       ),
                       (
                           SELECT org.membership_fee_amount
                             FROM organizations org
                            WHERE org.id = members.org_id
                       )
                   )
               )
             WHERE membership_fee_snapshot IS NULL
            """
        )
    )


def downgrade() -> None:
    if _index_exists("members", "ix_members_valid_until"):
        op.drop_index("ix_members_valid_until", table_name="members")

    if _column_exists("members", "membership_type"):
        with op.batch_alter_table("members") as batch_op:
            batch_op.drop_column("membership_fee_snapshot")
            batch_op.drop_column("valid_until")
            batch_op.drop_column("valid_from")
            batch_op.drop_column("membership_type")

    if _column_exists("organizations", "temporary_membership_fee_amount"):
        with op.batch_alter_table("organizations") as batch_op:
            batch_op.drop_column("temporary_membership_duration_unit")
            batch_op.drop_column("temporary_membership_duration_value")
            batch_op.drop_column("custom_membership_types_enabled")
            batch_op.drop_column("temporary_membership_fee_amount")
