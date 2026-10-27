"""Persist Wallet identities and recoverable synchronization jobs."""
from alembic import op
import sqlalchemy as sa

revision = "20261017_04_wallet_sync"
down_revision = "20261017_03_performance_indexes"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "google_wallet_passes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="SET NULL")),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="SET NULL")),
        sa.Column("object_id", sa.String(255), nullable=False, unique=True),
        sa.Column("class_id", sa.String(255), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("temporary_purchase_id", sa.Integer()),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("provisioning", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("desired_revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("synced_revision", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("payload_json", sa.JSON()),
        sa.Column("payload_hash", sa.String(64)),
        sa.Column("next_check_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("last_synced_at", sa.DateTime()),
        sa.Column("last_error", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    for name in ("member_id", "org_id", "temporary_purchase_id", "next_check_at"):
        op.create_index(f"ix_google_wallet_passes_{name}", "google_wallet_passes", [name])
    op.create_table(
        "google_wallet_sync_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("pass_id", sa.Integer(), sa.ForeignKey("google_wallet_passes.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("available_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lease_token", sa.String(36)),
        sa.Column("lease_expires_at", sa.DateTime()),
        sa.Column("last_error", sa.Text()),
    )
    op.create_index("ix_wallet_sync_dispatch", "google_wallet_sync_jobs", ["status", "available_at"])
    op.execute(sa.text("""
        INSERT INTO google_wallet_passes
            (member_id,org_id,object_id,class_id,kind,temporary_purchase_id)
        SELECT m.id,m.org_id,m.google_wallet_object_id,m.google_wallet_class_id,
               CASE WHEN m.membership_type = 'temporary' THEN 'temporary' ELSE 'annual' END,
               (SELECT MAX(t.id) FROM temporary_membership_purchases t
                 WHERE t.member_id=m.id AND t.card_no=m.card_no AND t.card_year=m.card_year)
          FROM members m
         WHERE m.google_wallet_object_id IS NOT NULL AND m.google_wallet_class_id IS NOT NULL
    """))
    op.execute(sa.text("INSERT INTO google_wallet_sync_jobs(pass_id) SELECT id FROM google_wallet_passes"))


def downgrade():
    op.drop_table("google_wallet_sync_jobs")
    op.drop_table("google_wallet_passes")
