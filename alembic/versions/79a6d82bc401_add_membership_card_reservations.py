"""Reserve membership card numbers before online checkout.

Revision ID: 79a6d82bc401
Revises: b3c4d5e6f7a8
Create Date: 2026-09-07
"""

from alembic import op
import sqlalchemy as sa


revision = "79a6d82bc401"
down_revision = "b3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("membership_payments") as batch_op:
        batch_op.add_column(sa.Column("reserved_card_no", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("reserved_batch_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("reserved_card_year", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column("reserved_numbering_scope_id", sa.Integer(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("reservation_expires_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.add_column(
            sa.Column("reservation_state", sa.String(length=16), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_membership_payments_reserved_batch", "card_batches",
            ["reserved_batch_id"], ["id"], ondelete="SET NULL",
        )
        batch_op.create_foreign_key(
            "fk_membership_payments_reserved_scope", "numbering_scopes",
            ["reserved_numbering_scope_id"], ["id"], ondelete="SET NULL",
        )
        batch_op.create_check_constraint(
            "ck_membership_payments_reservation_state",
            "reservation_state IS NULL OR reservation_state IN ('held', 'consumed', 'released')",
        )
        batch_op.create_check_constraint(
            "ck_membership_payments_held_card",
            "reservation_state != 'held' OR "
            "(reserved_card_no IS NOT NULL AND reserved_card_year IS NOT NULL)",
        )
        batch_op.create_index(
            "uq_membership_payments_held_org_card", ["org_id", "reserved_card_no"],
            unique=True,
            postgresql_where=sa.text("reservation_state = 'held'"),
            sqlite_where=sa.text("reservation_state = 'held'"),
        )
        batch_op.create_index(
            "uq_membership_payments_held_scope_card",
            ["reserved_numbering_scope_id", "reserved_card_no"],
            unique=True,
            postgresql_where=sa.text(
                "reservation_state = 'held' AND reserved_numbering_scope_id IS NOT NULL"
            ),
            sqlite_where=sa.text(
                "reservation_state = 'held' AND reserved_numbering_scope_id IS NOT NULL"
            ),
        )
        batch_op.create_index(
            "ix_membership_payments_reservation_reconcile",
            ["reservation_state", "reservation_expires_at", "id"], unique=False,
        )


def downgrade() -> None:
    # Downgrading with held cards would silently remove the allocation guard.
    held = op.get_bind().execute(sa.text(
        "SELECT 1 FROM membership_payments WHERE reservation_state = 'held' LIMIT 1"
    )).scalar()
    if held:
        raise RuntimeError("Reconcile all held membership card reservations before downgrading.")
    with op.batch_alter_table("membership_payments") as batch_op:
        batch_op.drop_index("ix_membership_payments_reservation_reconcile")
        batch_op.drop_index("uq_membership_payments_held_scope_card")
        batch_op.drop_index("uq_membership_payments_held_org_card")
        batch_op.drop_constraint("ck_membership_payments_held_card", type_="check")
        batch_op.drop_constraint("ck_membership_payments_reservation_state", type_="check")
        batch_op.drop_constraint("fk_membership_payments_reserved_scope", type_="foreignkey")
        batch_op.drop_constraint("fk_membership_payments_reserved_batch", type_="foreignkey")
        for column in (
            "reservation_state", "reservation_expires_at", "reserved_numbering_scope_id",
            "reserved_card_year", "reserved_batch_id", "reserved_card_no",
        ):
            batch_op.drop_column(column)
