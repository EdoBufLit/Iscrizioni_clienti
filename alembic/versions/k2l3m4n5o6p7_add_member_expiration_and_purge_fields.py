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


def _foreign_key_exists(table_name: str, constrained_columns: list[str]) -> bool:
    try:
        foreign_keys = _inspector().get_foreign_keys(table_name)
    except Exception:
        return False
    expected = list(constrained_columns)
    return any(foreign_key.get("constrained_columns") == expected for foreign_key in foreign_keys)


def upgrade() -> None:
    # These soft-delete fields historically existed only through the legacy
    # create_all/bootstrap path. Add them here as well so an Alembic-only fresh
    # install has the same Member schema before later migrations query it.
    needs_deleted_by_fk = not _foreign_key_exists(
        _TABLE, ["deleted_by_admin_id"]
    )
    with op.batch_alter_table(_TABLE) as batch_op:
        if not _column_exists(_TABLE, "expired_at"):
            batch_op.add_column(sa.Column("expired_at", sa.DateTime(), nullable=True))
        if not _column_exists(_TABLE, "purged_at"):
            batch_op.add_column(sa.Column("purged_at", sa.DateTime(), nullable=True))
        if not _column_exists(_TABLE, "deleted_at"):
            batch_op.add_column(sa.Column("deleted_at", sa.DateTime(), nullable=True))
        if not _column_exists(_TABLE, "deleted_by_admin_id"):
            batch_op.add_column(
                sa.Column("deleted_by_admin_id", sa.Integer(), nullable=True)
            )
        if needs_deleted_by_fk:
            batch_op.create_foreign_key(
                "fk_members_deleted_by_admin_id_admin_users",
                "admin_users",
                ["deleted_by_admin_id"],
                ["id"],
            )

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

    # Keep the soft-delete fields on downgrade for compatibility with databases
    # where the legacy bootstrap created them before this migration was stamped.
