"""add performance indexes

Revision ID: d3e4f5g6h7i8
Revises: c2d3e4f5g6h7
Create Date: 2026-02-04 19:30:00.000000

Performance optimization: Add composite indexes for frequently filtered queries.
- members(org_id, status) - member list filtering
- members(org_id, deleted_at) - soft-delete filtering
- member_documents(member_id, status) - document status filtering
- card_batches(org_id) - batch lookup by organization

NOTE: Made idempotent to handle schema drift from create_all/init_db.
"""

from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "d3e4f5g6h7i8"
down_revision = "c2d3e4f5g6h7"
branch_labels = None
depends_on = None


def _index_exists(table_name: str, index_name: str) -> bool:
    """Check if an index exists on a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    try:
        indexes = inspector.get_indexes(table_name)
        return any(idx["name"] == index_name for idx in indexes)
    except Exception:
        return False


def _column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists on a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    try:
        columns = inspector.get_columns(table_name)
        return any(col["name"] == column_name for col in columns)
    except Exception:
        return False


def _safe_create_index(index_name: str, table_name: str, columns: list[str]):
    """Create an index only if it doesn't exist and all columns exist."""
    if _index_exists(table_name, index_name):
        return  # Index already exists

    # Check all columns exist
    for col in columns:
        if not _column_exists(table_name, col):
            # Column doesn't exist - skip this index
            return

    op.create_index(index_name, table_name, columns)


def _safe_drop_index(index_name: str, table_name: str):
    """Drop an index only if it exists."""
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)


def upgrade():
    # Composite index for member list queries with status filter
    _safe_create_index(
        "ix_members_org_status",
        "members",
        ["org_id", "status"],
    )

    # Composite index for soft-delete filtering
    _safe_create_index(
        "ix_members_org_deleted",
        "members",
        ["org_id", "deleted_at"],
    )

    # Composite index for document queries by member and status
    _safe_create_index(
        "ix_member_documents_member_status",
        "member_documents",
        ["member_id", "status"],
    )

    # Index for card batch lookup by organization
    _safe_create_index(
        "ix_card_batches_org",
        "card_batches",
        ["org_id"],
    )


def downgrade():
    _safe_drop_index("ix_card_batches_org", "card_batches")
    _safe_drop_index("ix_member_documents_member_status", "member_documents")
    _safe_drop_index("ix_members_org_deleted", "members")
    _safe_drop_index("ix_members_org_status", "members")
