"""add require_membership_document flag to organizations

Revision ID: 4a5b6c7d8e9f
Revises: 2d3e4f5a6b7c
Create Date: 2026-03-10 11:35:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4a5b6c7d8e9f"
down_revision: Union[str, Sequence[str], None] = "2d3e4f5a6b7c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(bind, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    columns = _column_names(bind, "organizations")
    if "organizations" not in sa.inspect(bind).get_table_names():
        return

    if "require_membership_document" not in columns:
        op.add_column(
            "organizations",
            sa.Column(
                "require_membership_document",
                sa.Boolean(),
                nullable=True,
                server_default=sa.text("false"),
            ),
        )

    op.execute(
        sa.text(
            """
            UPDATE organizations
               SET require_membership_document = false
             WHERE require_membership_document IS NULL
            """
        )
    )

    if bind.dialect.name != "sqlite":
        op.alter_column(
            "organizations",
            "require_membership_document",
            existing_type=sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if "require_membership_document" in _column_names(bind, "organizations"):
        op.drop_column("organizations", "require_membership_document")
