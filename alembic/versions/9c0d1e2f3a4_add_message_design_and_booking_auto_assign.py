"""add message design and booking auto assign

Revision ID: 9c0d1e2f3a4
Revises: 8b9c0d1e2f3
Create Date: 2026-03-11 20:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9c0d1e2f3a4"
down_revision: Union[str, Sequence[str], None] = "8b9c0d1e2f3"
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
    inspector = sa.inspect(bind)
    is_sqlite = bind.dialect.name == "sqlite"

    if "forms" in inspector.get_table_names():
        columns = _column_names(bind, "forms")
        if "booking_auto_assign_enabled" not in columns:
            op.add_column(
                "forms",
                sa.Column(
                    "booking_auto_assign_enabled",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.text("false"),
                ),
            )

    for table_name in ["email_templates", "email_campaigns"]:
        if table_name not in inspector.get_table_names():
            continue
        columns = _column_names(bind, table_name)
        indexes = _index_names(bind, table_name)
        if "design_json" not in columns:
            op.add_column(table_name, sa.Column("design_json", sa.JSON(), nullable=True))
        if "linked_form_id" not in columns:
            op.add_column(table_name, sa.Column("linked_form_id", sa.Integer(), nullable=True))
        index_name = f"ix_{table_name}_linked_form_id"
        if index_name not in indexes:
            op.create_index(index_name, table_name, ["linked_form_id"], unique=False)
        fk_name = f"fk_{table_name}_linked_form_id_forms"
        foreign_keys = {fk["name"] for fk in inspector.get_foreign_keys(table_name)}
        if not is_sqlite and fk_name not in foreign_keys:
            op.create_foreign_key(
                fk_name,
                table_name,
                "forms",
                ["linked_form_id"],
                ["id"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    is_sqlite = bind.dialect.name == "sqlite"

    for table_name in ["email_campaigns", "email_templates"]:
        if table_name not in inspector.get_table_names():
            continue
        columns = _column_names(bind, table_name)
        indexes = _index_names(bind, table_name)
        fk_name = f"fk_{table_name}_linked_form_id_forms"
        foreign_keys = {fk["name"] for fk in inspector.get_foreign_keys(table_name)}
        if not is_sqlite and fk_name in foreign_keys:
            op.drop_constraint(fk_name, table_name, type_="foreignkey")
        index_name = f"ix_{table_name}_linked_form_id"
        if index_name in indexes:
            op.drop_index(index_name, table_name=table_name)
        if "linked_form_id" in columns:
            op.drop_column(table_name, "linked_form_id")
        if "design_json" in columns:
            op.drop_column(table_name, "design_json")

    if "forms" in inspector.get_table_names():
        columns = _column_names(bind, "forms")
        if "booking_auto_assign_enabled" in columns:
            op.drop_column("forms", "booking_auto_assign_enabled")
