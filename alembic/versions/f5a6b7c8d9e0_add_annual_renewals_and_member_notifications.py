"""Add term-scoped renewal payments and member notifications.

Revision ID: f5a6b7c8d9e0
Revises: e3f4a5b6c7d8
Create Date: 2026-07-18 16:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "f5a6b7c8d9e0"
down_revision = "e3f4a5b6c7d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("membership_payments") as batch_op:
        batch_op.add_column(sa.Column("annual_term_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("membership_year", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "payment_kind",
                sa.String(),
                nullable=False,
                server_default="initial",
            )
        )
        batch_op.create_foreign_key(
            "fk_membership_payments_annual_term_id",
            "annual_membership_terms",
            ["annual_term_id"],
            ["id"],
            ondelete="SET NULL",
        )

    op.create_index(
        "ix_membership_payments_annual_term_id",
        "membership_payments",
        ["annual_term_id"],
    )
    op.create_index(
        "ix_membership_payments_membership_year",
        "membership_payments",
        ["membership_year"],
    )
    op.create_index(
        "ix_membership_payments_payment_kind",
        "membership_payments",
        ["payment_kind"],
    )
    op.create_index(
        "ix_membership_payments_term_status",
        "membership_payments",
        ["annual_term_id", "status"],
    )

    # Existing rows are initial-enrolment payments. Link them only when the
    # member's card year identifies exactly one backfilled annual term.
    op.execute(
        sa.text(
            """
            UPDATE membership_payments
               SET membership_year = (
                   SELECT members.card_year
                     FROM members
                    WHERE members.id = membership_payments.socio_id
               )
             WHERE membership_year IS NULL
               AND socio_id IS NOT NULL
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE membership_payments
               SET annual_term_id = (
                   SELECT annual_membership_terms.id
                     FROM annual_membership_terms
                    WHERE annual_membership_terms.member_id = membership_payments.socio_id
                      AND annual_membership_terms.membership_year = membership_payments.membership_year
               )
             WHERE annual_term_id IS NULL
               AND membership_year IS NOT NULL
            """
        )
    )

    op.create_table(
        "member_notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("href", sa.String(), nullable=False),
        sa.Column(
            "is_read",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dedupe_key", sa.String(length=160), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_member_notifications_member_id",
        "member_notifications",
        ["member_id"],
    )
    op.create_index(
        "ix_member_notifications_org_id",
        "member_notifications",
        ["org_id"],
    )
    op.create_index(
        "ix_member_notifications_type",
        "member_notifications",
        ["type"],
    )
    op.create_index(
        "ix_member_notifications_is_read",
        "member_notifications",
        ["is_read"],
    )
    op.create_index(
        "ix_member_notifications_dedupe_key",
        "member_notifications",
        ["dedupe_key"],
        unique=True,
    )
    op.create_index(
        "ix_member_notifications_created_at",
        "member_notifications",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_member_notifications_created_at", table_name="member_notifications")
    op.drop_index("ix_member_notifications_dedupe_key", table_name="member_notifications")
    op.drop_index("ix_member_notifications_is_read", table_name="member_notifications")
    op.drop_index("ix_member_notifications_type", table_name="member_notifications")
    op.drop_index("ix_member_notifications_org_id", table_name="member_notifications")
    op.drop_index("ix_member_notifications_member_id", table_name="member_notifications")
    op.drop_table("member_notifications")

    op.drop_index("ix_membership_payments_term_status", table_name="membership_payments")
    op.drop_index("ix_membership_payments_payment_kind", table_name="membership_payments")
    op.drop_index("ix_membership_payments_membership_year", table_name="membership_payments")
    op.drop_index("ix_membership_payments_annual_term_id", table_name="membership_payments")
    with op.batch_alter_table("membership_payments") as batch_op:
        batch_op.drop_constraint(
            "fk_membership_payments_annual_term_id",
            type_="foreignkey",
        )
        batch_op.drop_column("payment_kind")
        batch_op.drop_column("membership_year")
        batch_op.drop_column("annual_term_id")
