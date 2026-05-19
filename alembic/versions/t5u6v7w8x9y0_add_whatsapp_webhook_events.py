"""Add WhatsApp webhook event outbox.

Revision ID: t5u6v7w8x9y0
Revises: s4t5u6v7w8x9
Create Date: 2026-05-19 15:50:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "t5u6v7w8x9y0"
down_revision: Union[str, Sequence[str], None] = "s4t5u6v7w8x9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _payload_type(bind) -> sa.types.TypeEngine:
    dialect_name = (bind.dialect.name or "").lower()
    if dialect_name == "postgresql":
        from sqlalchemy.dialects.postgresql import JSONB

        return JSONB(astext_type=sa.Text())
    return sa.JSON()


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "whatsapp_webhook_events" not in inspector.get_table_names():
        op.create_table(
            "whatsapp_webhook_events",
            sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
            sa.Column("event_name", sa.String(), nullable=False),
            sa.Column("instance_name", sa.String(), nullable=False),
            sa.Column("payload_json", _payload_type(bind), nullable=False),
            sa.Column(
                "status",
                sa.String(),
                nullable=False,
                server_default=sa.text("'queued'"),
            ),
            sa.Column(
                "priority",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("5"),
            ),
            sa.Column(
                "attempts",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            ),
            sa.Column(
                "next_retry_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("dedupe_key", sa.String(), nullable=False),
            sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint(
                "dedupe_key",
                name="uq_whatsapp_webhook_events_dedupe_key",
            ),
        )

    indexes = {index["name"] for index in inspector.get_indexes("whatsapp_webhook_events")}
    if "ix_whatsapp_webhook_events_event_name" not in indexes:
        op.create_index("ix_whatsapp_webhook_events_event_name", "whatsapp_webhook_events", ["event_name"])
    if "ix_whatsapp_webhook_events_instance_name" not in indexes:
        op.create_index("ix_whatsapp_webhook_events_instance_name", "whatsapp_webhook_events", ["instance_name"])
    if "ix_whatsapp_webhook_events_status" not in indexes:
        op.create_index("ix_whatsapp_webhook_events_status", "whatsapp_webhook_events", ["status"])
    if "ix_whatsapp_webhook_events_priority" not in indexes:
        op.create_index("ix_whatsapp_webhook_events_priority", "whatsapp_webhook_events", ["priority"])
    if "ix_whatsapp_webhook_events_next_retry_at" not in indexes:
        op.create_index("ix_whatsapp_webhook_events_next_retry_at", "whatsapp_webhook_events", ["next_retry_at"])
    if "ix_whatsapp_webhook_events_dedupe_key" not in indexes:
        op.create_index("ix_whatsapp_webhook_events_dedupe_key", "whatsapp_webhook_events", ["dedupe_key"])
    if "ix_whatsapp_webhook_events_dispatch" not in indexes:
        op.create_index(
            "ix_whatsapp_webhook_events_dispatch",
            "whatsapp_webhook_events",
            ["status", "priority", "next_retry_at", "created_at"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "whatsapp_webhook_events" not in inspector.get_table_names():
        return

    indexes = {index["name"] for index in inspector.get_indexes("whatsapp_webhook_events")}
    for index_name in [
        "ix_whatsapp_webhook_events_dispatch",
        "ix_whatsapp_webhook_events_dedupe_key",
        "ix_whatsapp_webhook_events_next_retry_at",
        "ix_whatsapp_webhook_events_priority",
        "ix_whatsapp_webhook_events_status",
        "ix_whatsapp_webhook_events_instance_name",
        "ix_whatsapp_webhook_events_event_name",
    ]:
        if index_name in indexes:
            op.drop_index(index_name, table_name="whatsapp_webhook_events")
    op.drop_table("whatsapp_webhook_events")
