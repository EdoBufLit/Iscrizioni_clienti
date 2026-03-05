"""add affiliation idempotency fields

Revision ID: f1g2h3i4j5k6
Revises: e5f6a7b8c9d0
Create Date: 2026-03-05 23:55:00.000000
"""

from __future__ import annotations

import hashlib
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f1g2h3i4j5k6"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEX_EMAIL = "ix_affiliation_applications_normalized_applicant_email"
_INDEX_ORG = "ix_affiliation_applications_normalized_org_name"
_INDEX_IDEMPOTENCY = "uq_affiliation_applications_active_idempotency_key"
_ACTIVE_STATUSES = {"draft", "changes_requested", "under_review"}


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    try:
        return table_name in set(_inspector().get_table_names())
    except Exception:
        return False


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    try:
        columns = _inspector().get_columns(table_name)
    except Exception:
        return False
    return any(column.get("name") == column_name for column in columns)


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    try:
        indexes = _inspector().get_indexes(table_name)
    except Exception:
        return False
    return any(index.get("name") == index_name for index in indexes)


def _normalize_email(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized or None


def _normalize_name(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"\s+", " ", value.strip().lower())
    return normalized or None


def _normalize_code(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"[^a-z0-9]", "", value.strip().lower())
    return normalized or None


def _build_key(
    *,
    applicant_email: str | None,
    organization_name: str | None,
    organization_legal_name: str | None,
    tax_code: str | None,
    vat_number: str | None,
) -> str | None:
    normalized_email = _normalize_email(applicant_email)
    normalized_org = _normalize_name(organization_name) or _normalize_name(organization_legal_name)
    normalized_tax = _normalize_code(tax_code)
    normalized_vat = _normalize_code(vat_number)

    if normalized_email is None or (
        normalized_org is None and normalized_tax is None and normalized_vat is None
    ):
        return None

    raw = "|".join(
        [
            normalized_email or "-",
            normalized_org or "-",
            normalized_tax or "-",
            normalized_vat or "-",
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _backfill_affiliation_identity_fields() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT id,
                   applicant_email,
                   organization_name,
                   organization_legal_name,
                   tax_code,
                   vat_number,
                   status
              FROM affiliation_applications
             ORDER BY updated_at DESC, created_at DESC, id DESC
            """
        )
    ).mappings()

    active_seen: set[str] = set()
    for row in rows:
        normalized_email = _normalize_email(row.get("applicant_email"))
        normalized_org = _normalize_name(row.get("organization_name")) or _normalize_name(
            row.get("organization_legal_name")
        )
        idempotency_key = _build_key(
            applicant_email=row.get("applicant_email"),
            organization_name=row.get("organization_name"),
            organization_legal_name=row.get("organization_legal_name"),
            tax_code=row.get("tax_code"),
            vat_number=row.get("vat_number"),
        )
        status = (row.get("status") or "").strip().lower()
        if idempotency_key and status in _ACTIVE_STATUSES:
            if idempotency_key in active_seen:
                idempotency_key = None
            else:
                active_seen.add(idempotency_key)

        bind.execute(
            sa.text(
                """
                UPDATE affiliation_applications
                   SET normalized_applicant_email = :normalized_email,
                       normalized_org_name = :normalized_org_name,
                       idempotency_key = :idempotency_key
                 WHERE id = :application_id
                """
            ),
            {
                "normalized_email": normalized_email,
                "normalized_org_name": normalized_org,
                "idempotency_key": idempotency_key,
                "application_id": row["id"],
            },
        )


def upgrade() -> None:
    if not _table_exists("affiliation_applications"):
        return

    if not _column_exists("affiliation_applications", "normalized_applicant_email"):
        op.add_column(
            "affiliation_applications",
            sa.Column("normalized_applicant_email", sa.String(), nullable=True),
        )
    if not _column_exists("affiliation_applications", "normalized_org_name"):
        op.add_column(
            "affiliation_applications",
            sa.Column("normalized_org_name", sa.String(), nullable=True),
        )
    if not _column_exists("affiliation_applications", "idempotency_key"):
        op.add_column(
            "affiliation_applications",
            sa.Column("idempotency_key", sa.String(length=64), nullable=True),
        )

    _backfill_affiliation_identity_fields()

    if not _index_exists("affiliation_applications", _INDEX_EMAIL):
        op.create_index(
            _INDEX_EMAIL,
            "affiliation_applications",
            ["normalized_applicant_email"],
            unique=False,
        )
    if not _index_exists("affiliation_applications", _INDEX_ORG):
        op.create_index(
            _INDEX_ORG,
            "affiliation_applications",
            ["normalized_org_name"],
            unique=False,
        )
    op.execute(
        sa.text(
            f"""
            CREATE UNIQUE INDEX IF NOT EXISTS {_INDEX_IDEMPOTENCY}
                ON affiliation_applications (idempotency_key)
             WHERE idempotency_key IS NOT NULL
               AND status IN ('draft', 'changes_requested', 'under_review')
            """
        )
    )


def downgrade() -> None:
    if not _table_exists("affiliation_applications"):
        return

    op.execute(sa.text(f"DROP INDEX IF EXISTS {_INDEX_IDEMPOTENCY}"))
    if _index_exists("affiliation_applications", _INDEX_ORG):
        op.drop_index(_INDEX_ORG, table_name="affiliation_applications")
    if _index_exists("affiliation_applications", _INDEX_EMAIL):
        op.drop_index(_INDEX_EMAIL, table_name="affiliation_applications")
    if _column_exists("affiliation_applications", "idempotency_key"):
        op.drop_column("affiliation_applications", "idempotency_key")
    if _column_exists("affiliation_applications", "normalized_org_name"):
        op.drop_column("affiliation_applications", "normalized_org_name")
    if _column_exists("affiliation_applications", "normalized_applicant_email"):
        op.drop_column("affiliation_applications", "normalized_applicant_email")
