"""add form action settings

Revision ID: f0a1b2c3d4e5
Revises: e9f0a1b2c3d4
Create Date: 2026-03-10 19:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f0a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "e9f0a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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
    dialect_name = (bind.dialect.name or "").lower()
    columns = _column_names(bind, "forms")
    if "forms" not in sa.inspect(bind).get_table_names():
        return

    additions: list[tuple[str, sa.Column]] = [
        (
            "notify_admin_on_submit",
            sa.Column(
                "notify_admin_on_submit",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
        ),
        (
            "send_user_confirmation",
            sa.Column(
                "send_user_confirmation",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
        ),
        (
            "admin_notification_template_id",
            sa.Column(
                "admin_notification_template_id",
                sa.Integer(),
                sa.ForeignKey(
                    "email_templates.id",
                    name="fk_forms_admin_notification_template_id",
                ),
                nullable=True,
            ),
        ),
        (
            "user_confirmation_template_id",
            sa.Column(
                "user_confirmation_template_id",
                sa.Integer(),
                sa.ForeignKey(
                    "email_templates.id",
                    name="fk_forms_user_confirmation_template_id",
                ),
                nullable=True,
            ),
        ),
        (
            "create_internal_request",
            sa.Column(
                "create_internal_request",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
        ),
        (
            "create_booking",
            sa.Column(
                "create_booking",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
        ),
    ]
    if dialect_name == "sqlite":
        with op.batch_alter_table("forms") as batch_op:
            for name, column in additions:
                if name not in columns:
                    batch_op.add_column(column)
    else:
        for name, column in additions:
            if name not in columns:
                op.add_column("forms", column)

    index_names = _index_names(bind, "forms")
    for index_name, column_name in [
        ("ix_forms_admin_notification_template_id", "admin_notification_template_id"),
        ("ix_forms_user_confirmation_template_id", "user_confirmation_template_id"),
    ]:
        if column_name in _column_names(bind, "forms") and index_name not in index_names:
            op.create_index(index_name, "forms", [column_name], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    if "forms" not in sa.inspect(bind).get_table_names():
        return

    index_names = _index_names(bind, "forms")
    for index_name in [
        "ix_forms_user_confirmation_template_id",
        "ix_forms_admin_notification_template_id",
    ]:
        if index_name in index_names:
            op.drop_index(index_name, table_name="forms")

    columns = _column_names(bind, "forms")
    for name in [
        "create_booking",
        "create_internal_request",
        "user_confirmation_template_id",
        "admin_notification_template_id",
        "send_user_confirmation",
        "notify_admin_on_submit",
    ]:
        if name in columns:
            op.drop_column("forms", name)
