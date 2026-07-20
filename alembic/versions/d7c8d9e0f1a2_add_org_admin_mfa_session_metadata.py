"""Add optional Org Admin MFA session metadata.

Revision ID: d7c8d9e0f1a2
Revises: a6b7c8d9e0f1
Create Date: 2026-07-18 18:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "d7c8d9e0f1a2"
down_revision = "a6b7c8d9e0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("org_admin_sessions") as batch_op:
        batch_op.add_column(
            sa.Column(
                "last_seen_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            )
        )
        batch_op.add_column(sa.Column("user_agent", sa.String(length=512), nullable=True))
        batch_op.add_column(sa.Column("ip_hash", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("mfa_verified_at", sa.DateTime(), nullable=True))
        batch_op.create_index(
            "ix_org_admin_sessions_mfa_verified_at",
            ["mfa_verified_at"],
            unique=False,
        )

    op.execute(
        sa.text(
            "UPDATE org_admin_sessions "
            "SET last_seen_at = COALESCE(created_at, CURRENT_TIMESTAMP)"
        )
    )


def downgrade() -> None:
    with op.batch_alter_table("org_admin_sessions") as batch_op:
        batch_op.drop_index("ix_org_admin_sessions_mfa_verified_at")
        batch_op.drop_column("mfa_verified_at")
        batch_op.drop_column("ip_hash")
        batch_op.drop_column("user_agent")
        batch_op.drop_column("last_seen_at")
