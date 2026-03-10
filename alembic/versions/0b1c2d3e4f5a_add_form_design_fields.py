"""add form design fields

Revision ID: 0b1c2d3e4f5a
Revises: f0a1b2c3d4e5
Create Date: 2026-03-10 22:05:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0b1c2d3e4f5a"
down_revision: Union[str, Sequence[str], None] = "f0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(bind, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    if "forms" not in sa.inspect(bind).get_table_names():
        return
    columns = _column_names(bind, "forms")
    additions: list[tuple[str, sa.Column]] = [
        ("accent_color", sa.Column("accent_color", sa.String(), nullable=True)),
        ("submit_button_text", sa.Column("submit_button_text", sa.String(), nullable=True)),
        (
            "show_logo",
            sa.Column(
                "show_logo",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
        ),
        ("cover_image_url", sa.Column("cover_image_url", sa.Text(), nullable=True)),
        (
            "page_style",
            sa.Column(
                "page_style",
                sa.String(),
                nullable=False,
                server_default="editorial",
            ),
        ),
    ]
    for name, column in additions:
        if name not in columns:
            op.add_column("forms", column)


def downgrade() -> None:
    bind = op.get_bind()
    if "forms" not in sa.inspect(bind).get_table_names():
        return
    columns = _column_names(bind, "forms")
    for name in [
        "page_style",
        "cover_image_url",
        "show_logo",
        "submit_button_text",
        "accent_color",
    ]:
        if name in columns:
            op.drop_column("forms", name)
