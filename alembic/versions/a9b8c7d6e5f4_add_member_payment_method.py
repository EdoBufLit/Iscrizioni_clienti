"""add members.payment_method

Revision ID: a9b8c7d6e5f4
Revises: f4a5b6c7d8e9
Create Date: 2026-02-07 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "a9b8c7d6e5f4"
down_revision = "f4a5b6c7d8e9"
branch_labels = None
depends_on = None

_TABLE_NAME = "members"
_COLUMN_NAME = "payment_method"
_CHECK_NAME = "ck_members_payment_method"
_CHECK_SQL = "payment_method IN ('CASH','BONIFICO') OR payment_method IS NULL"


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    try:
        columns = inspector.get_columns(table_name)
    except Exception:
        return False
    return any(col["name"] == column_name for col in columns)


def _check_constraint_exists(table_name: str, check_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    try:
        checks = inspector.get_check_constraints(table_name)
    except Exception:
        return False
    return any(chk.get("name") == check_name for chk in checks)


def upgrade():
    bind = op.get_bind()
    dialect_name = bind.dialect.name

    if not _column_exists(_TABLE_NAME, _COLUMN_NAME):
        op.add_column(_TABLE_NAME, sa.Column(_COLUMN_NAME, sa.String(length=16), nullable=True))

    # SQLite often requires table rebuild for post-hoc constraints; enforce in app layer there.
    if dialect_name != "sqlite" and not _check_constraint_exists(_TABLE_NAME, _CHECK_NAME):
        op.create_check_constraint(_CHECK_NAME, _TABLE_NAME, _CHECK_SQL)


def downgrade():
    bind = op.get_bind()
    dialect_name = bind.dialect.name

    if dialect_name != "sqlite" and _check_constraint_exists(_TABLE_NAME, _CHECK_NAME):
        op.drop_constraint(_CHECK_NAME, _TABLE_NAME, type_="check")

    if _column_exists(_TABLE_NAME, _COLUMN_NAME):
        with op.batch_alter_table(_TABLE_NAME) as batch_op:
            batch_op.drop_column(_COLUMN_NAME)
