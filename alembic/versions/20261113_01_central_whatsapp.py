"""Transactional WhatsApp notifications for central communications (no backfill)."""

from alembic import op
import sqlalchemy as sa

revision = "20261113_01_central_whatsapp"
down_revision = "20261112_02_paper_cards"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "affiliate_communication_whatsapp",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("communication_id", sa.Integer(), sa.ForeignKey("affiliate_communications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organization_name", sa.String(), nullable=False),
        sa.Column("to_phone", sa.String(32), nullable=True),
        sa.Column("from_phone", sa.String(32), nullable=True),
        sa.Column("content_sid", sa.String(34), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="queued"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("last_error", sa.String(80), nullable=True),
        sa.Column("provider_message_id", sa.String(34), nullable=True),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("communication_id", "organization_id", name="uq_central_whatsapp_recipient"),
    )
    op.create_index("ix_affiliate_communication_whatsapp_communication_id", "affiliate_communication_whatsapp", ["communication_id"])
    op.create_index("ix_affiliate_communication_whatsapp_organization_id", "affiliate_communication_whatsapp", ["organization_id"])
    op.create_index("ix_central_whatsapp_dispatch", "affiliate_communication_whatsapp", ["status", "next_attempt_at", "created_at"])


def downgrade():
    op.drop_table("affiliate_communication_whatsapp")
