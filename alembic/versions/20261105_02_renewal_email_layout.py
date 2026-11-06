"""Refresh only untouched, centrally managed renewal email presets."""
from alembic import op
from app.services.managed_renewal_email import refresh_untouched_system_renewal_templates

revision = "20261105_02_renewal_email"
down_revision = "20261105_01_member_booking"
branch_labels = None
depends_on = None


def upgrade():
    refresh_untouched_system_renewal_templates(op.get_bind())


def downgrade():
    # Presentation-only refresh: retaining the safe HTML avoids overwriting edits.
    pass
