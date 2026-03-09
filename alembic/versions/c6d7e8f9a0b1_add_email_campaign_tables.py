"""add email campaign tables

Revision ID: c6d7e8f9a0b1
Revises: a1c9e8f7b6d5
Create Date: 2026-03-09 13:15:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c6d7e8f9a0b1"
down_revision: Union[str, Sequence[str], None] = "a1c9e8f7b6d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "email_campaigns" not in tables:
        op.create_table(
            "email_campaigns",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "association_id",
                sa.Integer(),
                sa.ForeignKey("organizations.id"),
                nullable=False,
            ),
            sa.Column("name", sa.String(), nullable=True),
            sa.Column("subject", sa.String(), nullable=False),
            sa.Column("body_html", sa.Text(), nullable=True),
            sa.Column("body_text", sa.Text(), nullable=True),
            sa.Column("audience_type", sa.String(), nullable=False),
            sa.Column(
                "status",
                sa.String(),
                nullable=False,
                server_default=sa.text("'draft'"),
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
            sa.Column("scheduled_at", sa.DateTime(), nullable=True),
            sa.Column("sent_at", sa.DateTime(), nullable=True),
        )

    if "email_campaign_recipients" not in tables:
        op.create_table(
            "email_campaign_recipients",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "campaign_id",
                sa.Integer(),
                sa.ForeignKey("email_campaigns.id"),
                nullable=False,
            ),
            sa.Column(
                "association_id",
                sa.Integer(),
                sa.ForeignKey("organizations.id"),
                nullable=False,
            ),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("members.id"),
                nullable=True,
            ),
            sa.Column("recipient_email", sa.String(), nullable=False),
            sa.Column("recipient_name", sa.String(), nullable=True),
            sa.Column("provider_message_id", sa.Text(), nullable=True),
            sa.Column("delivery_status", sa.String(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column("sent_at", sa.DateTime(), nullable=True),
        )

    campaign_indexes = (
        {index["name"] for index in inspector.get_indexes("email_campaigns")}
        if "email_campaigns" in set(inspector.get_table_names()) | {"email_campaigns"}
        else set()
    )
    for index_name, columns in [
        ("ix_email_campaigns_association_id", ["association_id"]),
        ("ix_email_campaigns_audience_type", ["audience_type"]),
        ("ix_email_campaigns_status", ["status"]),
        ("ix_email_campaigns_created_by_user_id", ["created_by_user_id"]),
        ("ix_email_campaigns_created_at", ["created_at"]),
    ]:
        if index_name not in campaign_indexes:
            op.create_index(index_name, "email_campaigns", columns, unique=False)

    recipient_indexes = (
        {index["name"] for index in inspector.get_indexes("email_campaign_recipients")}
        if "email_campaign_recipients" in set(inspector.get_table_names()) | {"email_campaign_recipients"}
        else set()
    )
    for index_name, columns in [
        ("ix_email_campaign_recipients_campaign_id", ["campaign_id"]),
        ("ix_email_campaign_recipients_association_id", ["association_id"]),
        ("ix_email_campaign_recipients_user_id", ["user_id"]),
        ("ix_email_campaign_recipients_recipient_email", ["recipient_email"]),
        ("ix_email_campaign_recipients_delivery_status", ["delivery_status"]),
        ("ix_email_campaign_recipients_created_at", ["created_at"]),
    ]:
        if index_name not in recipient_indexes:
            op.create_index(index_name, "email_campaign_recipients", columns, unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "email_campaign_recipients" in tables:
        recipient_indexes = {
            index["name"] for index in inspector.get_indexes("email_campaign_recipients")
        }
        for index_name in [
            "ix_email_campaign_recipients_created_at",
            "ix_email_campaign_recipients_delivery_status",
            "ix_email_campaign_recipients_recipient_email",
            "ix_email_campaign_recipients_user_id",
            "ix_email_campaign_recipients_association_id",
            "ix_email_campaign_recipients_campaign_id",
        ]:
            if index_name in recipient_indexes:
                op.drop_index(index_name, table_name="email_campaign_recipients")
        op.drop_table("email_campaign_recipients")

    if "email_campaigns" in tables:
        campaign_indexes = {
            index["name"] for index in inspector.get_indexes("email_campaigns")
        }
        for index_name in [
            "ix_email_campaigns_created_at",
            "ix_email_campaigns_created_by_user_id",
            "ix_email_campaigns_status",
            "ix_email_campaigns_audience_type",
            "ix_email_campaigns_association_id",
        ]:
            if index_name in campaign_indexes:
                op.drop_index(index_name, table_name="email_campaigns")
        op.drop_table("email_campaigns")
