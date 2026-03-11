"""add selected recipient support to email campaigns

Revision ID: 8b9c0d1e2f3
Revises: 7a8b9c0d1e2
Create Date: 2026-03-11 18:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8b9c0d1e2f3"
down_revision: Union[str, Sequence[str], None] = "7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(bind, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    columns = _column_names(bind, "email_campaigns")
    if "email_campaigns" not in sa.inspect(bind).get_table_names():
        return

    if "recipient_mode" not in columns:
        op.add_column(
            "email_campaigns",
            sa.Column(
                "recipient_mode",
                sa.String(length=40),
                nullable=True,
                server_default=sa.text("'all_members'"),
            ),
        )
    if "selected_member_ids_json" not in columns:
        op.add_column(
            "email_campaigns",
            sa.Column("selected_member_ids_json", sa.Text(), nullable=True),
        )

    op.execute(
        sa.text(
            """
            UPDATE email_campaigns
               SET recipient_mode = 'all_members'
             WHERE recipient_mode IS NULL OR trim(recipient_mode) = ''
            """
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    columns = _column_names(bind, "email_campaigns")
    if "selected_member_ids_json" in columns:
        op.drop_column("email_campaigns", "selected_member_ids_json")
    if "recipient_mode" in columns:
        op.drop_column("email_campaigns", "recipient_mode")
