"""Add WhatsApp bot tables and low-cards alert fields.

Revision ID: z9a0b1c2d3e4
Revises: y8z9a0b1c2d3
Create Date: 2026-03-02 11:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "z9a0b1c2d3e4"
down_revision: Union[str, Sequence[str], None] = "y8z9a0b1c2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _json_type(bind) -> sa.types.TypeEngine:
    dialect_name = (bind.dialect.name or "").lower()
    if dialect_name == "postgresql":
        from sqlalchemy.dialects.postgresql import JSONB

        return JSONB(astext_type=sa.Text())
    return sa.JSON()


def _json_empty_default(bind):
    if (bind.dialect.name or "").lower() == "postgresql":
        return sa.text("'{}'::jsonb")
    return sa.text("'{}'")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    org_columns = {col["name"] for col in inspector.get_columns("organizations")}
    if "whatsapp_e164" not in org_columns:
        op.add_column(
            "organizations",
            sa.Column("whatsapp_e164", sa.String(), nullable=True),
        )
    if "last_low_cards_alert_at" not in org_columns:
        op.add_column(
            "organizations",
            sa.Column("last_low_cards_alert_at", sa.DateTime(), nullable=True),
        )

    existing_tables = set(inspector.get_table_names())
    if "whatsapp_sessions" not in existing_tables:
        op.create_table(
            "whatsapp_sessions",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("wa_from", sa.String(), nullable=False),
            sa.Column(
                "state",
                sa.String(),
                nullable=False,
                server_default=sa.text("'idle'"),
            ),
            sa.Column(
                "data",
                _json_type(bind),
                nullable=False,
                server_default=_json_empty_default(bind),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint("wa_from", name="uq_whatsapp_sessions_wa_from"),
        )

    if "recharge_requests" not in existing_tables:
        op.create_table(
            "recharge_requests",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "association_id",
                sa.Integer(),
                sa.ForeignKey("organizations.id"),
                nullable=True,
            ),
            sa.Column("association_name", sa.String(), nullable=False),
            sa.Column("requester_whatsapp", sa.String(), nullable=False),
            sa.Column("requester_profile_name", sa.String(), nullable=True),
            sa.Column("requested_cards", sa.Integer(), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column(
                "status",
                sa.String(),
                nullable=False,
                server_default=sa.text("'new'"),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )

    tables_after_create = set(inspector.get_table_names()) | {
        "whatsapp_sessions",
        "recharge_requests",
    }
    if "whatsapp_sessions" in tables_after_create:
        whatsapp_indexes = {
            index["name"] for index in sa.inspect(bind).get_indexes("whatsapp_sessions")
        }
        if "ix_whatsapp_sessions_wa_from" not in whatsapp_indexes:
            op.create_index(
                "ix_whatsapp_sessions_wa_from",
                "whatsapp_sessions",
                ["wa_from"],
                unique=True,
            )

    if "recharge_requests" in tables_after_create:
        recharge_indexes = {
            index["name"] for index in sa.inspect(bind).get_indexes("recharge_requests")
        }
        if "ix_recharge_requests_association_id" not in recharge_indexes:
            op.create_index(
                "ix_recharge_requests_association_id",
                "recharge_requests",
                ["association_id"],
            )
        if "ix_recharge_requests_status" not in recharge_indexes:
            op.create_index(
                "ix_recharge_requests_status",
                "recharge_requests",
                ["status"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "recharge_requests" in existing_tables:
        recharge_indexes = {
            index["name"] for index in inspector.get_indexes("recharge_requests")
        }
        for index_name in [
            "ix_recharge_requests_status",
            "ix_recharge_requests_association_id",
        ]:
            if index_name in recharge_indexes:
                op.drop_index(index_name, table_name="recharge_requests")
        op.drop_table("recharge_requests")

    if "whatsapp_sessions" in existing_tables:
        whatsapp_indexes = {
            index["name"] for index in inspector.get_indexes("whatsapp_sessions")
        }
        if "ix_whatsapp_sessions_wa_from" in whatsapp_indexes:
            op.drop_index("ix_whatsapp_sessions_wa_from", table_name="whatsapp_sessions")
        op.drop_table("whatsapp_sessions")

    org_columns = {col["name"] for col in inspector.get_columns("organizations")}
    if "last_low_cards_alert_at" in org_columns:
        op.drop_column("organizations", "last_low_cards_alert_at")
    if "whatsapp_e164" in org_columns:
        op.drop_column("organizations", "whatsapp_e164")
