"""add referrals table and reward metadata

Revision ID: b1c2d3e4f5a6
Revises: aa1b2c3d4e5f
Create Date: 2026-03-05 20:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "aa1b2c3d4e5f"
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


def _create_referrals_table() -> None:
    if _table_exists("referrals"):
        return

    op.create_table(
        "referrals",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("referrer_org_id", sa.Integer(), nullable=False),
        sa.Column("application_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("rewarded_at", sa.DateTime(), nullable=True),
        sa.Column("reward_code", sa.String(), nullable=True),
        sa.Column("reward_title", sa.String(), nullable=True),
        sa.Column("reward_description", sa.Text(), nullable=True),
        sa.Column("reward_delivery_timing", sa.String(), nullable=True),
        sa.Column("super_admin_notified_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["referrer_org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["application_id"], ["affiliation_applications.id"]),
        sa.UniqueConstraint("application_id", name="uq_referrals_application_id"),
    )


def _create_indexes() -> None:
    indexes: list[tuple[str, str, list[str], bool]] = [
        ("ix_referrals_referrer_org_id", "referrals", ["referrer_org_id"], False),
        ("ix_referrals_application_id", "referrals", ["application_id"], True),
        ("ix_referrals_status", "referrals", ["status"], False),
        ("ix_referrals_created_at", "referrals", ["created_at"], False),
    ]
    for index_name, table_name, columns, unique in indexes:
        if _index_exists(table_name, index_name):
            continue
        op.create_index(index_name, table_name, columns, unique=unique)


def _drop_index_if_exists(table_name: str, index_name: str) -> None:
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)


def upgrade() -> None:
    _create_referrals_table()
    _create_indexes()


def downgrade() -> None:
    for index_name in [
        "ix_referrals_created_at",
        "ix_referrals_status",
        "ix_referrals_application_id",
        "ix_referrals_referrer_org_id",
    ]:
        _drop_index_if_exists("referrals", index_name)

    if _table_exists("referrals"):
        op.drop_table("referrals")
