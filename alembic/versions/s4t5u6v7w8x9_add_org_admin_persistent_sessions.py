"""add org admin persistent sessions

Revision ID: s4t5u6v7w8x9
Revises: q8r9s0t1u2v3
Create Date: 2026-05-05 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "s4t5u6v7w8x9"
down_revision: Union[str, Sequence[str], None] = "q8r9s0t1u2v3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "org_admin_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("admin_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["admin_id"], ["admin_users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    with op.batch_alter_table("org_admin_sessions", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_org_admin_sessions_admin_id"), ["admin_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_org_admin_sessions_expires_at"), ["expires_at"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_org_admin_sessions_id"), ["id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_org_admin_sessions_revoked_at"), ["revoked_at"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_org_admin_sessions_token_hash"),
            ["token_hash"],
            unique=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("org_admin_sessions", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_org_admin_sessions_token_hash"))
        batch_op.drop_index(batch_op.f("ix_org_admin_sessions_revoked_at"))
        batch_op.drop_index(batch_op.f("ix_org_admin_sessions_id"))
        batch_op.drop_index(batch_op.f("ix_org_admin_sessions_expires_at"))
        batch_op.drop_index(batch_op.f("ix_org_admin_sessions_admin_id"))
    op.drop_table("org_admin_sessions")
