"""add bookings module on top of forms

Revision ID: 1c2d3e4f5a6b
Revises: 0b1c2d3e4f5a
Create Date: 2026-03-10 23:45:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "1c2d3e4f5a6b"
down_revision: Union[str, Sequence[str], None] = "0b1c2d3e4f5a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_names(bind) -> set[str]:
    return set(sa.inspect(bind).get_table_names())


def _column_names(bind, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(bind, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    tables = _table_names(bind)

    if "forms" in tables:
        columns = _column_names(bind, "forms")
        additions: list[tuple[str, sa.Column]] = [
            (
                "form_type",
                sa.Column(
                    "form_type",
                    sa.String(),
                    nullable=False,
                    server_default="generic",
                ),
            ),
            (
                "booking_enabled",
                sa.Column(
                    "booking_enabled",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.text("false"),
                ),
            ),
            (
                "booking_requires_manual_confirmation",
                sa.Column(
                    "booking_requires_manual_confirmation",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.text("true"),
                ),
            ),
            (
                "booking_success_message_override",
                sa.Column("booking_success_message_override", sa.Text(), nullable=True),
            ),
            (
                "booking_notification_enabled",
                sa.Column(
                    "booking_notification_enabled",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.text("true"),
                ),
            ),
            (
                "booking_field_mapping",
                sa.Column("booking_field_mapping", sa.JSON(), nullable=True),
            ),
        ]
        for name, column in additions:
            if name not in columns:
                op.add_column("forms", column)

        index_names = _index_names(bind, "forms")
        for index_name, column_name in [
            ("ix_forms_form_type", "form_type"),
            ("ix_forms_booking_enabled", "booking_enabled"),
        ]:
            if column_name in _column_names(bind, "forms") and index_name not in index_names:
                op.create_index(index_name, "forms", [column_name], unique=False)

    if "bookings" not in tables:
        op.create_table(
            "bookings",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "association_id",
                sa.Integer(),
                sa.ForeignKey("organizations.id"),
                nullable=False,
            ),
            sa.Column("form_id", sa.Integer(), sa.ForeignKey("forms.id"), nullable=True),
            sa.Column(
                "submission_id",
                sa.Integer(),
                sa.ForeignKey("form_submissions.id"),
                nullable=True,
            ),
            sa.Column("status", sa.String(), nullable=False, server_default="new"),
            sa.Column("customer_name", sa.String(), nullable=False),
            sa.Column("customer_email", sa.String(), nullable=True),
            sa.Column("customer_phone", sa.String(), nullable=True),
            sa.Column("booking_date", sa.Date(), nullable=True),
            sa.Column("booking_time", sa.String(), nullable=True),
            sa.Column("party_size", sa.Integer(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("room_id", sa.Integer(), nullable=True),
            sa.Column("table_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("confirmed_at", sa.DateTime(), nullable=True),
            sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        )

    if "booking_events" not in tables:
        op.create_table(
            "booking_events",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "booking_id",
                sa.Integer(),
                sa.ForeignKey("bookings.id"),
                nullable=False,
            ),
            sa.Column("event_type", sa.String(), nullable=False),
            sa.Column("payload_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column(
                "created_by_user_id",
                sa.Integer(),
                sa.ForeignKey("admin_users.id"),
                nullable=True,
            ),
        )

    bind = op.get_bind()
    booking_indexes = _index_names(bind, "bookings") if "bookings" in _table_names(bind) else set()
    for index_name, columns in [
        ("ix_bookings_association_id", ["association_id"]),
        ("ix_bookings_form_id", ["form_id"]),
        ("ix_bookings_submission_id", ["submission_id"]),
        ("ix_bookings_status", ["status"]),
        ("ix_bookings_customer_email", ["customer_email"]),
        ("ix_bookings_booking_date", ["booking_date"]),
        ("ix_bookings_booking_time", ["booking_time"]),
        ("ix_bookings_room_id", ["room_id"]),
        ("ix_bookings_table_id", ["table_id"]),
        ("ix_bookings_created_at", ["created_at"]),
    ]:
        if index_name not in booking_indexes:
            op.create_index(index_name, "bookings", columns, unique=False)

    event_indexes = _index_names(bind, "booking_events") if "booking_events" in _table_names(bind) else set()
    for index_name, columns in [
        ("ix_booking_events_booking_id", ["booking_id"]),
        ("ix_booking_events_event_type", ["event_type"]),
        ("ix_booking_events_created_at", ["created_at"]),
        ("ix_booking_events_created_by_user_id", ["created_by_user_id"]),
    ]:
        if index_name not in event_indexes:
            op.create_index(index_name, "booking_events", columns, unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    tables = _table_names(bind)

    if "booking_events" in tables:
        for index_name in [
            "ix_booking_events_created_by_user_id",
            "ix_booking_events_created_at",
            "ix_booking_events_event_type",
            "ix_booking_events_booking_id",
        ]:
            if index_name in _index_names(bind, "booking_events"):
                op.drop_index(index_name, table_name="booking_events")
        op.drop_table("booking_events")

    if "bookings" in tables:
        for index_name in [
            "ix_bookings_created_at",
            "ix_bookings_table_id",
            "ix_bookings_room_id",
            "ix_bookings_booking_time",
            "ix_bookings_booking_date",
            "ix_bookings_customer_email",
            "ix_bookings_status",
            "ix_bookings_submission_id",
            "ix_bookings_form_id",
            "ix_bookings_association_id",
        ]:
            if index_name in _index_names(bind, "bookings"):
                op.drop_index(index_name, table_name="bookings")
        op.drop_table("bookings")

    if "forms" in tables:
        for index_name in [
            "ix_forms_booking_enabled",
            "ix_forms_form_type",
        ]:
            if index_name in _index_names(bind, "forms"):
                op.drop_index(index_name, table_name="forms")
        for column_name in [
            "booking_field_mapping",
            "booking_notification_enabled",
            "booking_success_message_override",
            "booking_requires_manual_confirmation",
            "booking_enabled",
            "form_type",
        ]:
            if column_name in _column_names(bind, "forms"):
                op.drop_column("forms", column_name)
