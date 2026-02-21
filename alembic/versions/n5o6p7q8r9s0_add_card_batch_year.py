"""add card_batches.year for annual multi-batch allocation

Revision ID: n5o6p7q8r9s0
Revises: m4n5o6p7q8r9
Create Date: 2026-02-21 10:30:00.000000
"""

from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "n5o6p7q8r9s0"
down_revision: Union[str, Sequence[str], None] = "m4n5o6p7q8r9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "card_batches"
_YEAR_COLUMN = "year"
_INDEX_ORG_YEAR_RELEASED = "ix_card_batches_org_year_released"


def _inspector():
    return sa.inspect(op.get_bind())


def _column_exists(table_name: str, column_name: str) -> bool:
    try:
        columns = _inspector().get_columns(table_name)
    except Exception:
        return False
    return any(col["name"] == column_name for col in columns)


def _index_exists(table_name: str, index_name: str) -> bool:
    try:
        indexes = _inspector().get_indexes(table_name)
    except Exception:
        return False
    return any(idx.get("name") == index_name for idx in indexes)


def upgrade() -> None:
    if not _column_exists(_TABLE, _YEAR_COLUMN):
        with op.batch_alter_table(_TABLE) as batch_op:
            batch_op.add_column(sa.Column(_YEAR_COLUMN, sa.Integer(), nullable=True))

    current_year = datetime.utcnow().year
    op.execute(
        sa.text(
            """
            UPDATE card_batches
               SET year = :current_year
             WHERE year IS NULL
            """
        ),
        {"current_year": current_year},
    )

    with op.batch_alter_table(_TABLE) as batch_op:
        batch_op.alter_column(_YEAR_COLUMN, existing_type=sa.Integer(), nullable=False)

    if not _index_exists(_TABLE, _INDEX_ORG_YEAR_RELEASED):
        op.create_index(
            _INDEX_ORG_YEAR_RELEASED,
            _TABLE,
            ["org_id", "year", "released_at"],
        )


def downgrade() -> None:
    if _index_exists(_TABLE, _INDEX_ORG_YEAR_RELEASED):
        op.drop_index(_INDEX_ORG_YEAR_RELEASED, table_name=_TABLE)

    if _column_exists(_TABLE, _YEAR_COLUMN):
        with op.batch_alter_table(_TABLE) as batch_op:
            batch_op.drop_column(_YEAR_COLUMN)
