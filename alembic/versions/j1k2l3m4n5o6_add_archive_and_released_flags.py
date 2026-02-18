"""add organization.deleted_at and card_batches.released_at

Revision ID: j1k2l3m4n5o6
Revises: i7b8c9d0e1f2
Create Date: 2026-02-18 15:05:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "j1k2l3m4n5o6"
down_revision: Union[str, Sequence[str], None] = "i7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector():
    return sa.inspect(op.get_bind())


def _column_exists(table_name: str, column_name: str) -> bool:
    try:
        columns = _inspector().get_columns(table_name)
    except Exception:
        return False
    return any(col.get("name") == column_name for col in columns)


def upgrade() -> None:
    if not _column_exists("organizations", "deleted_at"):
        with op.batch_alter_table("organizations") as batch_op:
            batch_op.add_column(sa.Column("deleted_at", sa.DateTime(), nullable=True))

    if not _column_exists("card_batches", "released_at"):
        with op.batch_alter_table("card_batches") as batch_op:
            batch_op.add_column(sa.Column("released_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    if _column_exists("card_batches", "released_at"):
        with op.batch_alter_table("card_batches") as batch_op:
            batch_op.drop_column("released_at")

    if _column_exists("organizations", "deleted_at"):
        with op.batch_alter_table("organizations") as batch_op:
            batch_op.drop_column("deleted_at")

