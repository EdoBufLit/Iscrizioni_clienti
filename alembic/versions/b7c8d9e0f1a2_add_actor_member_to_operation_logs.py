"""add actor_member_id to operation_logs

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-02-02 22:05:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b7c8d9e0f1a2"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("operation_logs")}
    if "actor_member_id" not in columns:
        op.add_column(
            "operation_logs",
            sa.Column("actor_member_id", sa.Integer(), nullable=True),
        )
    indexes = {idx["name"] for idx in inspector.get_indexes("operation_logs")}
    if "ix_operation_logs_actor_member_id" not in indexes:
        op.create_index(
            "ix_operation_logs_actor_member_id",
            "operation_logs",
            ["actor_member_id"],
        )


def downgrade():
    op.drop_index("ix_operation_logs_actor_member_id", table_name="operation_logs")
    op.drop_column("operation_logs", "actor_member_id")
