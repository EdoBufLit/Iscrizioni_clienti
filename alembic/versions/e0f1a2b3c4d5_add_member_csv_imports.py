"""Add staged and reversible member CSV imports.

Revision ID: e0f1a2b3c4d5
Revises: d9e0f1a2b3c4
Create Date: 2026-07-18 20:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "e0f1a2b3c4d5"
down_revision = "d9e0f1a2b3c4"
branch_labels = None
depends_on = None


def _json_type():
    bind = op.get_bind()
    if (bind.dialect.name or "").lower() == "postgresql":
        return postgresql.JSONB(astext_type=sa.Text())
    return sa.JSON()


def upgrade() -> None:
    op.create_table(
        "member_import_batches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("created_by_admin_id", sa.Integer(), nullable=True),
        sa.Column("file_sha256", sa.String(length=64), nullable=False),
        sa.Column("delimiter", sa.String(length=1), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="previewed"),
        sa.Column("total_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("valid_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("imported_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("activation_mode", sa.String(length=24), nullable=True),
        sa.Column("commit_policy", sa.String(length=24), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("committed_at", sa.DateTime(), nullable=True),
        sa.Column("rolled_back_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_admin_id"], ["admin_users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_member_import_batches_org_id", "member_import_batches", ["org_id"])
    op.create_index("ix_member_import_batches_created_by_admin_id", "member_import_batches", ["created_by_admin_id"])
    op.create_index("ix_member_import_batches_file_sha256", "member_import_batches", ["file_sha256"])
    op.create_index("ix_member_import_batches_status", "member_import_batches", ["status"])

    with op.batch_alter_table("members") as batch_op:
        batch_op.add_column(sa.Column("import_batch_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_members_import_batch_id",
            "member_import_batches",
            ["import_batch_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index("ix_members_import_batch_id", "members", ["import_batch_id"])

    op.create_table(
        "member_import_rows",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("payload_encrypted", sa.Text(), nullable=False),
        sa.Column("row_sha256", sa.String(length=64), nullable=False),
        sa.Column("errors_json", _json_type(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="valid"),
        sa.Column("member_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["batch_id"], ["member_import_batches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("batch_id", "row_number", name="uq_member_import_rows_batch_row"),
    )
    op.create_index("ix_member_import_rows_batch_id", "member_import_rows", ["batch_id"])
    op.create_index("ix_member_import_rows_status", "member_import_rows", ["status"])
    op.create_index("ix_member_import_rows_member_id", "member_import_rows", ["member_id"])


def downgrade() -> None:
    op.drop_table("member_import_rows")
    op.drop_index("ix_members_import_batch_id", table_name="members")
    with op.batch_alter_table("members") as batch_op:
        batch_op.drop_constraint("fk_members_import_batch_id", type_="foreignkey")
        batch_op.drop_column("import_batch_id")
    op.drop_table("member_import_batches")
