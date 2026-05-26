"""Link bookings to members.

Revision ID: w8x9y0z1a2b3
Revises: v7w8x9y0z1a2
Create Date: 2026-05-26
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "w8x9y0z1a2b3"
down_revision: Union[str, Sequence[str], None] = "v7w8x9y0z1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    op.add_column("bookings", sa.Column("member_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_bookings_member_id"), "bookings", ["member_id"])
    if dialect != "sqlite":
        op.create_foreign_key(
            "fk_bookings_member_id_members",
            "bookings",
            "members",
            ["member_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.execute(
            """
            UPDATE bookings
               SET member_id = matched.member_id
              FROM (
                    SELECT b.id AS booking_id, max(m.id) AS member_id
                      FROM bookings b
                      JOIN members m
                        ON m.org_id = b.association_id
                       AND m.deleted_at IS NULL
                       AND b.customer_email IS NOT NULL
                       AND lower(trim(m.email)) = lower(trim(b.customer_email))
                     GROUP BY b.id
                   ) AS matched
             WHERE bookings.id = matched.booking_id
               AND bookings.member_id IS NULL
            """
        )
    else:
        op.execute(
            """
            UPDATE bookings
               SET member_id = (
                    SELECT max(m.id)
                      FROM members m
                     WHERE m.org_id = bookings.association_id
                       AND m.deleted_at IS NULL
                       AND bookings.customer_email IS NOT NULL
                       AND lower(trim(m.email)) = lower(trim(bookings.customer_email))
               )
             WHERE member_id IS NULL
               AND customer_email IS NOT NULL
            """
        )


def downgrade() -> None:
    if op.get_bind().dialect.name != "sqlite":
        op.drop_constraint("fk_bookings_member_id_members", "bookings", type_="foreignkey")
    op.drop_index(op.f("ix_bookings_member_id"), table_name="bookings")
    op.drop_column("bookings", "member_id")
