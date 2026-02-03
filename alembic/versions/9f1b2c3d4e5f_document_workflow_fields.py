"""document_workflow_fields

Revision ID: 9f1b2c3d4e5f
Revises: 2c1c3f5a9e7b
Create Date: 2026-02-02 19:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9f1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "2c1c3f5a9e7b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("member_documents")}

    with op.batch_alter_table("member_documents") as batch_op:
        if "rejection_note" not in columns:
            batch_op.add_column(sa.Column("rejection_note", sa.Text(), nullable=True))
        if "reviewed_by_admin_id" not in columns:
            batch_op.add_column(sa.Column("reviewed_by_admin_id", sa.Integer(), nullable=True))
            batch_op.create_foreign_key(
                "fk_member_documents_reviewed_by_admin",
                "admin_users",
                ["reviewed_by_admin_id"],
                ["id"],
            )
        if "replaces_document_id" not in columns:
            batch_op.add_column(sa.Column("replaces_document_id", sa.Integer(), nullable=True))
            batch_op.create_foreign_key(
                "fk_member_documents_replaces_document",
                "member_documents",
                ["replaces_document_id"],
                ["id"],
            )

    if "status" in columns:
        op.execute(
            "UPDATE member_documents SET status = 'pending' WHERE status IS NULL OR status = 'uploaded'"
        )

    if "reviewed_by_admin_id" not in columns and "reviewed_by" in columns:
        op.execute(
            "UPDATE member_documents SET reviewed_by_admin_id = reviewed_by "
            "WHERE reviewed_by_admin_id IS NULL AND reviewed_by IS NOT NULL"
        )


def downgrade() -> None:
    """Downgrade schema."""
    pass
