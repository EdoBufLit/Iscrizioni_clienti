"""add sumup membership payments

Revision ID: r1s2u3m4u5p6
Revises: p1q2r3s4t5u6
Create Date: 2026-03-27 16:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "r1s2u3m4u5p6"
down_revision = "p1q2r3s4t5u6"
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    try:
        return table_name in _inspector().get_table_names()
    except Exception:
        return False


def _column_exists(table_name: str, column_name: str) -> bool:
    try:
        columns = _inspector().get_columns(table_name)
    except Exception:
        return False
    return any(col.get("name") == column_name for col in columns)


def _index_exists(table_name: str, index_name: str) -> bool:
    try:
        indexes = _inspector().get_indexes(table_name)
    except Exception:
        return False
    return any(index.get("name") == index_name for index in indexes)


def _foreign_key_exists(table_name: str, constrained_columns: list[str]) -> bool:
    try:
        foreign_keys = _inspector().get_foreign_keys(table_name)
    except Exception:
        return False
    target = tuple(constrained_columns)
    return any(tuple(fk.get("constrained_columns") or []) == target for fk in foreign_keys)


def upgrade() -> None:
    if not _column_exists("organizations", "payment_provider"):
        with op.batch_alter_table("organizations") as batch_op:
            batch_op.add_column(sa.Column("payment_provider", sa.String(), nullable=True))
            batch_op.add_column(
                sa.Column(
                    "payment_required_before_card",
                    sa.Boolean(),
                    nullable=False,
                    server_default="false",
                )
            )
            batch_op.add_column(sa.Column("membership_payment_label", sa.String(), nullable=True))
            batch_op.add_column(sa.Column("membership_fee_amount", sa.Numeric(10, 2), nullable=True))
            batch_op.add_column(
                sa.Column(
                    "membership_fee_currency",
                    sa.String(),
                    nullable=False,
                    server_default="EUR",
                )
            )
            batch_op.add_column(
                sa.Column(
                    "payment_button_label",
                    sa.String(),
                    nullable=False,
                    server_default="Paga con carta",
                )
            )
            batch_op.add_column(
                sa.Column("sumup_enabled", sa.Boolean(), nullable=False, server_default="false")
            )
            batch_op.add_column(sa.Column("sumup_api_key_encrypted", sa.Text(), nullable=True))
            batch_op.add_column(sa.Column("sumup_api_key_last4", sa.String(), nullable=True))
            batch_op.add_column(sa.Column("sumup_api_key_configured_at", sa.DateTime(timezone=True), nullable=True))

    if not _column_exists("members", "payment_required"):
        with op.batch_alter_table("members") as batch_op:
            batch_op.add_column(
                sa.Column(
                    "payment_required",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.false(),
                )
            )
            batch_op.add_column(
                sa.Column(
                    "payment_status",
                    sa.String(),
                    nullable=False,
                    server_default="not_required",
                )
            )
            batch_op.add_column(sa.Column("payment_completed_at", sa.DateTime(timezone=True), nullable=True))
            batch_op.add_column(
                sa.Column(
                    "card_is_paid",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.false(),
                )
            )
            batch_op.add_column(sa.Column("card_paid_at", sa.DateTime(timezone=True), nullable=True))
            batch_op.add_column(sa.Column("card_payment_status", sa.String(), nullable=True))

    if not _index_exists("members", "ix_members_payment_status"):
        op.create_index("ix_members_payment_status", "members", ["payment_status"], unique=False)

    if not _table_exists("membership_payments"):
        json_type = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
        op.create_table(
            "membership_payments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("socio_id", sa.Integer(), sa.ForeignKey("members.id"), nullable=True),
            sa.Column("application_id", sa.Integer(), nullable=True),
            sa.Column("provider", sa.String(), nullable=False, server_default="sumup"),
            sa.Column("payment_reason", sa.String(), nullable=True),
            sa.Column("amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("currency", sa.String(), nullable=False, server_default="EUR"),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("source", sa.String(), nullable=False),
            sa.Column("checkout_reference", sa.String(), nullable=True, unique=True),
            sa.Column("sumup_checkout_id", sa.String(), nullable=True),
            sa.Column("hosted_checkout_url", sa.Text(), nullable=True),
            sa.Column("raw_create_response", json_type, nullable=True),
            sa.Column("raw_last_status_response", json_type, nullable=True),
            sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "manual_marked_paid_by_user_id",
                sa.Integer(),
                sa.ForeignKey("admin_users.id"),
                nullable=True,
            ),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )

    if not _index_exists("membership_payments", "ix_membership_payments_org_id"):
        op.create_index("ix_membership_payments_org_id", "membership_payments", ["org_id"], unique=False)
    if not _index_exists("membership_payments", "ix_membership_payments_socio_id"):
        op.create_index("ix_membership_payments_socio_id", "membership_payments", ["socio_id"], unique=False)
    if not _index_exists("membership_payments", "ix_membership_payments_application_id"):
        op.create_index("ix_membership_payments_application_id", "membership_payments", ["application_id"], unique=False)
    if not _index_exists("membership_payments", "ix_membership_payments_status"):
        op.create_index("ix_membership_payments_status", "membership_payments", ["status"], unique=False)
    if not _index_exists("membership_payments", "ix_membership_payments_source"):
        op.create_index("ix_membership_payments_source", "membership_payments", ["source"], unique=False)
    if not _index_exists("membership_payments", "ix_membership_payments_sumup_checkout_id"):
        op.create_index(
            "ix_membership_payments_sumup_checkout_id",
            "membership_payments",
            ["sumup_checkout_id"],
            unique=False,
        )
    if not _index_exists("membership_payments", "ix_membership_payments_org_member_status"):
        op.create_index(
            "ix_membership_payments_org_member_status",
            "membership_payments",
            ["org_id", "socio_id", "status"],
            unique=False,
        )

    op.execute(
        sa.text(
            """
            UPDATE members
               SET payment_required = COALESCE(payment_required, FALSE),
                   payment_status = COALESCE(NULLIF(trim(payment_status), ''), 'not_required'),
                   card_is_paid = CASE
                       WHEN card_is_paid IS NULL THEN FALSE
                       ELSE card_is_paid
                   END
            """
        )
    )


def downgrade() -> None:
    if _index_exists("membership_payments", "ix_membership_payments_org_member_status"):
        op.drop_index("ix_membership_payments_org_member_status", table_name="membership_payments")
    if _index_exists("membership_payments", "ix_membership_payments_sumup_checkout_id"):
        op.drop_index("ix_membership_payments_sumup_checkout_id", table_name="membership_payments")
    if _index_exists("membership_payments", "ix_membership_payments_source"):
        op.drop_index("ix_membership_payments_source", table_name="membership_payments")
    if _index_exists("membership_payments", "ix_membership_payments_status"):
        op.drop_index("ix_membership_payments_status", table_name="membership_payments")
    if _index_exists("membership_payments", "ix_membership_payments_application_id"):
        op.drop_index("ix_membership_payments_application_id", table_name="membership_payments")
    if _index_exists("membership_payments", "ix_membership_payments_socio_id"):
        op.drop_index("ix_membership_payments_socio_id", table_name="membership_payments")
    if _index_exists("membership_payments", "ix_membership_payments_org_id"):
        op.drop_index("ix_membership_payments_org_id", table_name="membership_payments")

    if _table_exists("membership_payments"):
        op.drop_table("membership_payments")

    if _index_exists("members", "ix_members_payment_status"):
        op.drop_index("ix_members_payment_status", table_name="members")

    if _column_exists("members", "payment_required"):
        with op.batch_alter_table("members") as batch_op:
            batch_op.drop_column("card_payment_status")
            batch_op.drop_column("card_paid_at")
            batch_op.drop_column("card_is_paid")
            batch_op.drop_column("payment_completed_at")
            batch_op.drop_column("payment_status")
            batch_op.drop_column("payment_required")

    if _column_exists("organizations", "payment_provider"):
        with op.batch_alter_table("organizations") as batch_op:
            batch_op.drop_column("sumup_api_key_configured_at")
            batch_op.drop_column("sumup_api_key_last4")
            batch_op.drop_column("sumup_api_key_encrypted")
            batch_op.drop_column("sumup_enabled")
            batch_op.drop_column("payment_button_label")
            batch_op.drop_column("membership_fee_currency")
            batch_op.drop_column("membership_fee_amount")
            batch_op.drop_column("membership_payment_label")
            batch_op.drop_column("payment_required_before_card")
            batch_op.drop_column("payment_provider")
