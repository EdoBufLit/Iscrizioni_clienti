"""Add privileged MFA, recovery codes and revocable sessions.

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-07-18 13:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "e3f4a5b6c7d8"
down_revision = "d2e3f4a5b6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_mfa_factors",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("admin_id", sa.Integer(), nullable=False),
        sa.Column("factor_type", sa.String(), nullable=False, server_default="totp"),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("secret_encrypted", sa.Text(), nullable=False),
        sa.Column("last_used_timestep", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("activated_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["admin_id"], ["admin_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("admin_id"),
    )
    op.create_index("ix_admin_mfa_factors_admin_id", "admin_mfa_factors", ["admin_id"], unique=True)
    op.create_index("ix_admin_mfa_factors_status", "admin_mfa_factors", ["status"])

    op.create_table(
        "admin_recovery_codes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("admin_id", sa.Integer(), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["admin_id"], ["admin_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("admin_id", "code_hash", name="uq_admin_recovery_code_hash"),
    )
    op.create_index("ix_admin_recovery_codes_admin_id", "admin_recovery_codes", ["admin_id"])
    op.create_index("ix_admin_recovery_codes_code_hash", "admin_recovery_codes", ["code_hash"])
    op.create_index("ix_admin_recovery_codes_used_at", "admin_recovery_codes", ["used_at"])

    op.create_table(
        "super_admin_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("admin_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("idle_expires_at", sa.DateTime(), nullable=False),
        sa.Column("absolute_expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("mfa_verified_at", sa.DateTime(), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("ip_hash", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["admin_id"], ["admin_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_super_admin_sessions_admin_id", "super_admin_sessions", ["admin_id"])
    op.create_index("ix_super_admin_sessions_token_hash", "super_admin_sessions", ["token_hash"], unique=True)
    op.create_index("ix_super_admin_sessions_idle_expires_at", "super_admin_sessions", ["idle_expires_at"])
    op.create_index("ix_super_admin_sessions_absolute_expires_at", "super_admin_sessions", ["absolute_expires_at"])
    op.create_index("ix_super_admin_sessions_revoked_at", "super_admin_sessions", ["revoked_at"])
    op.create_index("ix_super_admin_sessions_mfa_verified_at", "super_admin_sessions", ["mfa_verified_at"])

    op.create_table(
        "admin_auth_challenges",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("admin_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("purpose", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["admin_id"], ["admin_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_admin_auth_challenges_admin_id", "admin_auth_challenges", ["admin_id"])
    op.create_index("ix_admin_auth_challenges_token_hash", "admin_auth_challenges", ["token_hash"], unique=True)
    op.create_index("ix_admin_auth_challenges_purpose", "admin_auth_challenges", ["purpose"])
    op.create_index("ix_admin_auth_challenges_expires_at", "admin_auth_challenges", ["expires_at"])
    op.create_index("ix_admin_auth_challenges_consumed_at", "admin_auth_challenges", ["consumed_at"])


def downgrade() -> None:
    op.drop_table("admin_auth_challenges")
    op.drop_table("super_admin_sessions")
    op.drop_table("admin_recovery_codes")
    op.drop_table("admin_mfa_factors")
