"""add ingest rate limits and member card_email_sent_at

Revision ID: i7b8c9d0e1f2
Revises: h1a2b3c4d5e6
Create Date: 2026-02-17 21:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "i7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "h1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_MEMBERS_TABLE = "members"
_INGEST_RATE_LIMITS_TABLE = "ingest_rate_limits"
_INGEST_RATE_LIMITS_UNIQUE = "uix_ingest_rate_limits_org_ip"


def _inspector():
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in _inspector().get_table_names()


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


def _unique_exists(table_name: str, unique_name: str) -> bool:
    try:
        uniques = _inspector().get_unique_constraints(table_name)
    except Exception:
        return False
    return any(uniq.get("name") == unique_name for uniq in uniques)


def upgrade() -> None:
    if not _column_exists(_MEMBERS_TABLE, "card_email_sent_at"):
        with op.batch_alter_table(_MEMBERS_TABLE) as batch_op:
            batch_op.add_column(sa.Column("card_email_sent_at", sa.DateTime(), nullable=True))

    if not _table_exists(_INGEST_RATE_LIMITS_TABLE):
        op.create_table(
            _INGEST_RATE_LIMITS_TABLE,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("org_slug", sa.String(), nullable=False),
            sa.Column("client_ip", sa.String(), nullable=False),
            sa.Column("window_started_at", sa.DateTime(), nullable=False),
            sa.Column("request_count", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("org_slug", "client_ip", name=_INGEST_RATE_LIMITS_UNIQUE),
        )
    else:
        with op.batch_alter_table(_INGEST_RATE_LIMITS_TABLE) as batch_op:
            if not _column_exists(_INGEST_RATE_LIMITS_TABLE, "org_slug"):
                batch_op.add_column(sa.Column("org_slug", sa.String(), nullable=False))
            if not _column_exists(_INGEST_RATE_LIMITS_TABLE, "client_ip"):
                batch_op.add_column(sa.Column("client_ip", sa.String(), nullable=False))
            if not _column_exists(_INGEST_RATE_LIMITS_TABLE, "window_started_at"):
                batch_op.add_column(sa.Column("window_started_at", sa.DateTime(), nullable=False))
            if not _column_exists(_INGEST_RATE_LIMITS_TABLE, "request_count"):
                batch_op.add_column(
                    sa.Column("request_count", sa.Integer(), nullable=False, server_default="1")
                )
            if not _column_exists(_INGEST_RATE_LIMITS_TABLE, "created_at"):
                batch_op.add_column(sa.Column("created_at", sa.DateTime(), nullable=False))
            if not _column_exists(_INGEST_RATE_LIMITS_TABLE, "updated_at"):
                batch_op.add_column(sa.Column("updated_at", sa.DateTime(), nullable=False))

        if not _unique_exists(_INGEST_RATE_LIMITS_TABLE, _INGEST_RATE_LIMITS_UNIQUE):
            with op.batch_alter_table(_INGEST_RATE_LIMITS_TABLE) as batch_op:
                batch_op.create_unique_constraint(
                    _INGEST_RATE_LIMITS_UNIQUE,
                    ["org_slug", "client_ip"],
                )

    if not _index_exists(_INGEST_RATE_LIMITS_TABLE, "ix_ingest_rate_limits_org_slug"):
        op.create_index(
            "ix_ingest_rate_limits_org_slug",
            _INGEST_RATE_LIMITS_TABLE,
            ["org_slug"],
        )
    if not _index_exists(_INGEST_RATE_LIMITS_TABLE, "ix_ingest_rate_limits_client_ip"):
        op.create_index(
            "ix_ingest_rate_limits_client_ip",
            _INGEST_RATE_LIMITS_TABLE,
            ["client_ip"],
        )


def downgrade() -> None:
    if _index_exists(_INGEST_RATE_LIMITS_TABLE, "ix_ingest_rate_limits_client_ip"):
        op.drop_index("ix_ingest_rate_limits_client_ip", table_name=_INGEST_RATE_LIMITS_TABLE)
    if _index_exists(_INGEST_RATE_LIMITS_TABLE, "ix_ingest_rate_limits_org_slug"):
        op.drop_index("ix_ingest_rate_limits_org_slug", table_name=_INGEST_RATE_LIMITS_TABLE)

    if _table_exists(_INGEST_RATE_LIMITS_TABLE):
        op.drop_table(_INGEST_RATE_LIMITS_TABLE)

    if _column_exists(_MEMBERS_TABLE, "card_email_sent_at"):
        with op.batch_alter_table(_MEMBERS_TABLE) as batch_op:
            batch_op.drop_column("card_email_sent_at")
