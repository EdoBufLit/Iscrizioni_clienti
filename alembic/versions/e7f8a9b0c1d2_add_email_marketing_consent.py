"""Add email-marketing consent state and pseudonymized event history.

Revision ID: e7f8a9b0c1d2
Revises: d5e6f7a8b9c0
Create Date: 2026-07-15 14:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "e7f8a9b0c1d2"
down_revision = "d5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "members",
        sa.Column(
            "marketing_email_consent",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "members",
        sa.Column("marketing_email_consent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "members",
        sa.Column(
            "marketing_email_consent_withdrawn_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "members",
        sa.Column("marketing_email_consent_version", sa.String(length=32), nullable=True),
    )
    op.create_index(
        op.f("ix_members_marketing_email_consent"),
        "members",
        ["marketing_email_consent"],
        unique=False,
    )

    op.create_table(
        "marketing_consent_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("association_id", sa.Integer(), nullable=False),
        sa.Column("subject_ref_hash", sa.String(length=64), nullable=False),
        sa.Column("email_hash", sa.String(length=64), nullable=False),
        sa.Column("channel", sa.String(length=16), server_default="email", nullable=False),
        sa.Column("event_action", sa.String(length=16), nullable=False),
        sa.Column("notice_version", sa.String(length=32), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("ip_hash", sa.String(length=64), nullable=True),
        sa.Column("user_agent_hash", sa.String(length=64), nullable=True),
        sa.Column(
            "proof_version",
            sa.String(length=32),
            server_default="hmac-sha256-v1",
            nullable=False,
        ),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_marketing_consent_events_id"),
        "marketing_consent_events",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_marketing_consent_events_association_id"),
        "marketing_consent_events",
        ["association_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_marketing_consent_events_subject_ref_hash"),
        "marketing_consent_events",
        ["subject_ref_hash"],
        unique=False,
    )
    op.create_index(
        op.f("ix_marketing_consent_events_email_hash"),
        "marketing_consent_events",
        ["email_hash"],
        unique=False,
    )
    op.create_index(
        op.f("ix_marketing_consent_events_event_action"),
        "marketing_consent_events",
        ["event_action"],
        unique=False,
    )
    op.create_index(
        op.f("ix_marketing_consent_events_occurred_at"),
        "marketing_consent_events",
        ["occurred_at"],
        unique=False,
    )
    op.create_index(
        "ix_marketing_consent_events_org_action_time",
        "marketing_consent_events",
        ["association_id", "event_action", "occurred_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_marketing_consent_events_org_action_time",
        table_name="marketing_consent_events",
    )
    op.drop_index(
        op.f("ix_marketing_consent_events_occurred_at"),
        table_name="marketing_consent_events",
    )
    op.drop_index(
        op.f("ix_marketing_consent_events_event_action"),
        table_name="marketing_consent_events",
    )
    op.drop_index(
        op.f("ix_marketing_consent_events_email_hash"),
        table_name="marketing_consent_events",
    )
    op.drop_index(
        op.f("ix_marketing_consent_events_subject_ref_hash"),
        table_name="marketing_consent_events",
    )
    op.drop_index(
        op.f("ix_marketing_consent_events_association_id"),
        table_name="marketing_consent_events",
    )
    op.drop_index(
        op.f("ix_marketing_consent_events_id"),
        table_name="marketing_consent_events",
    )
    op.drop_table("marketing_consent_events")

    op.drop_index(op.f("ix_members_marketing_email_consent"), table_name="members")
    op.drop_column("members", "marketing_email_consent_version")
    op.drop_column("members", "marketing_email_consent_withdrawn_at")
    op.drop_column("members", "marketing_email_consent_at")
    op.drop_column("members", "marketing_email_consent")
