"""add member password reset token type

Revision ID: p7q8r9s0t1u2
Revises: o4p5q6r7s8t9
Create Date: 2026-04-28 14:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "p7q8r9s0t1u2"
down_revision = "o4p5q6r7s8t9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect_name = (bind.dialect.name or "").lower()

    if dialect_name == "postgresql":
        op.execute("ALTER TYPE tokentype ADD VALUE IF NOT EXISTS 'PASSWORD_RESET'")


def downgrade() -> None:
    return None
