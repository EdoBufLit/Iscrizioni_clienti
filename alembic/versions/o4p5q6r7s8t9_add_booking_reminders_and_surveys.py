"""add booking reminders and surveys

Revision ID: o4p5q6r7s8t9
Revises: n3o4p5q6r7s8
Create Date: 2026-04-27 18:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "o4p5q6r7s8t9"
down_revision = "n3o4p5q6r7s8"
branch_labels = None
depends_on = None


def _table_names(bind) -> set[str]:
    return set(sa.inspect(bind).get_table_names())


def _column_names(bind, table_name: str) -> set[str]:
    if table_name not in _table_names(bind):
        return set()
    return {column["name"] for column in sa.inspect(bind).get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    if "organizations" in _table_names(bind):
        columns = _column_names(bind, "organizations")
        with op.batch_alter_table("organizations") as batch_op:
            if "booking_whatsapp_reminder_enabled" not in columns:
                batch_op.add_column(
                    sa.Column(
                        "booking_whatsapp_reminder_enabled",
                        sa.Boolean(),
                        nullable=False,
                        server_default=sa.false(),
                    )
                )
            if "booking_whatsapp_reminder_hours_before" not in columns:
                batch_op.add_column(
                    sa.Column(
                        "booking_whatsapp_reminder_hours_before",
                        sa.Integer(),
                        nullable=False,
                        server_default="24",
                    )
                )
            if "booking_whatsapp_reminder_template" not in columns:
                batch_op.add_column(sa.Column("booking_whatsapp_reminder_template", sa.Text(), nullable=True))

    if "forms" in _table_names(bind):
        columns = _column_names(bind, "forms")
        with op.batch_alter_table("forms") as batch_op:
            if "survey_post_event_enabled" not in columns:
                batch_op.add_column(
                    sa.Column(
                        "survey_post_event_enabled",
                        sa.Boolean(),
                        nullable=False,
                        server_default=sa.false(),
                    )
                )
            if "survey_post_event_delay_hours" not in columns:
                batch_op.add_column(
                    sa.Column(
                        "survey_post_event_delay_hours",
                        sa.Integer(),
                        nullable=False,
                        server_default="2",
                    )
                )
            if "survey_post_event_message_template" not in columns:
                batch_op.add_column(sa.Column("survey_post_event_message_template", sa.Text(), nullable=True))
        indexes = {index["name"] for index in sa.inspect(bind).get_indexes("forms")}
        if "ix_forms_survey_post_event_enabled" not in indexes:
            op.create_index(
                "ix_forms_survey_post_event_enabled",
                "forms",
                ["survey_post_event_enabled"],
                unique=False,
            )


def downgrade() -> None:
    bind = op.get_bind()
    if "forms" in _table_names(bind):
        indexes = {index["name"] for index in sa.inspect(bind).get_indexes("forms")}
        if "ix_forms_survey_post_event_enabled" in indexes:
            op.drop_index("ix_forms_survey_post_event_enabled", table_name="forms")
        columns = _column_names(bind, "forms")
        with op.batch_alter_table("forms") as batch_op:
            for column_name in (
                "survey_post_event_message_template",
                "survey_post_event_delay_hours",
                "survey_post_event_enabled",
            ):
                if column_name in columns:
                    batch_op.drop_column(column_name)
    if "organizations" in _table_names(bind):
        columns = _column_names(bind, "organizations")
        with op.batch_alter_table("organizations") as batch_op:
            for column_name in (
                "booking_whatsapp_reminder_template",
                "booking_whatsapp_reminder_hours_before",
                "booking_whatsapp_reminder_enabled",
            ):
                if column_name in columns:
                    batch_op.drop_column(column_name)
