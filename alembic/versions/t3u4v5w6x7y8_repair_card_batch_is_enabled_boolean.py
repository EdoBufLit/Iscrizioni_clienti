"""repair card_batches.is_enabled boolean type

Revision ID: t3u4v5w6x7y8
Revises: s1t2u3v4w5x6
Create Date: 2026-02-27 21:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "t3u4v5w6x7y8"
down_revision: Union[str, Sequence[str], None] = "s1t2u3v4w5x6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "card_batches"
_COLUMN = "is_enabled"
def _column_info(table_name: str, column_name: str) -> dict | None:
    try:
        columns = sa.inspect(op.get_bind()).get_columns(table_name)
    except Exception:
        return None
    for col in columns:
        if col["name"] == column_name:
            return col
    return None


def _is_boolean_type(column_info: dict | None) -> bool:
    if not column_info:
        return False
    return isinstance(column_info["type"], sa.Boolean)


def _sqlite_or_generic_truthy_backfill() -> None:
    op.get_bind().execute(
        sa.text(
            f"""
            UPDATE {_TABLE}
               SET {_COLUMN} = CASE
                   WHEN {_COLUMN} IS NULL THEN 1
                   WHEN lower(trim(CAST({_COLUMN} AS TEXT))) IN ('1', 'true', 't', 'yes', 'y', 'on') THEN 1
                   ELSE 0
               END
            """
        )
    )


def upgrade() -> None:
    bind = op.get_bind()
    column = _column_info(_TABLE, _COLUMN)
    if column is None:
        return

    dialect = bind.dialect.name

    if dialect == "postgresql":
        bind.execute(
            sa.text(
                f"ALTER TABLE {_TABLE} ALTER COLUMN {_COLUMN} DROP DEFAULT"
            )
        )
        if _is_boolean_type(column):
            bind.execute(
                sa.text(
                    f"""
                    UPDATE {_TABLE}
                       SET {_COLUMN} = TRUE
                     WHERE {_COLUMN} IS NULL
                    """
                )
            )
        else:
            bind.execute(
                sa.text(
                    f"""
                    ALTER TABLE {_TABLE}
                    ALTER COLUMN {_COLUMN} TYPE boolean
                    USING (
                        CASE
                            WHEN {_COLUMN} IS NULL THEN TRUE
                            WHEN lower(trim(CAST({_COLUMN} AS text))) IN ('1', 'true', 't', 'yes', 'y', 'on') THEN TRUE
                            ELSE FALSE
                        END
                    )
                    """
                )
            )
        bind.execute(
            sa.text(
                f"ALTER TABLE {_TABLE} ALTER COLUMN {_COLUMN} SET DEFAULT TRUE"
            )
        )
        bind.execute(
            sa.text(
                f"ALTER TABLE {_TABLE} ALTER COLUMN {_COLUMN} SET NOT NULL"
            )
        )
        return

    if not _is_boolean_type(column):
        _sqlite_or_generic_truthy_backfill()
        with op.batch_alter_table(_TABLE) as batch_op:
            batch_op.alter_column(
                _COLUMN,
                existing_type=column["type"],
                type_=sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
        return

    bind.execute(
        sa.text(
            f"""
            UPDATE {_TABLE}
               SET {_COLUMN} = 1
             WHERE {_COLUMN} IS NULL
            """
        )
    )
    with op.batch_alter_table(_TABLE) as batch_op:
        batch_op.alter_column(
            _COLUMN,
            existing_type=column["type"],
            nullable=False,
            server_default=sa.true(),
        )


def downgrade() -> None:
    bind = op.get_bind()
    column = _column_info(_TABLE, _COLUMN)
    if column is None:
        return

    dialect = bind.dialect.name

    if dialect == "postgresql":
        bind.execute(
            sa.text(
                f"ALTER TABLE {_TABLE} ALTER COLUMN {_COLUMN} DROP DEFAULT"
            )
        )
        if _is_boolean_type(column):
            bind.execute(
                sa.text(
                    f"""
                    ALTER TABLE {_TABLE}
                    ALTER COLUMN {_COLUMN} TYPE integer
                    USING (CASE WHEN {_COLUMN} IS TRUE THEN 1 ELSE 0 END)
                    """
                )
            )
        bind.execute(
            sa.text(
                f"ALTER TABLE {_TABLE} ALTER COLUMN {_COLUMN} SET DEFAULT 1"
            )
        )
        bind.execute(
            sa.text(
                f"ALTER TABLE {_TABLE} ALTER COLUMN {_COLUMN} SET NOT NULL"
            )
        )
        return

    if _is_boolean_type(column):
        with op.batch_alter_table(_TABLE) as batch_op:
            batch_op.alter_column(
                _COLUMN,
                existing_type=column["type"],
                type_=sa.Integer(),
                nullable=False,
                server_default=sa.text("1"),
            )
