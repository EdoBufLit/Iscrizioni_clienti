"""add member expiration/purge fields and card_year_deleted index

Revision ID: k2l3m4n5o6p7
Revises: j1k2l3m4n5o6
Create Date: 2026-02-19 15:45:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "k2l3m4n5o6p7"
down_revision: Union[str, Sequence[str], None] = "j1k2l3m4n5o6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "members"
_INDEX_CARD_YEAR_DELETED = "ix_members_card_year_deleted"


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
    with op.batch_alter_table(_TABLE) as batch_op:
        if not _column_exists(_TABLE, "expired_at"):
            batch_op.add_column(sa.Column("expired_at", sa.DateTime(), nullable=True))
        if not _column_exists(_TABLE, "purged_at"):
            batch_op.add_column(sa.Column("purged_at", sa.DateTime(), nullable=True))

    if not _index_exists(_TABLE, _INDEX_CARD_YEAR_DELETED):
        if _column_exists(_TABLE, "card_year") and _column_exists(_TABLE, "deleted_at"):
            op.create_index(
                _INDEX_CARD_YEAR_DELETED,
                _TABLE,
                ["card_year", "deleted_at"],
            )


def downgrade() -> None:
    if _index_exists(_TABLE, _INDEX_CARD_YEAR_DELETED):
        op.drop_index(_INDEX_CARD_YEAR_DELETED, table_name=_TABLE)

    with op.batch_alter_table(_TABLE) as batch_op:
        if _column_exists(_TABLE, "purged_at"):
            batch_op.drop_column("purged_at")
        if _column_exists(_TABLE, "expired_at"):
            batch_op.drop_column("expired_at")
