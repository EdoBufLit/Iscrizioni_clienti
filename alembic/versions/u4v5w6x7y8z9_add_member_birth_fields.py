"""add member birth fields

Revision ID: u4v5w6x7y8z9
Revises: t3u4v5w6x7y8
Create Date: 2026-02-28 18:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "u4v5w6x7y8z9"
down_revision: Union[str, Sequence[str], None] = "t3u4v5w6x7y8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("members") as batch_op:
        batch_op.add_column(sa.Column("birth_date", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("birth_place", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("birth_place_code", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("gender", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("members") as batch_op:
        batch_op.drop_column("gender")
        batch_op.drop_column("birth_place_code")
        batch_op.drop_column("birth_place")
        batch_op.drop_column("birth_date")
