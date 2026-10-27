"""Durable member selections, per-member outcomes and idempotent batches."""
from alembic import op
import sqlalchemy as sa

revision = "20261026_06_member_bulk"
down_revision = "20261026_05_accounting"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "member_bulk_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by_admin_id", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL")),
        sa.Column("request_key", sa.String(100), nullable=False),
        sa.Column("payload_fingerprint", sa.String(64), nullable=False),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column("selection_mode", sa.String(12), nullable=False),
        sa.Column("membership_year", sa.Integer()),
        sa.Column("status", sa.String(16), nullable=False, server_default="preview"),
        sa.Column("selected_count", sa.Integer(), nullable=False),
        sa.Column("eligible_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("org_id", "created_by_admin_id", "request_key", name="uq_member_bulk_runs_actor_request"),
        sa.CheckConstraint("action IN ('export','send_access','quote_reminder')", name="ck_member_bulk_runs_action"),
        sa.CheckConstraint("status IN ('preview','running','completed','expired')", name="ck_member_bulk_runs_status"),
        sa.CheckConstraint("selected_count >= 0 AND eligible_count >= 0 AND eligible_count <= selected_count", name="ck_member_bulk_runs_counts"),
    )
    op.create_index("ix_member_bulk_runs_org_id", "member_bulk_runs", ["org_id"])
    op.create_index("ix_member_bulk_runs_created_by_admin_id", "member_bulk_runs", ["created_by_admin_id"])
    op.create_index("ix_member_bulk_runs_org_created", "member_bulk_runs", ["org_id", "created_at"])
    op.create_table(
        "member_bulk_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("member_bulk_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="SET NULL")),
        sa.Column("requested_member_id", sa.Integer(), nullable=False),
        sa.Column("target_email_hash", sa.String(64)),
        sa.Column("preview_outstanding_cents", sa.Integer()),
        sa.Column("preview_eligible", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("reason_code", sa.String(80)),
        sa.Column("detail", sa.Text()),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("outbox_id", sa.String(36), sa.ForeignKey("email_outbox.id", ondelete="SET NULL")),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("run_id", "requested_member_id", name="uq_member_bulk_items_run_member"),
        sa.CheckConstraint("status IN ('pending','succeeded','skipped','failed')", name="ck_member_bulk_items_status"),
        sa.CheckConstraint("attempts >= 0", name="ck_member_bulk_items_attempts"),
    )
    op.create_index("ix_member_bulk_items_run_id", "member_bulk_items", ["run_id"])
    op.create_index("ix_member_bulk_items_run_status_id", "member_bulk_items", ["run_id", "status", "id"])
    op.create_table(
        "member_bulk_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("member_bulk_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_key", sa.String(100), nullable=False),
        sa.Column("operation", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("run_id", "request_key", name="uq_member_bulk_requests_run_key"),
        sa.CheckConstraint("operation IN ('execute','retry_failed')", name="ck_member_bulk_requests_operation"),
    )
    op.create_index("ix_member_bulk_requests_run_id", "member_bulk_requests", ["run_id"])


def downgrade():
    op.drop_table("member_bulk_requests")
    op.drop_table("member_bulk_items")
    op.drop_table("member_bulk_runs")
