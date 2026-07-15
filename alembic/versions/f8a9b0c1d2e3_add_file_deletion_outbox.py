"""Add the transactional file-deletion outbox.

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-07-15 15:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "f8a9b0c1d2e3"
down_revision = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "file_deletion_outbox",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column(
            "storage_root",
            sa.String(length=32),
            nullable=False,
            server_default="uploads",
        ),
        sa.Column("relative_path", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="queued",
        ),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "next_retry_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "storage_root = 'uploads'",
            name="ck_file_deletion_outbox_storage_root",
        ),
        sa.CheckConstraint(
            "status IN ('queued', 'processing', 'completed', 'failed')",
            name="ck_file_deletion_outbox_status",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_file_deletion_outbox_status",
        "file_deletion_outbox",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_file_deletion_outbox_next_retry_at",
        "file_deletion_outbox",
        ["next_retry_at"],
        unique=False,
    )
    op.create_index(
        "ix_file_deletion_outbox_dispatch",
        "file_deletion_outbox",
        ["status", "next_retry_at", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_file_deletion_outbox_dispatch",
        table_name="file_deletion_outbox",
    )
    op.drop_index(
        "ix_file_deletion_outbox_next_retry_at",
        table_name="file_deletion_outbox",
    )
    op.drop_index(
        "ix_file_deletion_outbox_status",
        table_name="file_deletion_outbox",
    )
    op.drop_table("file_deletion_outbox")
