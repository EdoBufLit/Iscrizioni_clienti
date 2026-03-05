"""add affiliation wizard and video jobs infrastructure

Revision ID: aa1b2c3d4e5f
Revises: z9a0b1c2d3e4
Create Date: 2026-03-05 15:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "aa1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "z9a0b1c2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    try:
        return table_name in set(_inspector().get_table_names())
    except Exception:
        return False


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    try:
        indexes = _inspector().get_indexes(table_name)
    except Exception:
        return False
    return any(index.get("name") == index_name for index in indexes)


def _json_type(bind) -> sa.types.TypeEngine:
    if (bind.dialect.name or "").lower() == "postgresql":
        from sqlalchemy.dialects.postgresql import JSONB

        return JSONB(astext_type=sa.Text())
    return sa.JSON()


def _create_affiliation_applications(bind) -> None:
    if _table_exists("affiliation_applications"):
        return

    op.create_table(
        "affiliation_applications",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("public_token", sa.String(length=64), nullable=False),
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default=sa.text("'draft'"),
        ),
        sa.Column(
            "docs_status",
            sa.String(),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("payment_method", sa.String(), nullable=True),
        sa.Column(
            "payment_status",
            sa.String(),
            nullable=False,
            server_default=sa.text("'unpaid'"),
        ),
        sa.Column(
            "payment_amount_cents",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("organization_name", sa.String(), nullable=True),
        sa.Column("organization_legal_name", sa.String(), nullable=True),
        sa.Column("organization_slug_candidate", sa.String(), nullable=True),
        sa.Column("tax_code", sa.String(), nullable=True),
        sa.Column("vat_number", sa.String(), nullable=True),
        sa.Column("address_line1", sa.String(), nullable=True),
        sa.Column("address_line2", sa.String(), nullable=True),
        sa.Column("city", sa.String(), nullable=True),
        sa.Column("province", sa.String(), nullable=True),
        sa.Column("postal_code", sa.String(), nullable=True),
        sa.Column("country", sa.String(), nullable=True),
        sa.Column("applicant_full_name", sa.String(), nullable=True),
        sa.Column("applicant_email", sa.String(), nullable=True),
        sa.Column("applicant_phone", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("manual_preferred_date", sa.String(), nullable=True),
        sa.Column("manual_preferred_time", sa.String(), nullable=True),
        sa.Column("manual_contact", sa.String(), nullable=True),
        sa.Column("stripe_checkout_session_id", sa.String(), nullable=True),
        sa.Column("stripe_payment_intent_id", sa.String(), nullable=True),
        sa.Column("stripe_last_event_id", sa.String(), nullable=True),
        sa.Column("payment_verified_at", sa.DateTime(), nullable=True),
        sa.Column("payment_verified_by_admin_id", sa.Integer(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("reviewed_by_admin_id", sa.Integer(), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("rejected_at", sa.DateTime(), nullable=True),
        sa.Column("approved_org_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["approved_org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["payment_verified_by_admin_id"], ["admin_users.id"]),
        sa.ForeignKeyConstraint(["reviewed_by_admin_id"], ["admin_users.id"]),
        sa.UniqueConstraint("public_token", name="uq_affiliation_applications_public_token"),
    )


def _create_affiliation_people() -> None:
    if _table_exists("affiliation_people"):
        return

    op.create_table(
        "affiliation_people",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("application_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("fiscal_code", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["application_id"], ["affiliation_applications.id"]),
        sa.UniqueConstraint(
            "application_id",
            "role",
            name="uix_affiliation_people_application_role",
        ),
    )


def _create_affiliation_documents() -> None:
    if _table_exists("affiliation_documents"):
        return

    op.create_table(
        "affiliation_documents",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("application_id", sa.Integer(), nullable=False),
        sa.Column("doc_type", sa.String(), nullable=False),
        sa.Column("rel_path", sa.String(), nullable=False),
        sa.Column("original_filename", sa.String(), nullable=True),
        sa.Column("mime_type", sa.String(), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("sha256", sa.String(), nullable=True),
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("rejection_note", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("reviewed_by_admin_id", sa.Integer(), nullable=True),
        sa.Column("replaces_document_id", sa.Integer(), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["application_id"], ["affiliation_applications.id"]),
        sa.ForeignKeyConstraint(["replaces_document_id"], ["affiliation_documents.id"]),
        sa.ForeignKeyConstraint(["reviewed_by_admin_id"], ["admin_users.id"]),
    )


def _create_affiliation_events(bind) -> None:
    if _table_exists("affiliation_events"):
        return

    op.create_table(
        "affiliation_events",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("application_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column(
            "actor_type",
            sa.String(),
            nullable=False,
            server_default=sa.text("'system'"),
        ),
        sa.Column("actor_admin_id", sa.Integer(), nullable=True),
        sa.Column(
            "payload_json",
            _json_type(bind),
            nullable=False,
            server_default=sa.text("'{}'" if (bind.dialect.name or "").lower() != "postgresql" else "'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["application_id"], ["affiliation_applications.id"]),
        sa.ForeignKeyConstraint(["actor_admin_id"], ["admin_users.id"]),
    )


def _create_video_jobs(bind) -> None:
    if _table_exists("video_jobs"):
        return

    op.create_table(
        "video_jobs",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("application_id", sa.Integer(), nullable=True),
        sa.Column(
            "mode",
            sa.String(),
            nullable=False,
            server_default=sa.text("'review'"),
        ),
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default=sa.text("'queued'"),
        ),
        sa.Column(
            "provider",
            sa.String(),
            nullable=False,
            server_default=sa.text("'remotion'"),
        ),
        sa.Column("output_rel_path", sa.String(), nullable=True),
        sa.Column("error_text", sa.Text(), nullable=True),
        sa.Column(
            "payload_json",
            _json_type(bind),
            nullable=False,
            server_default=sa.text("'{}'" if (bind.dialect.name or "").lower() != "postgresql" else "'{}'::jsonb"),
        ),
        sa.Column("requested_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["application_id"], ["affiliation_applications.id"]),
    )


def _create_indexes() -> None:
    indexes: list[tuple[str, str, list[str], bool]] = [
        ("ix_affiliation_applications_public_token", "affiliation_applications", ["public_token"], True),
        ("ix_affiliation_applications_status", "affiliation_applications", ["status"], False),
        ("ix_affiliation_applications_docs_status", "affiliation_applications", ["docs_status"], False),
        ("ix_affiliation_applications_payment_status", "affiliation_applications", ["payment_status"], False),
        ("ix_affiliation_applications_applicant_email", "affiliation_applications", ["applicant_email"], False),
        (
            "ix_affiliation_applications_stripe_checkout_session_id",
            "affiliation_applications",
            ["stripe_checkout_session_id"],
            False,
        ),
        ("ix_affiliation_people_application_id", "affiliation_people", ["application_id"], False),
        ("ix_affiliation_documents_application_id", "affiliation_documents", ["application_id"], False),
        ("ix_affiliation_documents_doc_type", "affiliation_documents", ["doc_type"], False),
        ("ix_affiliation_documents_status", "affiliation_documents", ["status"], False),
        (
            "ix_affiliation_documents_application_doc_type_uploaded",
            "affiliation_documents",
            ["application_id", "doc_type", "uploaded_at"],
            False,
        ),
        ("ix_affiliation_events_application_id", "affiliation_events", ["application_id"], False),
        ("ix_affiliation_events_event_type", "affiliation_events", ["event_type"], False),
        ("ix_affiliation_events_created_at", "affiliation_events", ["created_at"], False),
        ("ix_video_jobs_application_id", "video_jobs", ["application_id"], False),
        ("ix_video_jobs_mode", "video_jobs", ["mode"], False),
        ("ix_video_jobs_status", "video_jobs", ["status"], False),
    ]

    for index_name, table_name, columns, unique in indexes:
        if _index_exists(table_name, index_name):
            continue
        op.create_index(index_name, table_name, columns, unique=unique)


def upgrade() -> None:
    bind = op.get_bind()

    _create_affiliation_applications(bind)
    _create_affiliation_people()
    _create_affiliation_documents()
    _create_affiliation_events(bind)
    _create_video_jobs(bind)
    _create_indexes()


def _drop_index_if_exists(table_name: str, index_name: str) -> None:
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)


def downgrade() -> None:
    for table_name, index_names in [
        (
            "video_jobs",
            ["ix_video_jobs_status", "ix_video_jobs_mode", "ix_video_jobs_application_id"],
        ),
        (
            "affiliation_events",
            [
                "ix_affiliation_events_created_at",
                "ix_affiliation_events_event_type",
                "ix_affiliation_events_application_id",
            ],
        ),
        (
            "affiliation_documents",
            [
                "ix_affiliation_documents_application_doc_type_uploaded",
                "ix_affiliation_documents_status",
                "ix_affiliation_documents_doc_type",
                "ix_affiliation_documents_application_id",
            ],
        ),
        ("affiliation_people", ["ix_affiliation_people_application_id"]),
        (
            "affiliation_applications",
            [
                "ix_affiliation_applications_stripe_checkout_session_id",
                "ix_affiliation_applications_applicant_email",
                "ix_affiliation_applications_payment_status",
                "ix_affiliation_applications_docs_status",
                "ix_affiliation_applications_status",
                "ix_affiliation_applications_public_token",
            ],
        ),
    ]:
        for index_name in index_names:
            _drop_index_if_exists(table_name, index_name)

    if _table_exists("video_jobs"):
        op.drop_table("video_jobs")
    if _table_exists("affiliation_events"):
        op.drop_table("affiliation_events")
    if _table_exists("affiliation_documents"):
        op.drop_table("affiliation_documents")
    if _table_exists("affiliation_people"):
        op.drop_table("affiliation_people")
    if _table_exists("affiliation_applications"):
        op.drop_table("affiliation_applications")
