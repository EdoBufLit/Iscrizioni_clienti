"""merge whatsapp automation heads

Revision ID: 47b20c34c33e
Revises: c7d8e9f0a1b2, e6f7a8b9c0d1
Create Date: 2026-03-19 21:41:49.491821

"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = '47b20c34c33e'
down_revision: Union[str, Sequence[str], None] = ('c7d8e9f0a1b2', 'e6f7a8b9c0d1')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
