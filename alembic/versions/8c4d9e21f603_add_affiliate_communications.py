"""Add central affiliate communications and per-admin inbox read state.

Revision ID: 8c4d9e21f603
Revises: 79a6d82bc401
Create Date: 2026-09-11
"""

from alembic import op
import sqlalchemy as sa

revision = "8c4d9e21f603"
down_revision = "79a6d82bc401"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "affiliate_communications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("audience", sa.String(16), nullable=False),
        sa.Column("idempotency_key", sa.String(100), nullable=False, unique=True),
        sa.Column("request_fingerprint", sa.String(64), nullable=False),
        sa.Column("created_by_admin_id", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by_email", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("recipient_count", sa.Integer(), nullable=False),
        sa.Column("email_count", sa.Integer(), nullable=False),
        sa.Column("notification_count", sa.Integer(), nullable=False),
    )
    op.create_index("ix_affiliate_communications_created_at", "affiliate_communications", ["created_at"])
    op.create_table(
        "affiliate_communication_recipients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("communication_id", sa.Integer(), sa.ForeignKey("affiliate_communications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("organization_name", sa.String(), nullable=False),
        sa.Column("admin_count", sa.Integer(), nullable=False),
        sa.Column("email_count", sa.Integer(), nullable=False),
        sa.UniqueConstraint("communication_id", "organization_id", name="uq_affiliate_communication_recipient"),
    )
    op.create_index("ix_affiliate_communication_recipients_organization_id", "affiliate_communication_recipients", ["organization_id"])
    op.create_table(
        "affiliate_communication_reads",
        sa.Column("communication_id", sa.Integer(), sa.ForeignKey("affiliate_communications.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("admin_user_id", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("read_at", sa.DateTime(), nullable=False),
    )
    with op.batch_alter_table("org_admin_notifications") as batch:
        batch.add_column(sa.Column("communication_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_org_admin_notifications_communication", "affiliate_communications", ["communication_id"], ["id"], ondelete="SET NULL")
        batch.create_index("ix_org_admin_notifications_communication_id", ["communication_id"])


def downgrade() -> None:
    with op.batch_alter_table("org_admin_notifications") as batch:
        batch.drop_index("ix_org_admin_notifications_communication_id")
        batch.drop_constraint("fk_org_admin_notifications_communication", type_="foreignkey")
        batch.drop_column("communication_id")
    op.drop_table("affiliate_communication_reads")
    op.drop_table("affiliate_communication_recipients")
    op.drop_table("affiliate_communications")
