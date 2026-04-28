"""add member password reset token type

Revision ID: p7q8r9s0t1u2
Revises: o4p5q6r7s8t9
Create Date: 2026-04-28 14:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "p7q8r9s0t1u2"
down_revision = "o4p5q6r7s8t9"
branch_labels = None
depends_on = None


def _quote_ident(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def upgrade() -> None:
    bind = op.get_bind()
    dialect_name = (bind.dialect.name or "").lower()

    if dialect_name != "postgresql":
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
                "ADD VALUE IF NOT EXISTS 'PASSWORD_RESET'"
            )
        )


def downgrade() -> None:
    return None
