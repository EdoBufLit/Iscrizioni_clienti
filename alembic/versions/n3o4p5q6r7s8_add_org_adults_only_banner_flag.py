"""add organization adults only banner flag

Revision ID: n3o4p5q6r7s8
Revises: m2n3o4p5q6r7
Create Date: 2026-04-13 15:15:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "n3o4p5q6r7s8"
down_revision = "m2n3o4p5q6r7"
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _column_exists(table_name: str, column_name: str) -> bool:
    try:
        columns = _inspector().get_columns(table_name)
    except Exception:
        return False
    return any(col.get("name") == column_name for col in columns)


def upgrade() -> None:
    if not _column_exists("organizations", "adults_only_banner_enabled"):
        with op.batch_alter_table("organizations") as batch_op:
            batch_op.add_column(
                sa.Column(
                    "adults_only_banner_enabled",
                    sa.Boolean(),
                    nullable=False,
                    server_default="false",
                )
            )

    op.execute(
        sa.text(
            """
            UPDATE organizations
               SET adults_only_banner_enabled = COALESCE(adults_only_banner_enabled, FALSE)
            """
        )
    )


def downgrade() -> None:
    if _column_exists("organizations", "adults_only_banner_enabled"):
        with op.batch_alter_table("organizations") as batch_op:
            batch_op.drop_column("adults_only_banner_enabled")
