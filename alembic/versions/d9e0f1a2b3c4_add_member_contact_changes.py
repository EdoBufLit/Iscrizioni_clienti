"""Add verified member contact-change requests.

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
Create Date: 2026-07-18 19:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "d9e0f1a2b3c4"
down_revision = "c8d9e0f1a2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "member_contact_changes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("field", sa.String(length=16), nullable=False),
        sa.Column("new_value_encrypted", sa.Text(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("authorization_token_hash", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("authorized_at", sa.DateTime(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("requested_ip_hash", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
        sa.UniqueConstraint("authorization_token_hash"),
    )
    op.create_index("ix_member_contact_changes_member_id", "member_contact_changes", ["member_id"])
    op.create_index("ix_member_contact_changes_org_id", "member_contact_changes", ["org_id"])
    op.create_index("ix_member_contact_changes_field", "member_contact_changes", ["field"])
    op.create_index("ix_member_contact_changes_token_hash", "member_contact_changes", ["token_hash"], unique=True)
    op.create_index(
        "ix_member_contact_changes_authorization_token_hash",
        "member_contact_changes",
        ["authorization_token_hash"],
        unique=True,
    )
    op.create_index("ix_member_contact_changes_status", "member_contact_changes", ["status"])
    op.create_index("ix_member_contact_changes_expires_at", "member_contact_changes", ["expires_at"])
    op.create_index(
        "ix_member_contact_changes_member_field_status",
        "member_contact_changes",
        ["member_id", "field", "status"],
    )


def downgrade() -> None:
    op.drop_table("member_contact_changes")
