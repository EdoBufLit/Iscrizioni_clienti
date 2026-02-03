"""add_manual_member_fields

Revision ID: 2c1c3f5a9e7b
Revises: 7dc4906819c4
Create Date: 2026-02-02 16:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2c1c3f5a9e7b"
down_revision: Union[str, Sequence[str], None] = "7dc4906819c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("members")}

    with op.batch_alter_table("members") as batch_op:
        if "member_type" not in columns:
            batch_op.add_column(sa.Column("member_type", sa.String(), nullable=True))
        if "internal_notes" not in columns:
            batch_op.add_column(sa.Column("internal_notes", sa.Text(), nullable=True))
        if "is_manual" not in columns:
            batch_op.add_column(
                sa.Column("is_manual", sa.Boolean(), nullable=False, server_default=sa.text("0"))
            )


def downgrade() -> None:
    """Downgrade schema."""
    pass
