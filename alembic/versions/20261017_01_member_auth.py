"""Version member authentication and revoke pre-MFA administrator sessions.

Revision ID: 20261017_01_member_auth
Revises: 9d5e7a31c802
"""

from datetime import datetime

from alembic import op
import sqlalchemy as sa


revision = "20261017_01_member_auth"
down_revision = "9d5e7a31c802"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "members",
        sa.Column("auth_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column("tokens", sa.Column("auth_version", sa.Integer(), nullable=True))
    members = sa.table(
        "members", sa.column("id", sa.Integer), sa.column("auth_version", sa.Integer)
    )
    tokens = sa.table(
        "tokens",
        sa.column("member_id", sa.Integer),
        sa.column("purpose", sa.String),
        sa.column("auth_version", sa.Integer),
    )
    connection = op.get_bind()
    connection.execute(
        tokens.update()
        .where(sa.cast(tokens.c.purpose, sa.String()).in_(
            [
                "LOGIN_MAGIC_LINK", "PASSWORD_RESET", "REGISTRATION_CONTINUATION",
                "login_magic_link", "password_reset", "registration_continuation",
            ]
        ))
        .values(auth_version=sa.select(members.c.auth_version)
                .where(members.c.id == tokens.c.member_id).scalar_subquery())
    )
    sessions = sa.table(
        "org_admin_sessions",
        sa.column("admin_id", sa.Integer),
        sa.column("mfa_verified_at", sa.DateTime),
        sa.column("revoked_at", sa.DateTime),
    )
    factors = sa.table(
        "admin_mfa_factors",
        sa.column("admin_id", sa.Integer),
        sa.column("status", sa.String),
    )
    connection.execute(
        sessions.update()
        .where(
            sessions.c.revoked_at.is_(None),
            sessions.c.mfa_verified_at.is_(None),
            sa.exists().where(
                factors.c.admin_id == sessions.c.admin_id,
                factors.c.status == "active",
            ),
        )
        .values(revoked_at=datetime.utcnow())
    )


def downgrade() -> None:
    raise RuntimeError(
        "Member authentication versions cannot be removed safely: "
        "a rollback must preserve credential and session revocation."
    )
