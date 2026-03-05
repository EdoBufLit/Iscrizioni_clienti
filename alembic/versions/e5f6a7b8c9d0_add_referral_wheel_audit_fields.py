"""add referral wheel audit fields

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-03-05 23:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    try:
        return table_name in set(_inspector().get_table_names())
    except Exception:
        return False


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    try:
        columns = _inspector().get_columns(table_name)
    except Exception:
        return False
    return any(column.get("name") == column_name for column in columns)


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    try:
        indexes = _inspector().get_indexes(table_name)
    except Exception:
        return False
    return any(index.get("name") == index_name for index in indexes)


def _json_type(bind) -> sa.types.TypeEngine:
    if (bind.dialect.name or "").lower() == "postgresql":
        from sqlalchemy.dialects.postgresql import JSONB

        return JSONB(astext_type=sa.Text())
    return sa.JSON()


def upgrade() -> None:
    if not _table_exists("referrals"):
        return

    bind = op.get_bind()

    if not _column_exists("referrals", "wheel_result"):
        op.add_column("referrals", sa.Column("wheel_result", _json_type(bind), nullable=True))

    if not _column_exists("referrals", "wheel_spun_at"):
        op.add_column("referrals", sa.Column("wheel_spun_at", sa.DateTime(), nullable=True))

    if not _column_exists("referrals", "wheel_spun_by_org_admin_id"):
        op.add_column(
            "referrals",
            sa.Column("wheel_spun_by_org_admin_id", sa.Integer(), nullable=True),
        )

    if not _index_exists("referrals", "ix_referrals_wheel_spun_by_org_admin_id"):
        op.create_index(
            "ix_referrals_wheel_spun_by_org_admin_id",
            "referrals",
            ["wheel_spun_by_org_admin_id"],
            unique=False,
        )


def downgrade() -> None:
    if not _table_exists("referrals"):
        return

    if _index_exists("referrals", "ix_referrals_wheel_spun_by_org_admin_id"):
        op.drop_index("ix_referrals_wheel_spun_by_org_admin_id", table_name="referrals")

    if _column_exists("referrals", "wheel_spun_by_org_admin_id"):
        op.drop_column("referrals", "wheel_spun_by_org_admin_id")

    if _column_exists("referrals", "wheel_spun_at"):
        op.drop_column("referrals", "wheel_spun_at")

    if _column_exists("referrals", "wheel_result"):
        op.drop_column("referrals", "wheel_result")
