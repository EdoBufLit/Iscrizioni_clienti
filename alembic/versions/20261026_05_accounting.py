"""Incoming receipts, reconciliation and immutable correction history."""
from alembic import op
import sqlalchemy as sa

revision = "20261026_05_accounting"
down_revision = "20261017_04_wallet_sync"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "accounting_receipts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="SET NULL")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="EUR"),
        sa.Column("method", sa.String(24), nullable=False),
        sa.Column("paid_on", sa.Date(), nullable=False),
        sa.Column("payer", sa.String(255)), sa.Column("reference", sa.String(255)), sa.Column("description", sa.Text()),
        sa.Column("source", sa.String(24), nullable=False), sa.Column("source_key", sa.String(255)),
        sa.Column("legacy_payment_id", sa.Integer(), sa.ForeignKey("membership_payments.id", ondelete="SET NULL"), unique=True),
        sa.Column("voided", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by_admin_id", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("org_id", "source_key", name="uq_accounting_receipt_org_source"),
        sa.CheckConstraint("amount_cents > 0", name="ck_accounting_receipt_positive"),
        sa.CheckConstraint("version >= 1", name="ck_accounting_receipt_version"),
    )
    op.create_index("ix_accounting_receipts_org_id", "accounting_receipts", ["org_id"])
    op.create_index("ix_accounting_receipt_org_date", "accounting_receipts", ["org_id", "paid_on", "id"])
    op.create_table(
        "accounting_allocations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="SET NULL")),
        sa.Column("receipt_id", sa.Integer(), sa.ForeignKey("accounting_receipts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("target_key", sa.String(100), nullable=False), sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("target_id", sa.Integer()),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="SET NULL")),
        sa.Column("member_name", sa.String(255), nullable=False), sa.Column("membership_year", sa.Integer()),
        sa.Column("expected_cents", sa.Integer(), nullable=False), sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("payment_id", sa.Integer(), sa.ForeignKey("membership_payments.id", ondelete="SET NULL")),
        sa.Column("reversed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("amount_cents > 0", name="ck_accounting_allocation_positive"),
        sa.CheckConstraint("expected_cents >= 0", name="ck_accounting_allocation_expected"),
    )
    for column in ("org_id", "receipt_id", "target_key", "member_id", "payment_id"):
        op.create_index(f"ix_accounting_allocations_{column}", "accounting_allocations", [column])
    op.create_index("ix_accounting_allocation_target_active", "accounting_allocations", ["org_id", "target_key", "reversed_at"])
    op.create_table(
        "accounting_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="SET NULL")),
        sa.Column("receipt_id", sa.Integer(), sa.ForeignKey("accounting_receipts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("action", sa.String(40), nullable=False), sa.Column("reason", sa.Text()),
        sa.Column("actor_admin_id", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL")),
        sa.Column("actor_snapshot", sa.JSON(), nullable=False), sa.Column("before_json", sa.JSON()), sa.Column("after_json", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    for column in ("org_id", "receipt_id"):
        op.create_index(f"ix_accounting_events_{column}", "accounting_events", [column])
    op.create_table(
        "accounting_mutations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="SET NULL")),
        sa.Column("request_key", sa.String(120), nullable=False), sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("response_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("org_id", "request_key", name="uq_accounting_mutation_org_key"),
    )
    op.create_index("ix_accounting_mutations_org_id", "accounting_mutations", ["org_id"])


def downgrade():
    for name in ("accounting_mutations", "accounting_events", "accounting_allocations", "accounting_receipts"):
        op.drop_table(name)
