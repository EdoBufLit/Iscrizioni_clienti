"""Add persistent email outbox table.

Revision ID: y8z9a0b1c2d3
Revises: x7y8z9a0b1c2
Create Date: 2026-03-01 11:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "y8z9a0b1c2d3"
down_revision: Union[str, Sequence[str], None] = "x7y8z9a0b1c2"
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

    if "email_outbox" not in inspector.get_table_names():
        op.create_table(
            "email_outbox",
            sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
            sa.Column("to_email", sa.String(), nullable=False),
            sa.Column("subject", sa.String(), nullable=False),
            sa.Column("email_type", sa.String(), nullable=False),
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
            sa.Column("provider_message_id", sa.Text(), nullable=True),
            sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("dedupe_key", sa.String(), nullable=True),
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
        )

    indexes = {index["name"] for index in inspector.get_indexes("email_outbox")}
    if "ix_email_outbox_to_email" not in indexes:
        op.create_index("ix_email_outbox_to_email", "email_outbox", ["to_email"])
    if "ix_email_outbox_email_type" not in indexes:
        op.create_index("ix_email_outbox_email_type", "email_outbox", ["email_type"])
    if "ix_email_outbox_status" not in indexes:
        op.create_index("ix_email_outbox_status", "email_outbox", ["status"])
    if "ix_email_outbox_priority" not in indexes:
        op.create_index("ix_email_outbox_priority", "email_outbox", ["priority"])
    if "ix_email_outbox_next_retry_at" not in indexes:
        op.create_index(
            "ix_email_outbox_next_retry_at", "email_outbox", ["next_retry_at"]
        )
    if "ix_email_outbox_dedupe_key" not in indexes:
        op.create_index("ix_email_outbox_dedupe_key", "email_outbox", ["dedupe_key"])
    if "ix_email_outbox_dispatch" not in indexes:
        op.create_index(
            "ix_email_outbox_dispatch",
            "email_outbox",
            ["status", "priority", "next_retry_at", "created_at"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "email_outbox" not in inspector.get_table_names():
        return

    indexes = {index["name"] for index in inspector.get_indexes("email_outbox")}
    for index_name in [
        "ix_email_outbox_dispatch",
        "ix_email_outbox_dedupe_key",
        "ix_email_outbox_next_retry_at",
        "ix_email_outbox_priority",
        "ix_email_outbox_status",
        "ix_email_outbox_email_type",
        "ix_email_outbox_to_email",
    ]:
        if index_name in indexes:
            op.drop_index(index_name, table_name="email_outbox")
    op.drop_table("email_outbox")
