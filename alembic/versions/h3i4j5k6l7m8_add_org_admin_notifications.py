"""add org admin notifications

Revision ID: h3i4j5k6l7m8
Revises: g2h3i4j5k6l7
Create Date: 2026-03-07 12:15:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "h3i4j5k6l7m8"
down_revision: Union[str, Sequence[str], None] = "g2h3i4j5k6l7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    try:
        return table_name in set(_inspector().get_table_names())
    except Exception:
        return False


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    try:
        indexes = _inspector().get_indexes(table_name)
    except Exception:
        return False
    return any(index.get("name") == index_name for index in indexes)


def upgrade() -> None:
    if not _table_exists("org_admin_notifications"):
        op.create_table(
            "org_admin_notifications",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("admin_user_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=False),
            sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("type", sa.String(), nullable=False),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("href", sa.String(), nullable=False),
            sa.Column(
                "is_read",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column("read_at", sa.DateTime(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )

    index_specs = [
        ("ix_org_admin_notifications_admin_user_id", ["admin_user_id"]),
        ("ix_org_admin_notifications_org_id", ["org_id"]),
        ("ix_org_admin_notifications_type", ["type"]),
        ("ix_org_admin_notifications_is_read", ["is_read"]),
        ("ix_org_admin_notifications_created_at", ["created_at"]),
    ]
    for index_name, columns in index_specs:
        if not _index_exists("org_admin_notifications", index_name):
            op.create_index(index_name, "org_admin_notifications", columns, unique=False)


def downgrade() -> None:
    if not _table_exists("org_admin_notifications"):
        return

    for index_name in [
        "ix_org_admin_notifications_created_at",
        "ix_org_admin_notifications_is_read",
        "ix_org_admin_notifications_type",
        "ix_org_admin_notifications_org_id",
        "ix_org_admin_notifications_admin_user_id",
    ]:
        op.drop_index(index_name, table_name="org_admin_notifications")
    op.drop_table("org_admin_notifications")
