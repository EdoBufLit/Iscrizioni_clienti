"""add forms module

Revision ID: e9f0a1b2c3d4
Revises: 398e5af3b9bf
Create Date: 2026-03-10 17:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e9f0a1b2c3d4"
down_revision: Union[str, Sequence[str], None] = "398e5af3b9bf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "forms" not in tables:
        op.create_table(
            "forms",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "association_id",
                sa.Integer(),
                sa.ForeignKey("organizations.id"),
                nullable=False,
            ),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("public_slug", sa.String(), nullable=False),
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column(
                "visibility",
                sa.String(),
                nullable=False,
                server_default=sa.text("'public'"),
            ),
            sa.Column("success_message", sa.Text(), nullable=True),
            sa.Column("notification_email", sa.String(), nullable=True),
            sa.Column(
                "allow_multiple_submissions",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
            sa.Column(
                "created_by_user_id",
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
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint("public_slug", name="uq_forms_public_slug"),
        )

    if "form_fields" not in tables:
        op.create_table(
            "form_fields",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "form_id",
                sa.Integer(),
                sa.ForeignKey("forms.id"),
                nullable=False,
            ),
            sa.Column("field_key", sa.String(), nullable=False),
            sa.Column("field_type", sa.String(), nullable=False),
            sa.Column("label", sa.String(), nullable=False),
            sa.Column("placeholder", sa.Text(), nullable=True),
            sa.Column("help_text", sa.Text(), nullable=True),
            sa.Column(
                "is_required",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column(
                "sort_order",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            ),
            sa.Column("options_json", sa.JSON(), nullable=True),
            sa.UniqueConstraint("form_id", "field_key", name="uq_form_fields_form_key"),
        )

    if "form_submissions" not in tables:
        op.create_table(
            "form_submissions",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "form_id",
                sa.Integer(),
                sa.ForeignKey("forms.id"),
                nullable=False,
            ),
            sa.Column(
                "association_id",
                sa.Integer(),
                sa.ForeignKey("organizations.id"),
                nullable=False,
            ),
            sa.Column(
                "submitted_by_user_id",
                sa.Integer(),
                sa.ForeignKey("members.id"),
                nullable=True,
            ),
            sa.Column(
                "submitted_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "status",
                sa.String(),
                nullable=False,
                server_default=sa.text("'new'"),
            ),
            sa.Column("payload_json", sa.JSON(), nullable=False),
        )

    inspector = sa.inspect(bind)
    forms_indexes = (
        {index["name"] for index in inspector.get_indexes("forms")}
        if "forms" in inspector.get_table_names()
        else set()
    )
    for index_name, columns in [
        ("ix_forms_association_id", ["association_id"]),
        ("ix_forms_public_slug", ["public_slug"]),
        ("ix_forms_is_active", ["is_active"]),
        ("ix_forms_visibility", ["visibility"]),
        ("ix_forms_created_by_user_id", ["created_by_user_id"]),
        ("ix_forms_created_at", ["created_at"]),
    ]:
        if index_name not in forms_indexes:
            op.create_index(index_name, "forms", columns, unique=False)

    field_indexes = (
        {index["name"] for index in inspector.get_indexes("form_fields")}
        if "form_fields" in inspector.get_table_names()
        else set()
    )
    for index_name, columns in [
        ("ix_form_fields_form_id", ["form_id"]),
        ("ix_form_fields_field_type", ["field_type"]),
        ("ix_form_fields_sort_order", ["sort_order"]),
        ("ix_form_fields_form_sort", ["form_id", "sort_order"]),
    ]:
        if index_name not in field_indexes:
            op.create_index(index_name, "form_fields", columns, unique=False)

    submission_indexes = (
        {index["name"] for index in inspector.get_indexes("form_submissions")}
        if "form_submissions" in inspector.get_table_names()
        else set()
    )
    for index_name, columns in [
        ("ix_form_submissions_form_id", ["form_id"]),
        ("ix_form_submissions_association_id", ["association_id"]),
        ("ix_form_submissions_submitted_by_user_id", ["submitted_by_user_id"]),
        ("ix_form_submissions_submitted_at", ["submitted_at"]),
        ("ix_form_submissions_status", ["status"]),
    ]:
        if index_name not in submission_indexes:
            op.create_index(index_name, "form_submissions", columns, unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "form_submissions" in tables:
        indexes = {index["name"] for index in inspector.get_indexes("form_submissions")}
        for index_name in [
            "ix_form_submissions_status",
            "ix_form_submissions_submitted_at",
            "ix_form_submissions_submitted_by_user_id",
            "ix_form_submissions_association_id",
            "ix_form_submissions_form_id",
        ]:
            if index_name in indexes:
                op.drop_index(index_name, table_name="form_submissions")
        op.drop_table("form_submissions")

    if "form_fields" in tables:
        indexes = {index["name"] for index in inspector.get_indexes("form_fields")}
        for index_name in [
            "ix_form_fields_form_sort",
            "ix_form_fields_sort_order",
            "ix_form_fields_field_type",
            "ix_form_fields_form_id",
        ]:
            if index_name in indexes:
                op.drop_index(index_name, table_name="form_fields")
        op.drop_table("form_fields")

    if "forms" in tables:
        indexes = {index["name"] for index in inspector.get_indexes("forms")}
        for index_name in [
            "ix_forms_created_at",
            "ix_forms_created_by_user_id",
            "ix_forms_visibility",
            "ix_forms_is_active",
            "ix_forms_public_slug",
            "ix_forms_association_id",
        ]:
            if index_name in indexes:
                op.drop_index(index_name, table_name="forms")
        op.drop_table("forms")
