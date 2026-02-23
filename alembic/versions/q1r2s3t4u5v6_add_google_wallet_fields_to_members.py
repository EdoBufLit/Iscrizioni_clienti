"""add google wallet fields to members

Revision ID: q1r2s3t4u5v6
Revises: p6q7r8s9t0u1
Create Date: 2026-02-23 16:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "q1r2s3t4u5v6"
down_revision: Union[str, Sequence[str], None] = "p6q7r8s9t0u1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "members"
_COLUMNS: list[tuple[str, sa.types.TypeEngine]] = [
    ("google_wallet_class_id", sa.Text()),
    ("google_wallet_object_id", sa.Text()),
    ("google_wallet_added_at", sa.DateTime()),
    ("google_wallet_last_error", sa.Text()),
    ("google_wallet_last_synced_at", sa.DateTime()),
]


def _inspector():
    return sa.inspect(op.get_bind())


def _column_exists(table_name: str, column_name: str) -> bool:
    try:
        columns = _inspector().get_columns(table_name)
    except Exception:
        return False
    return any(col["name"] == column_name for col in columns)


def upgrade() -> None:
    for column_name, column_type in _COLUMNS:
        if _column_exists(_TABLE, column_name):
            continue
        with op.batch_alter_table(_TABLE) as batch_op:
            batch_op.add_column(sa.Column(column_name, column_type, nullable=True))


def downgrade() -> None:
    for column_name, _column_type in reversed(_COLUMNS):
        if not _column_exists(_TABLE, column_name):
            continue
        with op.batch_alter_table(_TABLE) as batch_op:
            batch_op.drop_column(column_name)
