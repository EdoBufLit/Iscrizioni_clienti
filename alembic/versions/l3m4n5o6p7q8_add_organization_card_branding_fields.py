"""add organization card branding fields

Revision ID: l3m4n5o6p7q8
Revises: k2l3m4n5o6p7
Create Date: 2026-02-19 18:05:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "l3m4n5o6p7q8"
down_revision: Union[str, Sequence[str], None] = "k2l3m4n5o6p7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "organizations"
_NEW_COLUMNS = (
    ("club_display_name", sa.String()),
    ("card_email_subject", sa.String()),
    ("card_logo_url", sa.String()),
)


def _inspector():
    return sa.inspect(op.get_bind())


def _column_exists(table_name: str, column_name: str) -> bool:
    try:
        columns = _inspector().get_columns(table_name)
    except Exception:
        return False
    return any(col["name"] == column_name for col in columns)


def upgrade() -> None:
    with op.batch_alter_table(_TABLE) as batch_op:
        for col_name, col_type in _NEW_COLUMNS:
            if not _column_exists(_TABLE, col_name):
                batch_op.add_column(sa.Column(col_name, col_type, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table(_TABLE) as batch_op:
        for col_name, _ in reversed(_NEW_COLUMNS):
            if _column_exists(_TABLE, col_name):
                batch_op.drop_column(col_name)
