"""Add member attendance records and cash-only signup mode.

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-07-25 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "a2b3c4d5e6f7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("organizations") as batch_op:
        batch_op.add_column(
            sa.Column(
                "cash_only_signup_payment",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )

    op.create_table(
        "member_attendances",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("checked_in_by_admin_id", sa.Integer(), nullable=True),
        sa.Column("card_no", sa.Integer(), nullable=False),
        sa.Column("card_year", sa.Integer(), nullable=False),
        sa.Column("attendance_date", sa.Date(), nullable=False),
        sa.Column("membership_type", sa.String(), nullable=False),
        sa.Column("source", sa.String(), server_default="qr", nullable=False),
        sa.Column(
            "checked_in_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["checked_in_by_admin_id"],
            ["admin_users.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "org_id",
            "member_id",
            "attendance_date",
            name="uq_member_attendance_org_member_day",
        ),
    )
    op.create_index(
        "ix_member_attendances_org_id",
        "member_attendances",
        ["org_id"],
        unique=False,
    )
    op.create_index(
        "ix_member_attendances_member_id",
        "member_attendances",
        ["member_id"],
        unique=False,
    )
    op.create_index(
        "ix_member_attendances_checked_in_by_admin_id",
        "member_attendances",
        ["checked_in_by_admin_id"],
        unique=False,
    )
    op.create_index(
        "ix_member_attendances_checked_in_at",
        "member_attendances",
        ["checked_in_at"],
        unique=False,
    )
    op.create_index(
        "ix_member_attendances_attendance_date",
        "member_attendances",
        ["attendance_date"],
        unique=False,
    )
    op.create_index(
        "ix_member_attendances_org_checked_in",
        "member_attendances",
        ["org_id", "attendance_date", "checked_in_at"],
        unique=False,
    )
    op.create_index(
        "ix_member_attendances_org_member_checked_in",
        "member_attendances",
        ["org_id", "member_id", "checked_in_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_member_attendances_org_member_checked_in",
        table_name="member_attendances",
    )
    op.drop_index(
        "ix_member_attendances_org_checked_in",
        table_name="member_attendances",
    )
    op.drop_index(
        "ix_member_attendances_checked_in_at",
        table_name="member_attendances",
    )
    op.drop_index(
        "ix_member_attendances_attendance_date",
        table_name="member_attendances",
    )
    op.drop_index(
        "ix_member_attendances_checked_in_by_admin_id",
        table_name="member_attendances",
    )
    op.drop_index(
        "ix_member_attendances_member_id",
        table_name="member_attendances",
    )
    op.drop_index(
        "ix_member_attendances_org_id",
        table_name="member_attendances",
    )
    op.drop_table("member_attendances")

    with op.batch_alter_table("organizations") as batch_op:
        batch_op.drop_column("cash_only_signup_payment")
