"""Add tenant-scoped fields for the consultable audit registry.

Revision ID: c8d9e0f1a2b3
Revises: d7c8d9e0f1a2
Create Date: 2026-07-18 18:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "c8d9e0f1a2b3"
down_revision = "d7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("operation_logs") as batch_op:
        batch_op.add_column(sa.Column("org_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("category", sa.String(), nullable=True))
        batch_op.add_column(
            sa.Column("outcome", sa.String(), nullable=False, server_default="success")
        )
        batch_op.add_column(sa.Column("request_id", sa.String(length=64), nullable=True))
        batch_op.create_foreign_key(
            "fk_operation_logs_org_id",
            "organizations",
            ["org_id"],
            ["id"],
            ondelete="SET NULL",
        )

    op.create_index("ix_operation_logs_org_id", "operation_logs", ["org_id"])
    op.create_index("ix_operation_logs_category", "operation_logs", ["category"])
    op.create_index("ix_operation_logs_outcome", "operation_logs", ["outcome"])
    op.create_index("ix_operation_logs_request_id", "operation_logs", ["request_id"])

    # Associate legacy records conservatively. Super-admin-only records remain
    # global; tenant admins never see rows whose organization cannot be proven.
    op.execute(
        sa.text(
            """
            UPDATE operation_logs
               SET org_id = (
                   SELECT admin_users.org_id
                     FROM admin_users
                    WHERE admin_users.id = operation_logs.actor_admin_id
               )
             WHERE org_id IS NULL
               AND actor_admin_id IS NOT NULL
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE operation_logs
               SET org_id = (
                   SELECT members.org_id
                     FROM members
                    WHERE members.id = operation_logs.entity_id
               )
             WHERE org_id IS NULL
               AND entity_type = 'member'
               AND entity_id IS NOT NULL
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE operation_logs
               SET org_id = entity_id
             WHERE org_id IS NULL
               AND entity_type IN ('organization', 'association')
               AND entity_id IS NOT NULL
               AND EXISTS (
                   SELECT 1
                     FROM organizations
                    WHERE organizations.id = operation_logs.entity_id
               )
            """
        )
    )

    bind = op.get_bind()
    if (bind.dialect.name or "").lower() == "postgresql":
        op.execute(
            sa.text(
                "UPDATE operation_logs SET category = split_part(action, '.', 1) "
                "WHERE category IS NULL"
            )
        )
    else:
        op.execute(
            sa.text(
                """
                UPDATE operation_logs
                   SET category = CASE
                       WHEN instr(action, '.') > 0 THEN substr(action, 1, instr(action, '.') - 1)
                       ELSE action
                   END
                 WHERE category IS NULL
                """
            )
        )


def downgrade() -> None:
    op.drop_index("ix_operation_logs_request_id", table_name="operation_logs")
    op.drop_index("ix_operation_logs_outcome", table_name="operation_logs")
    op.drop_index("ix_operation_logs_category", table_name="operation_logs")
    op.drop_index("ix_operation_logs_org_id", table_name="operation_logs")
    with op.batch_alter_table("operation_logs") as batch_op:
        batch_op.drop_constraint("fk_operation_logs_org_id", type_="foreignkey")
        batch_op.drop_column("request_id")
        batch_op.drop_column("outcome")
        batch_op.drop_column("category")
        batch_op.drop_column("org_id")
