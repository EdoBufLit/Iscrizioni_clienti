"""add member external source fields and integration api keys

Revision ID: f7a8b9c0d1e2
Revises: a9b8c7d6e5f4
Create Date: 2026-02-17 16:10:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "f7a8b9c0d1e2"
down_revision = "a9b8c7d6e5f4"
branch_labels = None
depends_on = None

_MEMBERS_TABLE = "members"
_INTEGRATION_KEYS_TABLE = "integration_api_keys"
_MEMBER_SOURCE_UNIQUE = "uix_member_external_source"
_INTEGRATION_ORG_NAME_UNIQUE = "uix_integration_api_keys_org_name"
_INTEGRATION_KEY_HASH_UNIQUE = "uq_integration_api_keys_key_hash"


def _inspector():
    return inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in _inspector().get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    try:
        columns = _inspector().get_columns(table_name)
    except Exception:
        return False
    return any(col["name"] == column_name for col in columns)


def _unique_exists(table_name: str, unique_name: str) -> bool:
    try:
        uniques = _inspector().get_unique_constraints(table_name)
    except Exception:
        return False
    return any(uniq.get("name") == unique_name for uniq in uniques)


def _index_exists(table_name: str, index_name: str) -> bool:
    try:
        indexes = _inspector().get_indexes(table_name)
    except Exception:
        return False
    return any(idx.get("name") == index_name for idx in indexes)


def upgrade():
    if not _column_exists(_MEMBERS_TABLE, "signup_source"):
        with op.batch_alter_table(_MEMBERS_TABLE) as batch_op:
            batch_op.add_column(sa.Column("signup_source", sa.String(), nullable=True))

    if not _column_exists(_MEMBERS_TABLE, "external_customer_id"):
        with op.batch_alter_table(_MEMBERS_TABLE) as batch_op:
            batch_op.add_column(sa.Column("external_customer_id", sa.String(), nullable=True))

    if not _unique_exists(_MEMBERS_TABLE, _MEMBER_SOURCE_UNIQUE):
        with op.batch_alter_table(_MEMBERS_TABLE) as batch_op:
            batch_op.create_unique_constraint(
                _MEMBER_SOURCE_UNIQUE,
                ["org_id", "signup_source", "external_customer_id"],
            )

    if not _table_exists(_INTEGRATION_KEYS_TABLE):
        op.create_table(
            _INTEGRATION_KEYS_TABLE,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("org_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("key_hash", sa.String(), nullable=False),
            sa.Column("scopes", sa.JSON(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("last_used_at", sa.DateTime(), nullable=True),
            sa.Column("last_used_ip", sa.String(), nullable=True),
            sa.Column("last_used_user_agent", sa.String(), nullable=True),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
            sa.UniqueConstraint("org_id", "name", name=_INTEGRATION_ORG_NAME_UNIQUE),
            sa.UniqueConstraint("key_hash", name=_INTEGRATION_KEY_HASH_UNIQUE),
        )
    else:
        with op.batch_alter_table(_INTEGRATION_KEYS_TABLE) as batch_op:
            if not _column_exists(_INTEGRATION_KEYS_TABLE, "org_id"):
                batch_op.add_column(sa.Column("org_id", sa.Integer(), nullable=False))
            if not _column_exists(_INTEGRATION_KEYS_TABLE, "name"):
                batch_op.add_column(sa.Column("name", sa.String(), nullable=False))
            if not _column_exists(_INTEGRATION_KEYS_TABLE, "key_hash"):
                batch_op.add_column(sa.Column("key_hash", sa.String(), nullable=False))
            if not _column_exists(_INTEGRATION_KEYS_TABLE, "scopes"):
                batch_op.add_column(
                    sa.Column("scopes", sa.JSON(), nullable=False, server_default="[]")
                )
            if not _column_exists(_INTEGRATION_KEYS_TABLE, "is_active"):
                batch_op.add_column(
                    sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1")
                )
            if not _column_exists(_INTEGRATION_KEYS_TABLE, "created_at"):
                batch_op.add_column(sa.Column("created_at", sa.DateTime(), nullable=False))
            if not _column_exists(_INTEGRATION_KEYS_TABLE, "last_used_at"):
                batch_op.add_column(sa.Column("last_used_at", sa.DateTime(), nullable=True))
            if not _column_exists(_INTEGRATION_KEYS_TABLE, "last_used_ip"):
                batch_op.add_column(sa.Column("last_used_ip", sa.String(), nullable=True))
            if not _column_exists(_INTEGRATION_KEYS_TABLE, "last_used_user_agent"):
                batch_op.add_column(
                    sa.Column("last_used_user_agent", sa.String(), nullable=True)
                )

        if not _unique_exists(_INTEGRATION_KEYS_TABLE, _INTEGRATION_ORG_NAME_UNIQUE):
            with op.batch_alter_table(_INTEGRATION_KEYS_TABLE) as batch_op:
                batch_op.create_unique_constraint(
                    _INTEGRATION_ORG_NAME_UNIQUE,
                    ["org_id", "name"],
                )

        if not _unique_exists(_INTEGRATION_KEYS_TABLE, _INTEGRATION_KEY_HASH_UNIQUE):
            with op.batch_alter_table(_INTEGRATION_KEYS_TABLE) as batch_op:
                batch_op.create_unique_constraint(
                    _INTEGRATION_KEY_HASH_UNIQUE,
                    ["key_hash"],
                )

    if not _index_exists(_INTEGRATION_KEYS_TABLE, "ix_integration_api_keys_org_id"):
        op.create_index(
            "ix_integration_api_keys_org_id",
            _INTEGRATION_KEYS_TABLE,
            ["org_id"],
        )
    if not _index_exists(_INTEGRATION_KEYS_TABLE, "ix_integration_api_keys_key_hash"):
        op.create_index(
            "ix_integration_api_keys_key_hash",
            _INTEGRATION_KEYS_TABLE,
            ["key_hash"],
        )


def downgrade():
    if _index_exists(_INTEGRATION_KEYS_TABLE, "ix_integration_api_keys_key_hash"):
        op.drop_index("ix_integration_api_keys_key_hash", table_name=_INTEGRATION_KEYS_TABLE)
    if _index_exists(_INTEGRATION_KEYS_TABLE, "ix_integration_api_keys_org_id"):
        op.drop_index("ix_integration_api_keys_org_id", table_name=_INTEGRATION_KEYS_TABLE)

    if _table_exists(_INTEGRATION_KEYS_TABLE):
        op.drop_table(_INTEGRATION_KEYS_TABLE)

    if _unique_exists(_MEMBERS_TABLE, _MEMBER_SOURCE_UNIQUE):
        with op.batch_alter_table(_MEMBERS_TABLE) as batch_op:
            batch_op.drop_constraint(_MEMBER_SOURCE_UNIQUE, type_="unique")

    if _column_exists(_MEMBERS_TABLE, "external_customer_id"):
        with op.batch_alter_table(_MEMBERS_TABLE) as batch_op:
            batch_op.drop_column("external_customer_id")

    if _column_exists(_MEMBERS_TABLE, "signup_source"):
        with op.batch_alter_table(_MEMBERS_TABLE) as batch_op:
            batch_op.drop_column("signup_source")
