"""Add booking admin confirmation email settings.

Revision ID: x9y0z1a2b3c4
Revises: w8x9y0z1a2b3
Create Date: 2026-05-26
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "x9y0z1a2b3c4"
down_revision: Union[str, Sequence[str], None] = "w8x9y0z1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "forms",
        sa.Column(
            "booking_admin_confirmation_email_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "forms",
        sa.Column("booking_admin_confirmation_email_subject", sa.String(), nullable=True),
    )
    op.add_column(
        "forms",
        sa.Column("booking_admin_confirmation_email_body", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("forms", "booking_admin_confirmation_email_body")
    op.drop_column("forms", "booking_admin_confirmation_email_subject")
    op.drop_column("forms", "booking_admin_confirmation_email_enabled")
