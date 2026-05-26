"""Add card style builder settings.

Revision ID: y0z1a2b3c4d5
Revises: x9y0z1a2b3c4
Create Date: 2026-05-26 20:38:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "y0z1a2b3c4d5"
down_revision = "x9y0z1a2b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("card_style_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "card_style_json")
