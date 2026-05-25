"""Add booking action tokens and org-level event series.

Revision ID: u6v7w8x9y0z1
Revises: t5u6v7w8x9y0
Create Date: 2026-05-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "u6v7w8x9y0z1"
down_revision: Union[str, Sequence[str], None] = "t5u6v7w8x9y0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "forms",
        sa.Column(
            "booking_dynamic_events_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column("bookings", sa.Column("customer_note", sa.Text(), nullable=True))
    op.add_column("bookings", sa.Column("customer_note_submitted_at", sa.DateTime(), nullable=True))
    op.add_column("bookings", sa.Column("customer_note_reviewed_at", sa.DateTime(), nullable=True))

    op.create_table(
        "booking_action_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("booking_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(op.f("ix_booking_action_tokens_id"), "booking_action_tokens", ["id"])
    op.create_index(op.f("ix_booking_action_tokens_booking_id"), "booking_action_tokens", ["booking_id"])
    op.create_index(op.f("ix_booking_action_tokens_action"), "booking_action_tokens", ["action"])
    op.create_index(op.f("ix_booking_action_tokens_token_hash"), "booking_action_tokens", ["token_hash"])
    op.create_index(op.f("ix_booking_action_tokens_expires_at"), "booking_action_tokens", ["expires_at"])
    op.create_index(op.f("ix_booking_action_tokens_used_at"), "booking_action_tokens", ["used_at"])
    op.create_index(op.f("ix_booking_action_tokens_created_at"), "booking_action_tokens", ["created_at"])

    op.create_table(
        "booking_event_series",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("association_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("recurrence_type", sa.String(), nullable=False, server_default="weekly"),
        sa.Column("weekday", sa.Integer(), nullable=True),
        sa.Column("event_date", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["association_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_booking_event_series_id"), "booking_event_series", ["id"])
    op.create_index(op.f("ix_booking_event_series_association_id"), "booking_event_series", ["association_id"])
    op.create_index(op.f("ix_booking_event_series_recurrence_type"), "booking_event_series", ["recurrence_type"])
    op.create_index(op.f("ix_booking_event_series_weekday"), "booking_event_series", ["weekday"])
    op.create_index(op.f("ix_booking_event_series_event_date"), "booking_event_series", ["event_date"])
    op.create_index(op.f("ix_booking_event_series_is_active"), "booking_event_series", ["is_active"])
    op.create_index(op.f("ix_booking_event_series_created_at"), "booking_event_series", ["created_at"])
    op.create_index(
        "ix_booking_event_series_org_active_weekday",
        "booking_event_series",
        ["association_id", "is_active", "weekday"],
    )
    op.create_index(
        "ix_booking_event_series_org_active_date",
        "booking_event_series",
        ["association_id", "is_active", "event_date"],
    )

    op.create_table(
        "booking_event_time_slots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("series_id", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["series_id"], ["booking_event_series.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_booking_event_time_slots_id"), "booking_event_time_slots", ["id"])
    op.create_index(op.f("ix_booking_event_time_slots_series_id"), "booking_event_time_slots", ["series_id"])
    op.create_index(op.f("ix_booking_event_time_slots_start_time"), "booking_event_time_slots", ["start_time"])
    op.create_index(op.f("ix_booking_event_time_slots_is_active"), "booking_event_time_slots", ["is_active"])
    op.create_index(op.f("ix_booking_event_time_slots_sort_order"), "booking_event_time_slots", ["sort_order"])
    op.create_index(op.f("ix_booking_event_time_slots_created_at"), "booking_event_time_slots", ["created_at"])


def downgrade() -> None:
    op.drop_index(op.f("ix_booking_event_time_slots_created_at"), table_name="booking_event_time_slots")
    op.drop_index(op.f("ix_booking_event_time_slots_sort_order"), table_name="booking_event_time_slots")
    op.drop_index(op.f("ix_booking_event_time_slots_is_active"), table_name="booking_event_time_slots")
    op.drop_index(op.f("ix_booking_event_time_slots_start_time"), table_name="booking_event_time_slots")
    op.drop_index(op.f("ix_booking_event_time_slots_series_id"), table_name="booking_event_time_slots")
    op.drop_index(op.f("ix_booking_event_time_slots_id"), table_name="booking_event_time_slots")
    op.drop_table("booking_event_time_slots")

    op.drop_index("ix_booking_event_series_org_active_date", table_name="booking_event_series")
    op.drop_index("ix_booking_event_series_org_active_weekday", table_name="booking_event_series")
    op.drop_index(op.f("ix_booking_event_series_created_at"), table_name="booking_event_series")
    op.drop_index(op.f("ix_booking_event_series_is_active"), table_name="booking_event_series")
    op.drop_index(op.f("ix_booking_event_series_event_date"), table_name="booking_event_series")
    op.drop_index(op.f("ix_booking_event_series_weekday"), table_name="booking_event_series")
    op.drop_index(op.f("ix_booking_event_series_recurrence_type"), table_name="booking_event_series")
    op.drop_index(op.f("ix_booking_event_series_association_id"), table_name="booking_event_series")
    op.drop_index(op.f("ix_booking_event_series_id"), table_name="booking_event_series")
    op.drop_table("booking_event_series")

    op.drop_index(op.f("ix_booking_action_tokens_created_at"), table_name="booking_action_tokens")
    op.drop_index(op.f("ix_booking_action_tokens_used_at"), table_name="booking_action_tokens")
    op.drop_index(op.f("ix_booking_action_tokens_expires_at"), table_name="booking_action_tokens")
    op.drop_index(op.f("ix_booking_action_tokens_token_hash"), table_name="booking_action_tokens")
    op.drop_index(op.f("ix_booking_action_tokens_action"), table_name="booking_action_tokens")
    op.drop_index(op.f("ix_booking_action_tokens_booking_id"), table_name="booking_action_tokens")
    op.drop_index(op.f("ix_booking_action_tokens_id"), table_name="booking_action_tokens")
    op.drop_table("booking_action_tokens")

    op.drop_column("bookings", "customer_note_reviewed_at")
    op.drop_column("bookings", "customer_note_submitted_at")
    op.drop_column("bookings", "customer_note")
    op.drop_column("forms", "booking_dynamic_events_enabled")
