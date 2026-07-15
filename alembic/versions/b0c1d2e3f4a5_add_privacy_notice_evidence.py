"""Add immutable privacy-notice version evidence to member acknowledgements.

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-07-15 19:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "b0c1d2e3f4a5"
down_revision = "a9b0c1d2e3f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "members",
        sa.Column("accepted_privacy_notice_version", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "members",
        sa.Column("accepted_privacy_notice_sha256", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("members", "accepted_privacy_notice_sha256")
    op.drop_column("members", "accepted_privacy_notice_version")
