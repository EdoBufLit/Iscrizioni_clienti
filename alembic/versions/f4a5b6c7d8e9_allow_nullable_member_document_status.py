"""allow nullable member_documents.status for optional document flows

Revision ID: f4a5b6c7d8e9
Revises: e1f2g3h4i5j6
Create Date: 2026-02-06 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "f4a5b6c7d8e9"
down_revision = "e1f2g3h4i5j6"
branch_labels = None
depends_on = None


def _is_nullable(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    try:
        columns = inspector.get_columns(table_name)
    except Exception:
        return True
    for col in columns:
        if col["name"] == column_name:
            return bool(col.get("nullable", True))
    return True


def upgrade():
    # Some environments may still have a NOT NULL status column from manual schemas.
    # Optional document upload flows allow rows/doc status to be absent without blocking membership.
    if not _is_nullable("member_documents", "status"):
        with op.batch_alter_table("member_documents") as batch_op:
            batch_op.alter_column("status", existing_type=sa.String(), nullable=True)


def downgrade():
    # Intentionally left as no-op to avoid forcing NOT NULL on existing data.
    return
