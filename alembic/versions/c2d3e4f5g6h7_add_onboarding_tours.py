"""add onboarding tours

Revision ID: c2d3e4f5g6h7
Revises: b7c8d9e0f1a2
Create Date: 2026-02-04 14:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c2d3e4f5g6h7"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade():
    # Create table with unique constraint inline (SQLite compatible)
    op.create_table(
        "onboarding_tours",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("tour_key", sa.String(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("skipped_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "role", "tour_key", name="uix_user_role_tour"),
    )
    op.create_index(
        "ix_onboarding_tours_user_role",
        "onboarding_tours",
        ["user_id", "role"],
    )


def downgrade():
    op.drop_index("ix_onboarding_tours_user_role", table_name="onboarding_tours")
    op.drop_table("onboarding_tours")
