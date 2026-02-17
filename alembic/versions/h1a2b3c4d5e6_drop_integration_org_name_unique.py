"""drop unique org+name on integration api keys

Revision ID: h1a2b3c4d5e6
Revises: f7a8b9c0d1e2
Create Date: 2026-02-17 15:20:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "h1a2b3c4d5e6"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None

_TABLE_NAME = "integration_api_keys"
_UNIQUE_NAME = "uix_integration_api_keys_org_name"


def _table_exists(table_name: str) -> bool:
    return table_name in inspect(op.get_bind()).get_table_names()


def _unique_exists(table_name: str, unique_name: str) -> bool:
    try:
        uniques = inspect(op.get_bind()).get_unique_constraints(table_name)
    except Exception:
        return False
    return any(uniq.get("name") == unique_name for uniq in uniques)


def upgrade():
    if not _table_exists(_TABLE_NAME):
        return
    if not _unique_exists(_TABLE_NAME, _UNIQUE_NAME):
        return

    with op.batch_alter_table(_TABLE_NAME) as batch_op:
        batch_op.drop_constraint(_UNIQUE_NAME, type_="unique")


def downgrade():
    if not _table_exists(_TABLE_NAME):
        return
    if _unique_exists(_TABLE_NAME, _UNIQUE_NAME):
        return

    with op.batch_alter_table(_TABLE_NAME) as batch_op:
        batch_op.create_unique_constraint(_UNIQUE_NAME, ["org_id", "name"])
