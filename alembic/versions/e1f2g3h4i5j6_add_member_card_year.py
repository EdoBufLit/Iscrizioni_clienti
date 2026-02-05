"""add member card_year for annual card validity

Revision ID: e1f2g3h4i5j6
Revises: d3e4f5g6h7i8
Create Date: 2026-02-05 23:35:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "e1f2g3h4i5j6"
down_revision = "d3e4f5g6h7i8"
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    try:
        columns = inspector.get_columns(table_name)
    except Exception:
        return False
    return any(col["name"] == column_name for col in columns)


def upgrade():
    if not _column_exists("members", "card_year"):
        with op.batch_alter_table("members") as batch_op:
            batch_op.add_column(sa.Column("card_year", sa.Integer(), nullable=True))

    # Backfill from existing join date where possible.
    op.execute(
        """
        UPDATE members
           SET card_year = CAST(strftime('%Y', joined_at) AS INTEGER)
         WHERE card_no IS NOT NULL
           AND card_year IS NULL
           AND joined_at IS NOT NULL
        """
    )

    # Legacy rows with card_no but no joined_at get current year.
    op.execute(
        """
        UPDATE members
           SET card_year = CAST(strftime('%Y', 'now') AS INTEGER)
         WHERE card_no IS NOT NULL
           AND card_year IS NULL
        """
    )


def downgrade():
    if _column_exists("members", "card_year"):
        with op.batch_alter_table("members") as batch_op:
            batch_op.drop_column("card_year")
