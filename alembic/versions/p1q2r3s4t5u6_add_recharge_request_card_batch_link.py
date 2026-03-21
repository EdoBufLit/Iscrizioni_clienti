"""add recharge request card batch link

Revision ID: p1q2r3s4t5u6
Revises: n7p8q9r0s1t2
Create Date: 2026-03-21 10:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "p1q2r3s4t5u6"
down_revision = "n7p8q9r0s1t2"
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


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
    if not _column_exists("recharge_requests", "card_batch_id"):
        with op.batch_alter_table("recharge_requests") as batch_op:
            batch_op.add_column(sa.Column("card_batch_id", sa.Integer(), nullable=True))

    if not _index_exists("recharge_requests", "ix_recharge_requests_card_batch_id"):
        op.create_index(
            "ix_recharge_requests_card_batch_id",
            "recharge_requests",
            ["card_batch_id"],
            unique=False,
        )

    if not _foreign_key_exists("recharge_requests", ["card_batch_id"]):
        with op.batch_alter_table("recharge_requests") as batch_op:
            batch_op.create_foreign_key(
                "fk_recharge_requests_card_batch_id_card_batches",
                "card_batches",
                ["card_batch_id"],
                ["id"],
            )


def downgrade() -> None:
    if _foreign_key_exists("recharge_requests", ["card_batch_id"]):
        with op.batch_alter_table("recharge_requests") as batch_op:
            batch_op.drop_constraint(
                "fk_recharge_requests_card_batch_id_card_batches",
                type_="foreignkey",
            )

    if _index_exists("recharge_requests", "ix_recharge_requests_card_batch_id"):
        op.drop_index("ix_recharge_requests_card_batch_id", table_name="recharge_requests")

    if _column_exists("recharge_requests", "card_batch_id"):
        with op.batch_alter_table("recharge_requests") as batch_op:
            batch_op.drop_column("card_batch_id")
