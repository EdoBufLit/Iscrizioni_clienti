"""add_deleted_at_to_admin_users

Revision ID: 78de494c8cac
Revises: dc0dd11f634f
Create Date: 2026-01-31 13:51:57.406822

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '78de494c8cac'
down_revision: Union[str, Sequence[str], None] = 'dc0dd11f634f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('admin_users', sa.Column('deleted_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('admin_users', 'deleted_at')
