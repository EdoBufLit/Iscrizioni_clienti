"""add organization shared documents and accounting flag

Revision ID: g2h3i4j5k6l7
Revises: f1g2h3i4j5k6
Create Date: 2026-03-06 15:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "g2h3i4j5k6l7"
down_revision: Union[str, Sequence[str], None] = "f1g2h3i4j5k6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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


def _column_type(table_name: str, column_name: str):
    if not _table_exists(table_name):
        return None
    try:
        columns = _inspector().get_columns(table_name)
    except Exception:
        return None
    for column in columns:
        if column.get("name") == column_name:
            return column.get("type")
    return None


def upgrade() -> None:
    bind = op.get_bind()
    dialect_name = bind.dialect.name

    if _table_exists("organizations") and not _column_exists(
        "organizations", "accounting_enabled"
    ):
        op.add_column(
            "organizations",
            sa.Column(
                "accounting_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
        )

    if _column_exists("organizations", "accounting_enabled"):
        accounting_type = _column_type("organizations", "accounting_enabled")
        is_boolean_column = isinstance(accounting_type, sa.Boolean)

        if not is_boolean_column:
            bind.execute(
                sa.text(
                    """
                    UPDATE organizations
                       SET accounting_enabled = 0
                     WHERE accounting_enabled IS NULL
                    """
                )
            )
            if dialect_name == "postgresql":
                bind.execute(
                    sa.text(
                        """
                        ALTER TABLE organizations
                        ALTER COLUMN accounting_enabled DROP DEFAULT
                        """
                    )
                )
                op.alter_column(
                    "organizations",
                    "accounting_enabled",
                    existing_type=accounting_type or sa.Integer(),
                    type_=sa.Boolean(),
                    postgresql_using="COALESCE(accounting_enabled, 0) <> 0",
                )
            else:
                bind.execute(
                    sa.text(
                        """
                        UPDATE organizations
                           SET accounting_enabled = 0
                         WHERE accounting_enabled IS NULL
                        """
                    )
                )

        bind.execute(
            sa.text(
                """
                UPDATE organizations
                   SET accounting_enabled = FALSE
                 WHERE accounting_enabled IS NULL
                """
            )
        )
        op.alter_column(
            "organizations",
            "accounting_enabled",
            existing_type=sa.Boolean() if dialect_name == "postgresql" or is_boolean_column else accounting_type,
            nullable=False,
            server_default=sa.text("false"),
        )

    if not _table_exists("organization_shared_documents"):
        op.create_table(
            "organization_shared_documents",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("kind", sa.String(), nullable=False),
            sa.Column("rel_path", sa.String(), nullable=False),
            sa.Column("original_filename", sa.String(), nullable=False),
            sa.Column("mime_type", sa.String(), nullable=True),
            sa.Column("size_bytes", sa.Integer(), nullable=True),
            sa.Column("sha256", sa.String(), nullable=True),
            sa.Column(
                "uploaded_by_admin_id",
                sa.Integer(),
                sa.ForeignKey("admin_users.id"),
                nullable=True,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )

    if not _index_exists("organization_shared_documents", "ix_organization_shared_documents_kind"):
        op.create_index(
            "ix_organization_shared_documents_kind",
            "organization_shared_documents",
            ["kind"],
            unique=False,
        )
    if not _index_exists(
        "organization_shared_documents", "ix_organization_shared_documents_created_at"
    ):
        op.create_index(
            "ix_organization_shared_documents_created_at",
            "organization_shared_documents",
            ["created_at"],
            unique=False,
        )

    if not _table_exists("organization_shared_document_assignments"):
        op.create_table(
            "organization_shared_document_assignments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "document_id",
                sa.Integer(),
                sa.ForeignKey("organization_shared_documents.id"),
                nullable=False,
            ),
            sa.Column(
                "association_id",
                sa.Integer(),
                sa.ForeignKey("organizations.id"),
                nullable=False,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint(
                "document_id",
                "association_id",
                name="uq_org_shared_document_assignment",
            ),
        )

    if not _index_exists(
        "organization_shared_document_assignments",
        "ix_organization_shared_document_assignments_document_id",
    ):
        op.create_index(
            "ix_organization_shared_document_assignments_document_id",
            "organization_shared_document_assignments",
            ["document_id"],
            unique=False,
        )
    if not _index_exists(
        "organization_shared_document_assignments",
        "ix_organization_shared_document_assignments_association_id",
    ):
        op.create_index(
            "ix_organization_shared_document_assignments_association_id",
            "organization_shared_document_assignments",
            ["association_id"],
            unique=False,
        )


def downgrade() -> None:
    if _table_exists("organization_shared_document_assignments"):
        op.drop_index(
            "ix_organization_shared_document_assignments_association_id",
            table_name="organization_shared_document_assignments",
        )
        op.drop_index(
            "ix_organization_shared_document_assignments_document_id",
            table_name="organization_shared_document_assignments",
        )
        op.drop_table("organization_shared_document_assignments")

    if _table_exists("organization_shared_documents"):
        op.drop_index(
            "ix_organization_shared_documents_created_at",
            table_name="organization_shared_documents",
        )
        op.drop_index(
            "ix_organization_shared_documents_kind",
            table_name="organization_shared_documents",
        )
        op.drop_table("organization_shared_documents")

    if _column_exists("organizations", "accounting_enabled"):
        op.drop_column("organizations", "accounting_enabled")
