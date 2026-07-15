"""Persist the communication type snapshot on email campaigns.

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-07-15 21:15:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "c1d2e3f4a5b6"
down_revision = "b0c1d2e3f4a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "email_campaigns",
        sa.Column(
            "template_type",
            sa.String(),
            nullable=False,
            server_default="generic_notice",
        ),
    )
    op.execute(
        """
        UPDATE email_campaigns
           SET template_type = COALESCE(
                (
                    SELECT email_templates.template_type
                      FROM email_templates
                     WHERE email_templates.id = email_campaigns.source_template_id
                ),
                'generic_notice'
           )
        """
    )
    op.create_index(
        "ix_email_campaigns_template_type",
        "email_campaigns",
        ["template_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_email_campaigns_template_type", table_name="email_campaigns")
    op.drop_column("email_campaigns", "template_type")
