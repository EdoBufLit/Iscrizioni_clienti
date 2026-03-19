"""add whatsapp automations

Revision ID: c7d8e9f0a1b2
Revises: b61cfaf5fcf1
Create Date: 2026-03-19 10:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, Sequence[str], None] = "b61cfaf5fcf1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_automations",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("association_id", sa.Integer(), nullable=False),
        sa.Column("form_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "source_type",
            sa.String(),
            nullable=False,
            server_default="public_form",
        ),
        sa.Column(
            "trigger_event",
            sa.String(),
            nullable=False,
            server_default="form_submitted",
        ),
        sa.Column(
            "recipient_type",
            sa.String(),
            nullable=False,
            server_default="submitter",
        ),
        sa.Column(
            "phone_source",
            sa.String(),
            nullable=False,
            server_default="form_field",
        ),
        sa.Column("phone_field_key", sa.String(), nullable=True),
        sa.Column("custom_phone", sa.String(), nullable=True),
        sa.Column("template_name", sa.String(), nullable=False),
        sa.Column("template_body", sa.Text(), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
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
        sa.ForeignKeyConstraint(["association_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["admin_users.id"]),
        sa.ForeignKeyConstraint(["form_id"], ["forms.id"]),
    )
    op.create_index(
        "ix_whatsapp_automations_association_id",
        "whatsapp_automations",
        ["association_id"],
        unique=False,
    )
    op.create_index(
        "ix_whatsapp_automations_created_at",
        "whatsapp_automations",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ix_whatsapp_automations_created_by_user_id",
        "whatsapp_automations",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_whatsapp_automations_form_id",
        "whatsapp_automations",
        ["form_id"],
        unique=False,
    )
    op.create_index(
        "ix_whatsapp_automations_is_active",
        "whatsapp_automations",
        ["is_active"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_whatsapp_automations_is_active", table_name="whatsapp_automations")
    op.drop_index("ix_whatsapp_automations_form_id", table_name="whatsapp_automations")
    op.drop_index("ix_whatsapp_automations_created_by_user_id", table_name="whatsapp_automations")
    op.drop_index("ix_whatsapp_automations_created_at", table_name="whatsapp_automations")
    op.drop_index("ix_whatsapp_automations_association_id", table_name="whatsapp_automations")
    op.drop_table("whatsapp_automations")
