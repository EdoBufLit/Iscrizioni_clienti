"""add email builder fields and assets

Revision ID: n7p8q9r0s1t2
Revises: c91f4b7e2a10
Create Date: 2026-03-20 18:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "n7p8q9r0s1t2"
down_revision = "c91f4b7e2a10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "email_templates",
        sa.Column(
            "template_type",
            sa.String(),
            nullable=False,
            server_default="generic_notice",
        ),
    )
    op.add_column(
        "email_templates",
        sa.Column(
            "editor_status",
            sa.String(),
            nullable=False,
            server_default="draft",
        ),
    )
    op.add_column("email_templates", sa.Column("grapesjs_project_json", sa.JSON(), nullable=True))
    op.add_column("email_templates", sa.Column("mjml_source", sa.Text(), nullable=True))
    op.add_column("email_templates", sa.Column("compiled_html", sa.Text(), nullable=True))
    op.create_index(
        op.f("ix_email_templates_template_type"),
        "email_templates",
        ["template_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_email_templates_editor_status"),
        "email_templates",
        ["editor_status"],
        unique=False,
    )

    op.add_column(
        "email_campaigns",
        sa.Column("source_template_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "email_campaigns",
        sa.Column(
            "editor_status",
            sa.String(),
            nullable=False,
            server_default="draft",
        ),
    )
    op.add_column("email_campaigns", sa.Column("grapesjs_project_json", sa.JSON(), nullable=True))
    op.add_column("email_campaigns", sa.Column("mjml_source", sa.Text(), nullable=True))
    op.add_column("email_campaigns", sa.Column("compiled_html", sa.Text(), nullable=True))
    op.create_index(
        op.f("ix_email_campaigns_source_template_id"),
        "email_campaigns",
        ["source_template_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_email_campaigns_editor_status"),
        "email_campaigns",
        ["editor_status"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_email_campaigns_source_template_id_email_templates",
        "email_campaigns",
        "email_templates",
        ["source_template_id"],
        ["id"],
    )

    op.create_table(
        "email_builder_assets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("association_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("file_name", sa.String(), nullable=False),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("public_url", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["association_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["admin_users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_email_builder_assets_id"), "email_builder_assets", ["id"], unique=False)
    op.create_index(
        op.f("ix_email_builder_assets_association_id"),
        "email_builder_assets",
        ["association_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_email_builder_assets_created_by_user_id"),
        "email_builder_assets",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_email_builder_assets_created_at"),
        "email_builder_assets",
        ["created_at"],
        unique=False,
    )

    op.execute(
        """
        UPDATE email_templates
           SET template_type = CASE
                WHEN lower(coalesce(category, '')) IN ('newsletter', 'onboarding') THEN 'newsletter'
                WHEN lower(coalesce(category, '')) IN ('events', 'event', 'assembly') THEN 'event'
                WHEN lower(coalesce(category, '')) IN ('renewal', 'reminder') THEN 'renewal_reminder'
                WHEN lower(coalesce(category, '')) = 'booking_confirmation' THEN 'booking_confirmation'
                WHEN lower(coalesce(category, '')) = 'booking_rejection' THEN 'booking_rejection'
                ELSE 'generic_notice'
           END,
               editor_status = CASE
                WHEN coalesce(is_active, true) THEN 'ready'
                ELSE 'draft'
           END,
               compiled_html = coalesce(compiled_html, body_html)
         WHERE template_type IS NULL
            OR editor_status IS NULL
            OR compiled_html IS NULL
        """
    )
    op.execute(
        """
        UPDATE email_campaigns
           SET editor_status = CASE
                WHEN lower(coalesce(status, '')) IN ('sent', 'sending', 'scheduled', 'partial_failed') THEN 'ready'
                ELSE 'draft'
           END,
               compiled_html = coalesce(compiled_html, body_html)
         WHERE editor_status IS NULL
            OR compiled_html IS NULL
        """
    )

    op.alter_column("email_templates", "template_type", server_default=None)
    op.alter_column("email_templates", "editor_status", server_default=None)
    op.alter_column("email_campaigns", "editor_status", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_email_builder_assets_created_at"), table_name="email_builder_assets")
    op.drop_index(op.f("ix_email_builder_assets_created_by_user_id"), table_name="email_builder_assets")
    op.drop_index(op.f("ix_email_builder_assets_association_id"), table_name="email_builder_assets")
    op.drop_index(op.f("ix_email_builder_assets_id"), table_name="email_builder_assets")
    op.drop_table("email_builder_assets")

    op.drop_constraint(
        "fk_email_campaigns_source_template_id_email_templates",
        "email_campaigns",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_email_campaigns_editor_status"), table_name="email_campaigns")
    op.drop_index(op.f("ix_email_campaigns_source_template_id"), table_name="email_campaigns")
    op.drop_column("email_campaigns", "compiled_html")
    op.drop_column("email_campaigns", "mjml_source")
    op.drop_column("email_campaigns", "grapesjs_project_json")
    op.drop_column("email_campaigns", "editor_status")
    op.drop_column("email_campaigns", "source_template_id")

    op.drop_index(op.f("ix_email_templates_editor_status"), table_name="email_templates")
    op.drop_index(op.f("ix_email_templates_template_type"), table_name="email_templates")
    op.drop_column("email_templates", "compiled_html")
    op.drop_column("email_templates", "mjml_source")
    op.drop_column("email_templates", "grapesjs_project_json")
    op.drop_column("email_templates", "editor_status")
    op.drop_column("email_templates", "template_type")
