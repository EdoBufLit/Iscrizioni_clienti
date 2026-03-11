"""add accounting archive tables

Revision ID: 7a8b9c0d1e2
Revises: 6c7d8e9f0a1b
Create Date: 2026-03-11 12:20:00.000000
"""

from __future__ import annotations

from datetime import datetime

from alembic import op
import sqlalchemy as sa
from sqlalchemy.orm import Session


# revision identifiers, used by Alembic.
revision = "7a8b9c0d1e2"
down_revision = "6c7d8e9f0a1b"
branch_labels = None
depends_on = None


ACCOUNTING_FOLDERS = sa.table(
    "accounting_folders",
    sa.column("id", sa.Integer),
    sa.column("org_id", sa.Integer),
    sa.column("name", sa.String),
    sa.column("slug", sa.String),
    sa.column("year", sa.Integer),
    sa.column("sort_order", sa.Integer),
    sa.column("is_active", sa.Boolean),
    sa.column("is_default", sa.Boolean),
    sa.column("created_at", sa.DateTime),
    sa.column("updated_at", sa.DateTime),
)

ACCOUNTING_CATEGORIES = sa.table(
    "accounting_categories",
    sa.column("id", sa.Integer),
    sa.column("org_id", sa.Integer),
    sa.column("code", sa.String),
    sa.column("name", sa.String),
    sa.column("is_system", sa.Boolean),
    sa.column("sort_order", sa.Integer),
    sa.column("is_active", sa.Boolean),
    sa.column("created_at", sa.DateTime),
    sa.column("updated_at", sa.DateTime),
)

ACCOUNTING_DOCUMENTS = sa.table(
    "accounting_documents",
    sa.column("id", sa.Integer),
    sa.column("org_id", sa.Integer),
    sa.column("folder_id", sa.Integer),
    sa.column("category_id", sa.Integer),
    sa.column("title", sa.String),
    sa.column("description", sa.Text),
    sa.column("storage_key", sa.String),
    sa.column("original_filename", sa.String),
    sa.column("mime_type", sa.String),
    sa.column("file_size", sa.Integer),
    sa.column("sha256", sa.String),
    sa.column("preview_enabled", sa.Boolean),
    sa.column("is_share_enabled", sa.Boolean),
    sa.column("uploaded_by_admin_id", sa.Integer),
    sa.column("legacy_shared_document_id", sa.Integer),
    sa.column("created_at", sa.DateTime),
    sa.column("updated_at", sa.DateTime),
)

LEGACY_ASSIGNMENTS = sa.table(
    "organization_shared_document_assignments",
    sa.column("id", sa.Integer),
    sa.column("document_id", sa.Integer),
    sa.column("association_id", sa.Integer),
    sa.column("created_at", sa.DateTime),
)

LEGACY_DOCUMENTS = sa.table(
    "organization_shared_documents",
    sa.column("id", sa.Integer),
    sa.column("title", sa.String),
    sa.column("description", sa.Text),
    sa.column("kind", sa.String),
    sa.column("rel_path", sa.String),
    sa.column("original_filename", sa.String),
    sa.column("mime_type", sa.String),
    sa.column("size_bytes", sa.Integer),
    sa.column("sha256", sa.String),
    sa.column("uploaded_by_admin_id", sa.Integer),
    sa.column("created_at", sa.DateTime),
)


def _table_exists(bind, table_name: str) -> bool:
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _create_tables_if_missing(bind) -> None:
    if not _table_exists(bind, "accounting_folders"):
        op.create_table(
            "accounting_folders",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "org_id",
                sa.Integer(),
                sa.ForeignKey("organizations.id"),
                nullable=True,
            ),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("slug", sa.String(), nullable=False),
            sa.Column("year", sa.Integer(), nullable=True),
            sa.Column(
                "sort_order",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
            sa.Column(
                "is_default",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint("slug", name="uq_accounting_folders_slug"),
        )
        op.create_index(
            "ix_accounting_folders_org_id",
            "accounting_folders",
            ["org_id"],
        )
        op.create_index(
            "ix_accounting_folders_year",
            "accounting_folders",
            ["year"],
        )

    if not _table_exists(bind, "accounting_categories"):
        op.create_table(
            "accounting_categories",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "org_id",
                sa.Integer(),
                sa.ForeignKey("organizations.id"),
                nullable=True,
            ),
            sa.Column("code", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column(
                "is_system",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column(
                "sort_order",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint("code", name="uq_accounting_categories_code"),
        )
        op.create_index(
            "ix_accounting_categories_org_id",
            "accounting_categories",
            ["org_id"],
        )

    if not _table_exists(bind, "accounting_documents"):
        op.create_table(
            "accounting_documents",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "org_id",
                sa.Integer(),
                sa.ForeignKey("organizations.id"),
                nullable=False,
            ),
            sa.Column(
                "folder_id",
                sa.Integer(),
                sa.ForeignKey("accounting_folders.id"),
                nullable=False,
            ),
            sa.Column(
                "category_id",
                sa.Integer(),
                sa.ForeignKey("accounting_categories.id"),
                nullable=False,
            ),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("storage_key", sa.String(), nullable=False),
            sa.Column("original_filename", sa.String(), nullable=False),
            sa.Column("mime_type", sa.String(), nullable=True),
            sa.Column("file_size", sa.Integer(), nullable=True),
            sa.Column("sha256", sa.String(), nullable=True),
            sa.Column(
                "preview_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
            sa.Column(
                "is_share_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column(
                "uploaded_by_admin_id",
                sa.Integer(),
                sa.ForeignKey("admin_users.id"),
                nullable=True,
            ),
            sa.Column(
                "legacy_shared_document_id",
                sa.Integer(),
                sa.ForeignKey("organization_shared_documents.id"),
                nullable=True,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint(
                "legacy_shared_document_id",
                "org_id",
                name="uq_accounting_documents_legacy_shared_org",
            ),
        )
        op.create_index(
            "ix_accounting_documents_org_id",
            "accounting_documents",
            ["org_id"],
        )
        op.create_index(
            "ix_accounting_documents_folder_id",
            "accounting_documents",
            ["folder_id"],
        )
        op.create_index(
            "ix_accounting_documents_category_id",
            "accounting_documents",
            ["category_id"],
        )
        op.create_index(
            "ix_accounting_documents_legacy_shared_document_id",
            "accounting_documents",
            ["legacy_shared_document_id"],
        )

    if not _table_exists(bind, "accounting_share_links"):
        op.create_table(
            "accounting_share_links",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "document_id",
                sa.Integer(),
                sa.ForeignKey("accounting_documents.id"),
                nullable=False,
            ),
            sa.Column("token", sa.String(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column(
                "created_by_admin_id",
                sa.Integer(),
                sa.ForeignKey("admin_users.id"),
                nullable=True,
            ),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint("token", name="uq_accounting_share_links_token"),
        )
        op.create_index(
            "ix_accounting_share_links_document_id",
            "accounting_share_links",
            ["document_id"],
        )
        op.create_index(
            "ix_accounting_share_links_expires_at",
            "accounting_share_links",
            ["expires_at"],
        )
        op.create_index(
            "ix_accounting_share_links_revoked_at",
            "accounting_share_links",
            ["revoked_at"],
        )


def _seed_defaults(session: Session) -> tuple[int, int]:
    folders_created = 0
    categories_created = 0
    now = datetime.utcnow()

    folder = session.execute(
        sa.select(ACCOUNTING_FOLDERS.c.id).where(
            ACCOUNTING_FOLDERS.c.slug == "archivio"
        )
    ).first()
    if folder is None:
        session.execute(
            ACCOUNTING_FOLDERS.insert().values(
                org_id=None,
                name="Archivio",
                slug="archivio",
                year=None,
                sort_order=10,
                is_active=True,
                is_default=True,
                created_at=now,
                updated_at=now,
            )
        )
        folders_created += 1

    for code, name, sort_order in (
        ("vat", "IVA", 100),
        ("payroll", "PAGHE", 200),
        ("tax_return", "DICHIARAZIONE DEI REDDITI", 300),
        ("custom_generale", "Generale", 1000),
    ):
        category = session.execute(
            sa.select(ACCOUNTING_CATEGORIES.c.id).where(
                ACCOUNTING_CATEGORIES.c.code == code
            )
        ).first()
        if category is not None:
            continue
        session.execute(
            ACCOUNTING_CATEGORIES.insert().values(
                org_id=None,
                code=code,
                name=name,
                is_system=code in {"vat", "payroll", "tax_return"},
                sort_order=sort_order,
                is_active=True,
                created_at=now,
                updated_at=now,
            )
        )
        categories_created += 1

    return folders_created, categories_created


def _backfill_legacy_documents(session: Session) -> int:
    folder_id = session.execute(
        sa.select(ACCOUNTING_FOLDERS.c.id).where(ACCOUNTING_FOLDERS.c.slug == "archivio")
    ).scalar_one()
    category_id = session.execute(
        sa.select(ACCOUNTING_CATEGORIES.c.id).where(
            ACCOUNTING_CATEGORIES.c.code == "custom_generale"
        )
    ).scalar_one()

    existing_pairs = {
        (legacy_shared_document_id, org_id)
        for legacy_shared_document_id, org_id in session.execute(
            sa.select(
                ACCOUNTING_DOCUMENTS.c.legacy_shared_document_id,
                ACCOUNTING_DOCUMENTS.c.org_id,
            ).where(ACCOUNTING_DOCUMENTS.c.legacy_shared_document_id.is_not(None))
        ).all()
    }

    legacy_rows = session.execute(
        sa.select(
            LEGACY_DOCUMENTS.c.id,
            LEGACY_DOCUMENTS.c.title,
            LEGACY_DOCUMENTS.c.description,
            LEGACY_DOCUMENTS.c.rel_path,
            LEGACY_DOCUMENTS.c.original_filename,
            LEGACY_DOCUMENTS.c.mime_type,
            LEGACY_DOCUMENTS.c.size_bytes,
            LEGACY_DOCUMENTS.c.sha256,
            LEGACY_DOCUMENTS.c.uploaded_by_admin_id,
            LEGACY_DOCUMENTS.c.created_at,
            LEGACY_ASSIGNMENTS.c.association_id,
        )
        .select_from(
            LEGACY_DOCUMENTS.join(
                LEGACY_ASSIGNMENTS,
                LEGACY_ASSIGNMENTS.c.document_id == LEGACY_DOCUMENTS.c.id,
            )
        )
        .where(LEGACY_DOCUMENTS.c.kind == "accounting")
        .order_by(LEGACY_DOCUMENTS.c.id.asc(), LEGACY_ASSIGNMENTS.c.id.asc())
    ).all()

    created = 0
    now = datetime.utcnow()
    for row in legacy_rows:
        key = (row.id, row.association_id)
        if key in existing_pairs:
            continue
        created_at = row.created_at or now
        session.execute(
            ACCOUNTING_DOCUMENTS.insert().values(
                org_id=row.association_id,
                folder_id=folder_id,
                category_id=category_id,
                title=row.title,
                description=row.description,
                storage_key=row.rel_path,
                original_filename=row.original_filename or row.rel_path.split("/")[-1],
                mime_type=row.mime_type,
                file_size=row.size_bytes,
                sha256=row.sha256,
                preview_enabled=bool(
                    row.mime_type == "application/pdf"
                    or (row.mime_type or "").startswith("image/")
                ),
                is_share_enabled=False,
                uploaded_by_admin_id=row.uploaded_by_admin_id,
                legacy_shared_document_id=row.id,
                created_at=created_at,
                updated_at=created_at,
            )
        )
        existing_pairs.add(key)
        created += 1
    return created


def upgrade() -> None:
    bind = op.get_bind()
    _create_tables_if_missing(bind)

    session = Session(bind=bind)
    try:
        _seed_defaults(session)
        _backfill_legacy_documents(session)
        session.commit()
    finally:
        session.close()


def downgrade() -> None:
    # Conservative downgrade: keep accounting archive tables to avoid destructive
    # loss on environments where they may have been created by bootstrap/create_all.
    pass
