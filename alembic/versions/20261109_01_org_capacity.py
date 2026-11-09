"""Add organization venue capacity and daily alert state."""

import sqlalchemy as sa
from alembic import op

revision = "20261109_01_org_capacity"
down_revision = "20261105_02_renewal_email"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    if "max_capacity" not in {column["name"] for column in inspector.get_columns("organizations")}:
        op.add_column("organizations", sa.Column("max_capacity", sa.Integer(), nullable=True))
    if inspector.has_table("org_capacity_alerts"):
        return
    op.create_table(
        "org_capacity_alerts",
        sa.Column(
            "org_id",
            sa.Integer(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("source", sa.String(16), primary_key=True),
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("full_notified", sa.Boolean(), nullable=False),
    )


def downgrade():
    op.drop_table("org_capacity_alerts")
    op.drop_column("organizations", "max_capacity")
