"""add form booking event details

Revision ID: q8r9s0t1u2v3
Revises: p7q8r9s0t1u2
Create Date: 2026-05-04 16:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "q8r9s0t1u2v3"
down_revision = "p7q8r9s0t1u2"
branch_labels = None
depends_on = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    with op.batch_alter_table("forms") as batch_op:
        if not _has_column("forms", "booking_event_date"):
            batch_op.add_column(sa.Column("booking_event_date", sa.Date(), nullable=True))
        if not _has_column("forms", "booking_event_time"):
            batch_op.add_column(sa.Column("booking_event_time", sa.String(), nullable=True))
        if not _has_column("forms", "booking_event_details"):
            batch_op.add_column(sa.Column("booking_event_details", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("forms") as batch_op:
        if _has_column("forms", "booking_event_details"):
            batch_op.drop_column("booking_event_details")
        if _has_column("forms", "booking_event_time"):
            batch_op.drop_column("booking_event_time")
        if _has_column("forms", "booking_event_date"):
            batch_op.drop_column("booking_event_date")
