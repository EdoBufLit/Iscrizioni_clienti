"""add form whatsapp auto reply fields

Revision ID: e6f7a8b9c0d1
Revises: c3d4e5f6a7b8
Create Date: 2026-03-19 10:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e6f7a8b9c0d1"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "forms",
        sa.Column(
            "whatsapp_auto_reply_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "forms",
        sa.Column("whatsapp_auto_reply_template", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("forms", "whatsapp_auto_reply_template")
    op.drop_column("forms", "whatsapp_auto_reply_enabled")
