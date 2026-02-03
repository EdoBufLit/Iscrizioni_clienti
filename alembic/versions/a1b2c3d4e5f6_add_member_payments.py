"""add member payments

Revision ID: a1b2c3d4e5f6
Revises: 9f1b2c3d4e5f
Create Date: 2026-02-02 21:15:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "9f1b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "member_payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id"), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("admin_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(), nullable=False),
        sa.Column("paid_at", sa.DateTime(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_member_payments_member_id", "member_payments", ["member_id"])
    op.create_index("ix_member_payments_org_id", "member_payments", ["org_id"])


def downgrade():
    op.drop_index("ix_member_payments_org_id", table_name="member_payments")
    op.drop_index("ix_member_payments_member_id", table_name="member_payments")
    op.drop_table("member_payments")
