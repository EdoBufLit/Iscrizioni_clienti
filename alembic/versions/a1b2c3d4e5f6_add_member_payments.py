"""add member payments

Revision ID: a1b2c3d4e5f6
Revises: 9f1b2c3d4e5f
Create Date: 2026-02-02 21:15:00.000000

NOTE: Made idempotent to handle cases where table was created by
Base.metadata.create_all() before migrations ran (common in dev/init_db).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "9f1b2c3d4e5f"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    """Check if a table exists in the database."""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def _index_exists(table_name: str, index_name: str) -> bool:
    """Check if an index exists on a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    indexes = inspector.get_indexes(table_name)
    return any(idx["name"] == index_name for idx in indexes)


def upgrade():
    # Idempotent: skip if table already exists (e.g., from create_all)
    if _table_exists("member_payments"):
        # Table exists - just ensure indexes are present
        if not _index_exists("member_payments", "ix_member_payments_member_id"):
            op.create_index("ix_member_payments_member_id", "member_payments", ["member_id"])
        if not _index_exists("member_payments", "ix_member_payments_org_id"):
            op.create_index("ix_member_payments_org_id", "member_payments", ["org_id"])
        return

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
    if not _table_exists("member_payments"):
        return
    # Drop indexes if they exist
    if _index_exists("member_payments", "ix_member_payments_org_id"):
        op.drop_index("ix_member_payments_org_id", table_name="member_payments")
    if _index_exists("member_payments", "ix_member_payments_member_id"):
        op.drop_index("ix_member_payments_member_id", table_name="member_payments")
    op.drop_table("member_payments")
