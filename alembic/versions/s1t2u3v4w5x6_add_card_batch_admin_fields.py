"""add card batch admin management fields

Revision ID: s1t2u3v4w5x6
Revises: r8s9t0u1v2w3
Create Date: 2026-02-27 20:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "s1t2u3v4w5x6"
down_revision: Union[str, Sequence[str], None] = "r8s9t0u1v2w3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "card_batches"
_IS_ENABLED = "is_enabled"
_NOTES = "notes"


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
        if not _column_exists(_TABLE, _IS_ENABLED):
            batch_op.add_column(sa.Column(_IS_ENABLED, sa.Boolean(), nullable=True, server_default=sa.text("1")))
        if not _column_exists(_TABLE, _NOTES):
            batch_op.add_column(sa.Column(_NOTES, sa.Text(), nullable=True))

    bind = op.get_bind()
    bind.execute(
        sa.text(
            f"""
            UPDATE {_TABLE}
               SET {_IS_ENABLED} = 1
             WHERE {_IS_ENABLED} IS NULL
            """
        )
    )

    with op.batch_alter_table(_TABLE) as batch_op:
        if _column_exists(_TABLE, _IS_ENABLED):
            batch_op.alter_column(
                _IS_ENABLED,
                existing_type=sa.Boolean(),
                nullable=False,
                server_default=sa.text("1"),
            )


def downgrade() -> None:
    with op.batch_alter_table(_TABLE) as batch_op:
        if _column_exists(_TABLE, _NOTES):
            batch_op.drop_column(_NOTES)
        if _column_exists(_TABLE, _IS_ENABLED):
            batch_op.drop_column(_IS_ENABLED)
