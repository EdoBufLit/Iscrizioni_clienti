"""add whatsapp evolution tables

Revision ID: c3d4e5f6a7b8
Revises: b61cfaf5fcf1
Create Date: 2026-03-18 19:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c3d4e5f6a7b8"
down_revision = "b61cfaf5fcf1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_connections",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("instance_name", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="not_connected"),
        sa.Column("phone_number", sa.String(), nullable=True),
        sa.Column("profile_name", sa.String(), nullable=True),
        sa.Column("qr_code", sa.Text(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("connected_at", sa.DateTime(), nullable=True),
        sa.Column("last_event_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("instance_name"),
        sa.UniqueConstraint("org_id"),
    )
    op.create_index(
        op.f("ix_whatsapp_connections_id"),
        "whatsapp_connections",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_whatsapp_connections_instance_name"),
        "whatsapp_connections",
        ["instance_name"],
        unique=True,
    )
    op.create_index(
        op.f("ix_whatsapp_connections_org_id"),
        "whatsapp_connections",
        ["org_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_whatsapp_connections_status"),
        "whatsapp_connections",
        ["status"],
        unique=False,
    )

    op.create_table(
        "whatsapp_chats",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("connection_id", sa.Integer(), nullable=False),
        sa.Column("external_chat_id", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=True),
        sa.Column("last_message_text", sa.Text(), nullable=True),
        sa.Column("last_message_at", sa.DateTime(), nullable=True),
        sa.Column("unread_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["connection_id"], ["whatsapp_connections.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "connection_id",
            "external_chat_id",
            name="uq_whatsapp_chats_connection_external_chat",
        ),
    )
    op.create_index(op.f("ix_whatsapp_chats_connection_id"), "whatsapp_chats", ["connection_id"], unique=False)
    op.create_index(op.f("ix_whatsapp_chats_external_chat_id"), "whatsapp_chats", ["external_chat_id"], unique=False)
    op.create_index(op.f("ix_whatsapp_chats_id"), "whatsapp_chats", ["id"], unique=False)
    op.create_index(
        "ix_whatsapp_chats_connection_last_message_at",
        "whatsapp_chats",
        ["connection_id", "last_message_at"],
        unique=False,
    )
    op.create_index(op.f("ix_whatsapp_chats_last_message_at"), "whatsapp_chats", ["last_message_at"], unique=False)
    op.create_index(op.f("ix_whatsapp_chats_org_id"), "whatsapp_chats", ["org_id"], unique=False)

    op.create_table(
        "whatsapp_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("connection_id", sa.Integer(), nullable=False),
        sa.Column("chat_id", sa.Integer(), nullable=False),
        sa.Column("external_message_id", sa.String(), nullable=True),
        sa.Column("dedupe_key", sa.String(), nullable=False),
        sa.Column("direction", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("sender_phone", sa.String(), nullable=True),
        sa.Column("recipient_phone", sa.String(), nullable=True),
        sa.Column("text_body", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("delivered_at", sa.DateTime(), nullable=True),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column("failed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["chat_id"], ["whatsapp_chats.id"]),
        sa.ForeignKeyConstraint(["connection_id"], ["whatsapp_connections.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dedupe_key"),
    )
    op.create_index(op.f("ix_whatsapp_messages_chat_id"), "whatsapp_messages", ["chat_id"], unique=False)
    op.create_index(
        "ix_whatsapp_messages_chat_created_at",
        "whatsapp_messages",
        ["chat_id", "created_at"],
        unique=False,
    )
    op.create_index(op.f("ix_whatsapp_messages_connection_id"), "whatsapp_messages", ["connection_id"], unique=False)
    op.create_index(
        "ix_whatsapp_messages_connection_external_message",
        "whatsapp_messages",
        ["connection_id", "external_message_id"],
        unique=False,
    )
    op.create_index(op.f("ix_whatsapp_messages_created_at"), "whatsapp_messages", ["created_at"], unique=False)
    op.create_index(op.f("ix_whatsapp_messages_dedupe_key"), "whatsapp_messages", ["dedupe_key"], unique=True)
    op.create_index(op.f("ix_whatsapp_messages_direction"), "whatsapp_messages", ["direction"], unique=False)
    op.create_index(op.f("ix_whatsapp_messages_external_message_id"), "whatsapp_messages", ["external_message_id"], unique=False)
    op.create_index(op.f("ix_whatsapp_messages_id"), "whatsapp_messages", ["id"], unique=False)
    op.create_index(op.f("ix_whatsapp_messages_org_id"), "whatsapp_messages", ["org_id"], unique=False)
    op.create_index(op.f("ix_whatsapp_messages_status"), "whatsapp_messages", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_whatsapp_messages_status"), table_name="whatsapp_messages")
    op.drop_index(op.f("ix_whatsapp_messages_org_id"), table_name="whatsapp_messages")
    op.drop_index(op.f("ix_whatsapp_messages_id"), table_name="whatsapp_messages")
    op.drop_index(op.f("ix_whatsapp_messages_external_message_id"), table_name="whatsapp_messages")
    op.drop_index(op.f("ix_whatsapp_messages_direction"), table_name="whatsapp_messages")
    op.drop_index(op.f("ix_whatsapp_messages_dedupe_key"), table_name="whatsapp_messages")
    op.drop_index(op.f("ix_whatsapp_messages_created_at"), table_name="whatsapp_messages")
    op.drop_index("ix_whatsapp_messages_connection_external_message", table_name="whatsapp_messages")
    op.drop_index(op.f("ix_whatsapp_messages_connection_id"), table_name="whatsapp_messages")
    op.drop_index("ix_whatsapp_messages_chat_created_at", table_name="whatsapp_messages")
    op.drop_index(op.f("ix_whatsapp_messages_chat_id"), table_name="whatsapp_messages")
    op.drop_table("whatsapp_messages")

    op.drop_index(op.f("ix_whatsapp_chats_org_id"), table_name="whatsapp_chats")
    op.drop_index(op.f("ix_whatsapp_chats_last_message_at"), table_name="whatsapp_chats")
    op.drop_index("ix_whatsapp_chats_connection_last_message_at", table_name="whatsapp_chats")
    op.drop_index(op.f("ix_whatsapp_chats_id"), table_name="whatsapp_chats")
    op.drop_index(op.f("ix_whatsapp_chats_external_chat_id"), table_name="whatsapp_chats")
    op.drop_index(op.f("ix_whatsapp_chats_connection_id"), table_name="whatsapp_chats")
    op.drop_table("whatsapp_chats")

    op.drop_index(op.f("ix_whatsapp_connections_status"), table_name="whatsapp_connections")
    op.drop_index(op.f("ix_whatsapp_connections_org_id"), table_name="whatsapp_connections")
    op.drop_index(op.f("ix_whatsapp_connections_instance_name"), table_name="whatsapp_connections")
    op.drop_index(op.f("ix_whatsapp_connections_id"), table_name="whatsapp_connections")
    op.drop_table("whatsapp_connections")
