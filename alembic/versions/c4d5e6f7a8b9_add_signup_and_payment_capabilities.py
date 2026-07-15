"""Add signup-continuation and payment-status capabilities.

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a7
Create Date: 2026-07-15 12:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "c4d5e6f7a8b9"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def _quote_ident(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _add_registration_continuation_token_type() -> None:
    bind = op.get_bind()
    if (bind.dialect.name or "").lower() != "postgresql":
        return

    token_purpose_type = bind.execute(
        sa.text(
            """
            SELECT type_ns.nspname AS type_schema,
                   typ.typname AS type_name,
                   typ.typtype AS type_kind
            FROM pg_attribute attr
            JOIN pg_class cls ON cls.oid = attr.attrelid
            JOIN pg_namespace table_ns ON table_ns.oid = cls.relnamespace
            JOIN pg_type typ ON typ.oid = attr.atttypid
            JOIN pg_namespace type_ns ON type_ns.oid = typ.typnamespace
            WHERE cls.relname = 'tokens'
              AND attr.attname = 'purpose'
              AND attr.attnum > 0
              AND attr.attisdropped = false
            ORDER BY (table_ns.nspname = current_schema()) DESC,
                     table_ns.nspname = 'public' DESC
            LIMIT 1
            """
        )
    ).mappings().first()
    if not token_purpose_type or token_purpose_type["type_kind"] != "e":
        return

    qualified_type_name = (
        f"{_quote_ident(token_purpose_type['type_schema'])}."
        f"{_quote_ident(token_purpose_type['type_name'])}"
    )
    with op.get_context().autocommit_block():
        op.execute(
            sa.text(
                f"ALTER TYPE {qualified_type_name} "
                "ADD VALUE IF NOT EXISTS 'REGISTRATION_CONTINUATION'"
            )
        )


def upgrade() -> None:
    _add_registration_continuation_token_type()
    op.add_column(
        "membership_payments",
        sa.Column("status_token_hash", sa.String(), nullable=True),
    )
    op.add_column(
        "membership_payments",
        sa.Column("status_token_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    bind = op.get_bind()
    dialect_name = (bind.dialect.name or "").lower()
    if dialect_name == "postgresql":
        op.execute(
            sa.text(
                """
                UPDATE membership_payments
                   SET status_token_expires_at = created_at + INTERVAL '7 days'
                 WHERE source = 'sumup'
                   AND sumup_checkout_id IS NOT NULL
                   AND status_token_hash IS NULL
                """
            )
        )
    elif dialect_name == "sqlite":
        op.execute(
            sa.text(
                """
                UPDATE membership_payments
                   SET status_token_expires_at = datetime(created_at, '+7 days')
                 WHERE source = 'sumup'
                   AND sumup_checkout_id IS NOT NULL
                   AND status_token_hash IS NULL
                """
            )
        )
    op.create_index(
        op.f("ix_membership_payments_status_token_hash"),
        "membership_payments",
        ["status_token_hash"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_membership_payments_status_token_hash"),
        table_name="membership_payments",
    )
    op.drop_column("membership_payments", "status_token_expires_at")
    op.drop_column("membership_payments", "status_token_hash")
    # PostgreSQL enum values are intentionally retained on downgrade.
