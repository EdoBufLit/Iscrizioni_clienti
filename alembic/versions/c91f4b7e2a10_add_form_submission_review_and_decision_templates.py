"""add form submission review and decision templates

Revision ID: c91f4b7e2a10
Revises: 47b20c34c33e
Create Date: 2026-03-20 11:45:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "c91f4b7e2a10"
down_revision = "47b20c34c33e"
branch_labels = None
depends_on = None


def _table_names(bind) -> set[str]:
    return set(sa.inspect(bind).get_table_names())


def _column_names(bind, table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    tables = _table_names(bind)

    if "forms" in tables:
        form_columns = _column_names(bind, "forms")
        if "whatsapp_confirmation_template" not in form_columns:
            op.add_column("forms", sa.Column("whatsapp_confirmation_template", sa.Text(), nullable=True))
        if "whatsapp_rejection_template" not in form_columns:
            op.add_column("forms", sa.Column("whatsapp_rejection_template", sa.Text(), nullable=True))

    if "form_submissions" in tables:
        submission_columns = _column_names(bind, "form_submissions")
        if "reviewed_at" not in submission_columns:
            op.add_column("form_submissions", sa.Column("reviewed_at", sa.DateTime(), nullable=True))
        if "reviewed_by_admin_id" not in submission_columns:
            op.add_column("form_submissions", sa.Column("reviewed_by_admin_id", sa.Integer(), nullable=True))
        if "review_reason" not in submission_columns:
            op.add_column("form_submissions", sa.Column("review_reason", sa.Text(), nullable=True))
        submission_columns = _column_names(bind, "form_submissions")
        if "reviewed_by_admin_id" in submission_columns:
            foreign_keys = {fk["name"] for fk in sa.inspect(bind).get_foreign_keys("form_submissions") if fk.get("name")}
            if "fk_form_submissions_reviewed_by_admin_id" not in foreign_keys:
                with op.batch_alter_table("form_submissions") as batch_op:
                    batch_op.create_foreign_key(
                        "fk_form_submissions_reviewed_by_admin_id",
                        "admin_users",
                        ["reviewed_by_admin_id"],
                        ["id"],
                    )
            indexes = {index["name"] for index in sa.inspect(bind).get_indexes("form_submissions")}
            if "ix_form_submissions_reviewed_by_admin_id" not in indexes:
                op.create_index(
                    "ix_form_submissions_reviewed_by_admin_id",
                    "form_submissions",
                    ["reviewed_by_admin_id"],
                    unique=False,
                )

        op.execute(
            sa.text(
                """
                UPDATE form_submissions
                   SET status = 'pending'
                 WHERE status IS NULL
                    OR trim(status) = ''
                    OR lower(trim(status)) = 'new'
                """
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    tables = _table_names(bind)

    if "form_submissions" in tables:
        indexes = {index["name"] for index in sa.inspect(bind).get_indexes("form_submissions")}
        if "ix_form_submissions_reviewed_by_admin_id" in indexes:
            op.drop_index("ix_form_submissions_reviewed_by_admin_id", table_name="form_submissions")
        foreign_keys = {fk["name"] for fk in sa.inspect(bind).get_foreign_keys("form_submissions") if fk.get("name")}
        if "fk_form_submissions_reviewed_by_admin_id" in foreign_keys:
            with op.batch_alter_table("form_submissions") as batch_op:
                batch_op.drop_constraint("fk_form_submissions_reviewed_by_admin_id", type_="foreignkey")
        submission_columns = _column_names(bind, "form_submissions")
        for column_name in ("review_reason", "reviewed_by_admin_id", "reviewed_at"):
            if column_name in submission_columns:
                op.drop_column("form_submissions", column_name)
                submission_columns = _column_names(bind, "form_submissions")

    if "forms" in tables:
        form_columns = _column_names(bind, "forms")
        for column_name in ("whatsapp_rejection_template", "whatsapp_confirmation_template"):
            if column_name in form_columns:
                op.drop_column("forms", column_name)
                form_columns = _column_names(bind, "forms")
