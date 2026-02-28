"""Repair member birth fields when skipped in production.

Revision ID: w6x7y8z9a0b1
Revises: v5w6x7y8z9a0
Create Date: 2026-02-28 23:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "w6x7y8z9a0b1"
down_revision: Union[str, Sequence[str], None] = "v5w6x7y8z9a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {col["name"] for col in inspector.get_columns(table_name)}


def upgrade() -> None:
    existing = _column_names("members")

    if "birth_date" not in existing:
        op.add_column("members", sa.Column("birth_date", sa.Date(), nullable=True))
    if "birth_place" not in existing:
        op.add_column("members", sa.Column("birth_place", sa.String(), nullable=True))
    if "birth_place_code" not in existing:
        op.add_column(
            "members", sa.Column("birth_place_code", sa.String(), nullable=True)
        )
    if "gender" not in existing:
        op.add_column("members", sa.Column("gender", sa.String(), nullable=True))


def downgrade() -> None:
    existing = _column_names("members")

    if "gender" in existing:
        op.drop_column("members", "gender")
    if "birth_place_code" in existing:
        op.drop_column("members", "birth_place_code")
    if "birth_place" in existing:
        op.drop_column("members", "birth_place")
    if "birth_date" in existing:
        op.drop_column("members", "birth_date")
