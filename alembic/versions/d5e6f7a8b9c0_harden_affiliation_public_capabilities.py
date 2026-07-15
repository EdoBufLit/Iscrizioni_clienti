"""Harden public affiliation draft capabilities.

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-07-15 13:00:00.000000
"""

from __future__ import annotations

import base64
import hashlib
import hmac

from alembic import op
import sqlalchemy as sa

from app.config import settings


revision = "d5e6f7a8b9c0"
down_revision = "c4d5e6f7a8b9"
branch_labels = None
depends_on = None


def _derive_token(*, application_id: int, version: int) -> str:
    message = (
        f"affiliation-public-token:v{int(version)}:{int(application_id)}"
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
    # Existing rows deliberately remain NULL in all three columns. They are
    # legacy plaintext capabilities and must keep working without a newly
    # imposed expiry. New application code populates all fields atomically.
    op.add_column(
        "affiliation_applications",
        sa.Column("public_token_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "affiliation_applications",
        sa.Column("public_token_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "affiliation_applications",
        sa.Column("public_token_version", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_affiliation_applications_public_token_hash",
        "affiliation_applications",
        ["public_token_hash"],
        unique=True,
    )


def downgrade() -> None:
    # Restore plaintext only for capabilities created after the upgrade so an
    # intentional rollback keeps already-issued URLs working. Legacy rows were
    # untouched by upgrade and need no rewrite.
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT id, public_token_hash, public_token_version "
            "FROM affiliation_applications "
            "WHERE public_token_hash IS NOT NULL "
            "OR public_token_version IS NOT NULL"
        )
    ).mappings()
    for row in rows:
        if row["public_token_hash"] is None or row["public_token_version"] is None:
            raise RuntimeError(
                "Cannot downgrade incomplete affiliation capability metadata"
            )
        raw_token = _derive_token(
            application_id=int(row["id"]),
            version=int(row["public_token_version"]),
        )
        if not hmac.compare_digest(
            _hash_token(raw_token),
            str(row["public_token_hash"]),
        ):
            raise RuntimeError(
                "Cannot downgrade tampered affiliation capability metadata"
            )
        bind.execute(
            sa.text(
                "UPDATE affiliation_applications "
                "SET public_token = :token WHERE id = :application_id"
            ),
            {"token": raw_token, "application_id": int(row["id"])},
        )

    op.drop_index(
        "ix_affiliation_applications_public_token_hash",
        table_name="affiliation_applications",
    )
    op.drop_column("affiliation_applications", "public_token_version")
    op.drop_column("affiliation_applications", "public_token_expires_at")
    op.drop_column("affiliation_applications", "public_token_hash")
