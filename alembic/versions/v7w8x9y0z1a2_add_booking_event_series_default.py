"""Add default flag to booking event series.

Revision ID: v7w8x9y0z1a2
Revises: u6v7w8x9y0z1
Create Date: 2026-05-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "v7w8x9y0z1a2"
down_revision: Union[str, Sequence[str], None] = "u6v7w8x9y0z1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "booking_event_series",
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index(
        op.f("ix_booking_event_series_is_default"),
        "booking_event_series",
        ["is_default"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_booking_event_series_is_default"), table_name="booking_event_series")
    op.drop_column("booking_event_series", "is_default")
