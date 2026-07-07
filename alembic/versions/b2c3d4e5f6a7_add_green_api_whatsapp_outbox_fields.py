"""Add Green API WhatsApp and outbound retry fields.

Revision ID: b2c3d4e5f6a7
Revises: z1a2b3c4d5e6
Create Date: 2026-07-07 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "b2c3d4e5f6a7"
down_revision = "z1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "whatsapp_connections",
        sa.Column("provider", sa.String(), nullable=False, server_default="evolution"),
    )
    op.add_column("whatsapp_connections", sa.Column("provider_instance_id", sa.String(), nullable=True))
    op.add_column("whatsapp_connections", sa.Column("provider_token_encrypted", sa.Text(), nullable=True))
    op.add_column("whatsapp_connections", sa.Column("provider_api_url", sa.String(), nullable=True))
    op.add_column("whatsapp_connections", sa.Column("provider_webhook_secret_hash", sa.String(), nullable=True))
    op.add_column("whatsapp_connections", sa.Column("last_healthcheck_at", sa.DateTime(), nullable=True))
    op.create_index(
        op.f("ix_whatsapp_connections_provider"),
        "whatsapp_connections",
        ["provider"],
    )
    op.create_index(
        op.f("ix_whatsapp_connections_provider_instance_id"),
        "whatsapp_connections",
        ["provider_instance_id"],
    )

    op.add_column(
        "whatsapp_messages",
        sa.Column("send_attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("whatsapp_messages", sa.Column("next_retry_at", sa.DateTime(), nullable=True))
    op.add_column("whatsapp_messages", sa.Column("last_error", sa.Text(), nullable=True))
    op.add_column("whatsapp_messages", sa.Column("fallback_email_to", sa.String(), nullable=True))
    op.add_column("whatsapp_messages", sa.Column("fallback_email_subject", sa.String(), nullable=True))
    op.add_column("whatsapp_messages", sa.Column("fallback_email_outbox_id", sa.String(length=36), nullable=True))
    op.create_index(
        op.f("ix_whatsapp_messages_next_retry_at"),
        "whatsapp_messages",
        ["next_retry_at"],
    )
    op.create_index(
        op.f("ix_whatsapp_messages_fallback_email_outbox_id"),
        "whatsapp_messages",
        ["fallback_email_outbox_id"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_whatsapp_messages_fallback_email_outbox_id"), table_name="whatsapp_messages")
    op.drop_index(op.f("ix_whatsapp_messages_next_retry_at"), table_name="whatsapp_messages")
    op.drop_column("whatsapp_messages", "fallback_email_outbox_id")
    op.drop_column("whatsapp_messages", "fallback_email_subject")
    op.drop_column("whatsapp_messages", "fallback_email_to")
    op.drop_column("whatsapp_messages", "last_error")
    op.drop_column("whatsapp_messages", "next_retry_at")
    op.drop_column("whatsapp_messages", "send_attempts")

    op.drop_index(op.f("ix_whatsapp_connections_provider_instance_id"), table_name="whatsapp_connections")
    op.drop_index(op.f("ix_whatsapp_connections_provider"), table_name="whatsapp_connections")
    op.drop_column("whatsapp_connections", "last_healthcheck_at")
    op.drop_column("whatsapp_connections", "provider_webhook_secret_hash")
    op.drop_column("whatsapp_connections", "provider_api_url")
    op.drop_column("whatsapp_connections", "provider_token_encrypted")
    op.drop_column("whatsapp_connections", "provider_instance_id")
    op.drop_column("whatsapp_connections", "provider")
