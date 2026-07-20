"""Add Org Admin MFA-enrollment step-up metadata.

Revision ID: f1a2b3c4d5e6
Revises: e0f1a2b3c4d5
Create Date: 2026-07-18 21:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "f1a2b3c4d5e6"
down_revision = "e0f1a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("org_admin_sessions") as batch_op:
        batch_op.add_column(
            sa.Column("mfa_setup_authorized_at", sa.DateTime(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("org_admin_sessions") as batch_op:
        batch_op.drop_column("mfa_setup_authorized_at")
