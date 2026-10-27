"""Indexes for bounded inbox, agenda and quote reads."""
from alembic import op
import sqlalchemy as sa

revision = "20261017_03_performance_indexes"
down_revision = "20261017_02_temporary"
branch_labels = None
depends_on = None

INDEXES = (
    ("ix_form_submissions_form_date_id", "form_submissions", ["form_id", "submitted_at", "id"]),
    ("ix_bookings_org_date_id", "bookings", ["association_id", "booking_date", "id"]),
    ("ix_membership_payments_term_created_id", "membership_payments", ["annual_term_id", "created_at", "id"]),
)


def upgrade():
    inspector = sa.inspect(op.get_bind())
    for name, table, columns in INDEXES:
        if name not in {item["name"] for item in inspector.get_indexes(table)}:
            op.create_index(name, table, columns)


def downgrade():
    inspector = sa.inspect(op.get_bind())
    for name, table, _ in reversed(INDEXES):
        if name in {item["name"] for item in inspector.get_indexes(table)}:
            op.drop_index(name, table_name=table)
