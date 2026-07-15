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


def _table_names(bind) -> set[str]:
    return set(sa.inspect(bind).get_table_names())


def _column_names(bind, table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns(table_name)}


def _index_names(bind, table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(bind).get_indexes(table_name)}


def _foreign_key_names(bind, table_name: str) -> set[str]:
    return {
        foreign_key["name"]
        for foreign_key in sa.inspect(bind).get_foreign_keys(table_name)
        if foreign_key.get("name")
    }


def upgrade() -> None:
    bind = op.get_bind()
    tables = _table_names(bind)
    is_sqlite = bind.dialect.name == "sqlite"

    template_columns = _column_names(bind, "email_templates")
    template_additions = (
        sa.Column(
            "template_type",
            sa.String(),
            nullable=False,
            server_default="generic_notice",
        ),
        sa.Column(
            "editor_status",
            sa.String(),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("grapesjs_project_json", sa.JSON(), nullable=True),
        sa.Column("mjml_source", sa.Text(), nullable=True),
        sa.Column("compiled_html", sa.Text(), nullable=True),
    )
    for column in template_additions:
        if column.name not in template_columns:
            op.add_column("email_templates", column)
            template_columns.add(column.name)

    template_indexes = _index_names(bind, "email_templates")
    for index_name, columns in (
        ("ix_email_templates_template_type", ["template_type"]),
        ("ix_email_templates_editor_status", ["editor_status"]),
    ):
        if index_name not in template_indexes:
            op.create_index(index_name, "email_templates", columns, unique=False)

    campaign_columns = _column_names(bind, "email_campaigns")
    campaign_additions = (
        sa.Column("source_template_id", sa.Integer(), nullable=True),
        sa.Column(
            "editor_status",
            sa.String(),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("grapesjs_project_json", sa.JSON(), nullable=True),
        sa.Column("mjml_source", sa.Text(), nullable=True),
        sa.Column("compiled_html", sa.Text(), nullable=True),
    )
    for column in campaign_additions:
        if column.name not in campaign_columns:
            op.add_column("email_campaigns", column)
            campaign_columns.add(column.name)

    campaign_indexes = _index_names(bind, "email_campaigns")
    for index_name, columns in (
        ("ix_email_campaigns_source_template_id", ["source_template_id"]),
        ("ix_email_campaigns_editor_status", ["editor_status"]),
    ):
        if index_name not in campaign_indexes:
            op.create_index(index_name, "email_campaigns", columns, unique=False)

    if "email_builder_assets" not in tables:
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

    asset_indexes = _index_names(bind, "email_builder_assets")
    for index_name, columns in (
        ("ix_email_builder_assets_id", ["id"]),
        ("ix_email_builder_assets_association_id", ["association_id"]),
        ("ix_email_builder_assets_created_by_user_id", ["created_by_user_id"]),
        ("ix_email_builder_assets_created_at", ["created_at"]),
    ):
        if index_name not in asset_indexes:
            op.create_index(index_name, "email_builder_assets", columns, unique=False)

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

    foreign_key_name = "fk_email_campaigns_source_template_id_email_templates"
    foreign_keys = _foreign_key_names(bind, "email_campaigns")
    if is_sqlite:
        with op.batch_alter_table("email_templates") as batch_op:
            batch_op.alter_column(
                "template_type", existing_type=sa.String(), server_default=None
            )
            batch_op.alter_column(
                "editor_status", existing_type=sa.String(), server_default=None
            )
        with op.batch_alter_table("email_campaigns") as batch_op:
            if foreign_key_name not in foreign_keys:
                batch_op.create_foreign_key(
                    foreign_key_name,
                    "email_templates",
                    ["source_template_id"],
                    ["id"],
                )
            batch_op.alter_column(
                "editor_status", existing_type=sa.String(), server_default=None
            )
    else:
        if foreign_key_name not in foreign_keys:
            op.create_foreign_key(
                foreign_key_name,
                "email_campaigns",
                "email_templates",
                ["source_template_id"],
                ["id"],
            )
        op.alter_column("email_templates", "template_type", server_default=None)
        op.alter_column("email_templates", "editor_status", server_default=None)
        op.alter_column("email_campaigns", "editor_status", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    tables = _table_names(bind)
    is_sqlite = bind.dialect.name == "sqlite"

    if "email_builder_assets" in tables:
        asset_indexes = _index_names(bind, "email_builder_assets")
        for index_name in (
            "ix_email_builder_assets_created_at",
            "ix_email_builder_assets_created_by_user_id",
            "ix_email_builder_assets_association_id",
            "ix_email_builder_assets_id",
        ):
            if index_name in asset_indexes:
                op.drop_index(index_name, table_name="email_builder_assets")
        op.drop_table("email_builder_assets")

    if "email_campaigns" in tables:
        campaign_indexes = _index_names(bind, "email_campaigns")
        for index_name in (
            "ix_email_campaigns_editor_status",
            "ix_email_campaigns_source_template_id",
        ):
            if index_name in campaign_indexes:
                op.drop_index(index_name, table_name="email_campaigns")

        campaign_columns = _column_names(bind, "email_campaigns")
        foreign_key_name = "fk_email_campaigns_source_template_id_email_templates"
        foreign_keys = _foreign_key_names(bind, "email_campaigns")
        removable_campaign_columns = (
            "compiled_html",
            "mjml_source",
            "grapesjs_project_json",
            "editor_status",
            "source_template_id",
        )
        if is_sqlite:
            with op.batch_alter_table("email_campaigns") as batch_op:
                if foreign_key_name in foreign_keys:
                    batch_op.drop_constraint(foreign_key_name, type_="foreignkey")
                for column_name in removable_campaign_columns:
                    if column_name in campaign_columns:
                        batch_op.drop_column(column_name)
        else:
            if foreign_key_name in foreign_keys:
                op.drop_constraint(
                    foreign_key_name,
                    "email_campaigns",
                    type_="foreignkey",
                )
            for column_name in removable_campaign_columns:
                if column_name in campaign_columns:
                    op.drop_column("email_campaigns", column_name)

    if "email_templates" in tables:
        template_indexes = _index_names(bind, "email_templates")
        for index_name in (
            "ix_email_templates_editor_status",
            "ix_email_templates_template_type",
        ):
            if index_name in template_indexes:
                op.drop_index(index_name, table_name="email_templates")

        template_columns = _column_names(bind, "email_templates")
        removable_template_columns = (
            "compiled_html",
            "mjml_source",
            "grapesjs_project_json",
            "editor_status",
            "template_type",
        )
        if is_sqlite:
            with op.batch_alter_table("email_templates") as batch_op:
                for column_name in removable_template_columns:
                    if column_name in template_columns:
                        batch_op.drop_column(column_name)
        else:
            for column_name in removable_template_columns:
                if column_name in template_columns:
                    op.drop_column("email_templates", column_name)
