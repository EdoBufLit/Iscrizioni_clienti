"""Add booking availability rules.

Revision ID: z1a2b3c4d5e6
Revises: y0z1a2b3c4d5
Create Date: 2026-05-28 16:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "z1a2b3c4d5e6"
down_revision = "y0z1a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "booking_event_series",
        sa.Column("is_closed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index(
        op.f("ix_booking_event_series_is_closed"),
        "booking_event_series",
        ["is_closed"],
    )
    op.add_column(
        "forms",
        sa.Column("booking_availability_mode", sa.String(), nullable=False, server_default="all"),
    )
    op.add_column("forms", sa.Column("booking_event_series_ids", sa.JSON(), nullable=True))
    op.add_column(
        "forms",
        sa.Column("font_preset", sa.String(), nullable=False, server_default="classic"),
    )


def downgrade() -> None:
    op.drop_column("forms", "font_preset")
    op.drop_column("forms", "booking_event_series_ids")
    op.drop_column("forms", "booking_availability_mode")
    op.drop_index(op.f("ix_booking_event_series_is_closed"), table_name="booking_event_series")
    op.drop_column("booking_event_series", "is_closed")
