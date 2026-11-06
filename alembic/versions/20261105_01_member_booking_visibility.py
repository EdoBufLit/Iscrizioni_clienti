"""Explicit, opt-in publication of booking forms in the member area."""
from alembic import op
import sqlalchemy as sa

revision = "20261105_01_member_booking"
down_revision = "20261026_06_member_bulk"
branch_labels = None
depends_on = None


def upgrade():
    columns = {item["name"] for item in sa.inspect(op.get_bind()).get_columns("forms")}
    if "member_booking_visibility" not in columns:
        op.add_column("forms", sa.Column("member_booking_visibility", sa.String(16), nullable=False, server_default="hidden"))
    if "member_booking_visible_until" not in columns:
        op.add_column("forms", sa.Column("member_booking_visible_until", sa.Date(), nullable=True))


def downgrade():
    columns = {item["name"] for item in sa.inspect(op.get_bind()).get_columns("forms")}
    for name in ("member_booking_visible_until", "member_booking_visibility"):
        if name in columns:
            op.drop_column("forms", name)
