"""add performance indexes

Revision ID: d3e4f5g6h7i8
Revises: c2d3e4f5g6h7
Create Date: 2026-02-04 19:30:00.000000

Performance optimization: Add composite indexes for frequently filtered queries.
- members(org_id, status) - member list filtering
- members(org_id, deleted_at) - soft-delete filtering
- member_documents(member_id, status) - document status filtering
- card_batches(org_id) - batch lookup by organization
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "d3e4f5g6h7i8"
down_revision = "c2d3e4f5g6h7"
branch_labels = None
depends_on = None


def upgrade():
    # Composite index for member list queries with status filter
    op.create_index(
        "ix_members_org_status",
        "members",
        ["org_id", "status"],
    )

    # Composite index for soft-delete filtering
    op.create_index(
        "ix_members_org_deleted",
        "members",
        ["org_id", "deleted_at"],
    )

    # Composite index for document queries by member and status
    op.create_index(
        "ix_member_documents_member_status",
        "member_documents",
        ["member_id", "status"],
    )

    # Index for card batch lookup by organization
    op.create_index(
        "ix_card_batches_org",
        "card_batches",
        ["org_id"],
    )


def downgrade():
    op.drop_index("ix_card_batches_org", table_name="card_batches")
    op.drop_index("ix_member_documents_member_status", table_name="member_documents")
    op.drop_index("ix_members_org_deleted", table_name="members")
    op.drop_index("ix_members_org_status", table_name="members")
