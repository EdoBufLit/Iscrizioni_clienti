"""Repeat temporary memberships, deferred access and idempotent manual receipts.

Revision ID: 20261017_02_temporary
Revises: 20261017_01_member_auth
"""
from alembic import op
import sqlalchemy as sa

revision = "20261017_02_temporary"
down_revision = "20261017_01_member_auth"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "temporary_membership_purchases" not in inspector.get_table_names():
        op.create_table(
            "temporary_membership_purchases",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False),
            sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("status", sa.String(32), nullable=False),
            sa.Column("method", sa.String(16), nullable=False),
            sa.Column("amount", sa.Numeric(10, 2)),
            sa.Column("currency", sa.String(3), nullable=False, server_default="EUR"),
            sa.Column("duration_value", sa.Integer()),
            sa.Column("duration_unit", sa.String(8)),
            sa.Column("source", sa.String(24), nullable=False, server_default="member_area"),
            sa.Column("card_no", sa.Integer()), sa.Column("card_year", sa.Integer()),
            sa.Column("batch_id", sa.Integer(), sa.ForeignKey("card_batches.id", ondelete="SET NULL")),
            sa.Column("numbering_scope_id", sa.Integer(), sa.ForeignKey("numbering_scopes.id")),
            sa.Column("issued_at", sa.DateTime(timezone=True)),
            sa.Column("valid_from", sa.DateTime(timezone=True)),
            sa.Column("valid_until", sa.DateTime(timezone=True)),
            sa.Column("issue_reason", sa.String(80)),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        for name in ("member_id", "org_id", "status", "batch_id", "numbering_scope_id", "valid_until"):
            op.create_index(f"ix_temporary_membership_purchases_{name}", "temporary_membership_purchases", [name])
        op.create_index("ix_temporary_purchase_card", "temporary_membership_purchases", ["org_id", "card_year", "card_no"])
        op.create_index("uq_temporary_purchase_open_member", "temporary_membership_purchases", ["member_id"], unique=True,
                        postgresql_where=sa.text("status IN ('payment_pending','manual_pending','paid_waiting_card')"),
                        sqlite_where=sa.text("status IN ('payment_pending','manual_pending','paid_waiting_card')"))
    if "access_email_requested" not in {c["name"] for c in sa.inspect(bind).get_columns("members")}:
        op.add_column("members", sa.Column("access_email_requested", sa.Boolean(), nullable=False, server_default=sa.false()))
    if "temporary_purchase_id" not in {c["name"] for c in sa.inspect(bind).get_columns("membership_payments")}:
        op.add_column("membership_payments", sa.Column("temporary_purchase_id", sa.Integer(), nullable=True))
        if bind.dialect.name != "sqlite":
            op.create_foreign_key("fk_membership_payment_temporary_purchase", "membership_payments", "temporary_membership_purchases", ["temporary_purchase_id"], ["id"], ondelete="SET NULL")
        op.create_index("ix_membership_payments_temporary_purchase_id", "membership_payments", ["temporary_purchase_id"])
    if "membership_payment_id" not in {c["name"] for c in sa.inspect(bind).get_columns("member_payments")}:
        op.add_column("member_payments", sa.Column("membership_payment_id", sa.Integer(), nullable=True))
        if bind.dialect.name != "sqlite":
            op.create_foreign_key("fk_member_payment_membership_payment", "member_payments", "membership_payments", ["membership_payment_id"], ["id"], ondelete="SET NULL")
        op.create_index("uq_member_payments_membership_payment_id", "member_payments", ["membership_payment_id"], unique=True)
    # Preserve existing temporary card identities without inventing an order
    # price, provider transaction or a new validity period.
    bind.execute(sa.text("""
        INSERT INTO temporary_membership_purchases
          (member_id,org_id,status,method,amount,currency,source,card_no,card_year,
           batch_id,numbering_scope_id,issued_at,valid_from,valid_until,created_at,updated_at)
        SELECT m.id,m.org_id,
          CASE WHEN lower(CAST(m.status AS TEXT))='active' AND m.valid_until > CURRENT_TIMESTAMP THEN 'active' ELSE 'expired' END,
          'legacy',m.membership_fee_snapshot,COALESCE(o.membership_fee_currency,'EUR'),'legacy',
          m.card_no,m.card_year,m.batch_id,m.numbering_scope_id,COALESCE(m.valid_from,m.joined_at),
          m.valid_from,m.valid_until,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        FROM members m JOIN organizations o ON o.id=m.org_id
        WHERE m.membership_type='temporary' AND m.card_no IS NOT NULL AND m.card_year IS NOT NULL
          AND m.deleted_at IS NULL AND NOT EXISTS
          (SELECT 1 FROM temporary_membership_purchases t WHERE t.member_id=m.id
           AND t.card_no=m.card_no AND t.card_year=m.card_year)
    """))


def downgrade():
    # A downgrade may only run after the operator has deliberately exported
    # or removed purchases; never silently discard issued membership history.
    bind = op.get_bind()
    if bind.execute(sa.text("SELECT COUNT(*) FROM temporary_membership_purchases")).scalar():
        raise RuntimeError("Temporary membership history exists; downgrade would discard issued cards.")
    for table, column in (("member_payments", "membership_payment_id"), ("membership_payments", "temporary_purchase_id"), ("members", "access_email_requested")):
        with op.batch_alter_table(table) as batch:
            batch.drop_column(column)
    op.drop_table("temporary_membership_purchases")
