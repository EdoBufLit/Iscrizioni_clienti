"""add rooms and room tables for bookings

Revision ID: 2d3e4f5a6b7c
Revises: 1c2d3e4f5a6b
Create Date: 2026-03-10 23:58:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2d3e4f5a6b7c"
down_revision: Union[str, Sequence[str], None] = "1c2d3e4f5a6b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_names(bind) -> set[str]:
    return set(sa.inspect(bind).get_table_names())


def _column_names(bind, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(bind, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _foreign_key_names(bind, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        return set()
    return {fk.get("name") for fk in inspector.get_foreign_keys(table_name) if fk.get("name")}


def upgrade() -> None:
    bind = op.get_bind()
    tables = _table_names(bind)

    if "rooms" not in tables:
        op.create_table(
            "rooms",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("association_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    if "room_tables" not in tables:
        op.create_table(
            "room_tables",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("association_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("room_id", sa.Integer(), sa.ForeignKey("rooms.id"), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("capacity", sa.Integer(), nullable=False, server_default="2"),
            sa.Column("shape", sa.String(), nullable=False, server_default="round"),
            sa.Column("pos_x", sa.Integer(), nullable=False, server_default="80"),
            sa.Column("pos_y", sa.Integer(), nullable=False, server_default="80"),
            sa.Column("width", sa.Integer(), nullable=True),
            sa.Column("height", sa.Integer(), nullable=True),
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
            sa.Column(
                "is_out_of_service",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("room_id", "name", name="uq_room_tables_room_name"),
        )

    bind = op.get_bind()
    room_indexes = _index_names(bind, "rooms") if "rooms" in _table_names(bind) else set()
    for index_name, columns in [
        ("ix_rooms_association_id", ["association_id"]),
        ("ix_rooms_is_active", ["is_active"]),
        ("ix_rooms_created_at", ["created_at"]),
    ]:
        if index_name not in room_indexes:
            op.create_index(index_name, "rooms", columns, unique=False)

    table_indexes = _index_names(bind, "room_tables") if "room_tables" in _table_names(bind) else set()
    for index_name, columns in [
        ("ix_room_tables_association_id", ["association_id"]),
        ("ix_room_tables_room_id", ["room_id"]),
        ("ix_room_tables_is_active", ["is_active"]),
        ("ix_room_tables_is_out_of_service", ["is_out_of_service"]),
        ("ix_room_tables_created_at", ["created_at"]),
    ]:
        if index_name not in table_indexes:
            op.create_index(index_name, "room_tables", columns, unique=False)

    bind = op.get_bind()
    if "bookings" in _table_names(bind):
        booking_columns = _column_names(bind, "bookings")
        with op.batch_alter_table("bookings") as batch_op:
            if "room_id" not in booking_columns:
                batch_op.add_column(sa.Column("room_id", sa.Integer(), nullable=True))
            if "table_id" not in booking_columns:
                batch_op.add_column(sa.Column("table_id", sa.Integer(), nullable=True))

        bind = op.get_bind()
        fk_names = _foreign_key_names(bind, "bookings")
        with op.batch_alter_table("bookings") as batch_op:
            if "fk_bookings_room_id_rooms" not in fk_names:
                batch_op.create_foreign_key(
                    "fk_bookings_room_id_rooms",
                    "rooms",
                    ["room_id"],
                    ["id"],
                )
            if "fk_bookings_table_id_room_tables" not in fk_names:
                batch_op.create_foreign_key(
                    "fk_bookings_table_id_room_tables",
                    "room_tables",
                    ["table_id"],
                    ["id"],
                )


def downgrade() -> None:
    bind = op.get_bind()
    if "bookings" in _table_names(bind):
        fk_names = _foreign_key_names(bind, "bookings")
        with op.batch_alter_table("bookings") as batch_op:
            if "fk_bookings_table_id_room_tables" in fk_names:
                batch_op.drop_constraint("fk_bookings_table_id_room_tables", type_="foreignkey")
            if "fk_bookings_room_id_rooms" in fk_names:
                batch_op.drop_constraint("fk_bookings_room_id_rooms", type_="foreignkey")

    if "room_tables" in _table_names(bind):
        for index_name in [
            "ix_room_tables_created_at",
            "ix_room_tables_is_out_of_service",
            "ix_room_tables_is_active",
            "ix_room_tables_room_id",
            "ix_room_tables_association_id",
        ]:
            if index_name in _index_names(bind, "room_tables"):
                op.drop_index(index_name, table_name="room_tables")
        op.drop_table("room_tables")

    if "rooms" in _table_names(bind):
        for index_name in [
            "ix_rooms_created_at",
            "ix_rooms_is_active",
            "ix_rooms_association_id",
        ]:
            if index_name in _index_names(bind, "rooms"):
                op.drop_index(index_name, table_name="rooms")
        op.drop_table("rooms")
