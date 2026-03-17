"""merge multiple heads

Revision ID: b61cfaf5fcf1
Revises: 9c0d1e2f3a4, o1p2q3r4s5t6
Create Date: 2026-03-17 14:20:37.518548

"""
from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = 'b61cfaf5fcf1'
down_revision: Union[str, Sequence[str], None] = ('9c0d1e2f3a4', 'o1p2q3r4s5t6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
