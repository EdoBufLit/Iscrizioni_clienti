"""Harden public accounting document share capabilities.

Revision ID: a9b0c1d2e3f4
Revises: f8a9b0c1d2e3
Create Date: 2026-07-15 18:15:00.000000
"""

from __future__ import annotations

import base64
import hashlib
import hmac

from alembic import op
import sqlalchemy as sa

from app.config import settings


revision = "a9b0c1d2e3f4"
down_revision = "f8a9b0c1d2e3"
branch_labels = None
depends_on = None


def _derive_token(*, share_link_id: int, version: int) -> str:
    message = (
        f"accounting-share-token:v{int(version)}:{int(share_link_id)}"
    ).encode("utf-8")
    digest = hmac.new(
        (settings.SECRET_KEY or "").encode("utf-8"),
        message,
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest[:24]).rstrip(b"=").decode("ascii")


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(
        f"{raw_token}{settings.SECRET_KEY}".encode("utf-8")
    ).hexdigest()


def upgrade() -> None:
    # Existing rows deliberately remain NULL in both columns and therefore
    # continue to use their plaintext tokens. New application code fills both
    # fields and stores only a verifier in the legacy token column.
    op.add_column(
        "accounting_share_links",
        sa.Column("token_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "accounting_share_links",
        sa.Column("token_version", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_accounting_share_links_token_hash",
        "accounting_share_links",
        ["token_hash"],
        unique=True,
    )


def downgrade() -> None:
    # Restore plaintext only for capabilities created after the upgrade so an
    # intentional rollback keeps already-issued URLs working. Legacy rows were
    # untouched by upgrade and need no rewrite.
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT id, token_hash, token_version "
            "FROM accounting_share_links "
            "WHERE token_hash IS NOT NULL OR token_version IS NOT NULL"
        )
    ).mappings()
    for row in rows:
        if row["token_hash"] is None or row["token_version"] is None:
            raise RuntimeError(
                "Cannot downgrade incomplete accounting capability metadata"
            )
        raw_token = _derive_token(
            share_link_id=int(row["id"]),
            version=int(row["token_version"]),
        )
        if not hmac.compare_digest(_hash_token(raw_token), str(row["token_hash"])):
            raise RuntimeError(
                "Cannot downgrade tampered accounting capability metadata"
            )
        bind.execute(
            sa.text(
                "UPDATE accounting_share_links SET token = :token WHERE id = :link_id"
            ),
            {"token": raw_token, "link_id": int(row["id"])},
        )

    op.drop_index(
        "ix_accounting_share_links_token_hash",
        table_name="accounting_share_links",
    )
    op.drop_column("accounting_share_links", "token_version")
    op.drop_column("accounting_share_links", "token_hash")
