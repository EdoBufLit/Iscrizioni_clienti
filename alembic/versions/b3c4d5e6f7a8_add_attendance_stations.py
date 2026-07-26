"""Add authorized attendance scanner stations.

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-07-26 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "b3c4d5e6f7a8"
down_revision = "a2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "attendance_stations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("credential_hash", sa.String(length=64), nullable=True),
        sa.Column("pairing_token_hash", sa.String(length=64), nullable=True),
        sa.Column("pairing_expires_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_admin_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("paired_at", sa.DateTime(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("paired_user_agent", sa.String(length=512), nullable=True),
        sa.Column("paired_ip_hash", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(
            ["created_by_admin_id"],
            ["admin_users.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_attendance_stations_org_id",
        "attendance_stations",
        ["org_id"],
        unique=False,
    )
    op.create_index(
        "ix_attendance_stations_credential_hash",
        "attendance_stations",
        ["credential_hash"],
        unique=True,
    )
    op.create_index(
        "ix_attendance_stations_pairing_token_hash",
        "attendance_stations",
        ["pairing_token_hash"],
        unique=True,
    )
    op.create_index(
        "ix_attendance_stations_pairing_expires_at",
        "attendance_stations",
        ["pairing_expires_at"],
        unique=False,
    )
    op.create_index(
        "ix_attendance_stations_created_by_admin_id",
        "attendance_stations",
        ["created_by_admin_id"],
        unique=False,
    )
    op.create_index(
        "ix_attendance_stations_last_used_at",
        "attendance_stations",
        ["last_used_at"],
        unique=False,
    )
    op.create_index(
        "ix_attendance_stations_revoked_at",
        "attendance_stations",
        ["revoked_at"],
        unique=False,
    )
    op.create_index(
        "ix_attendance_stations_org_revoked",
        "attendance_stations",
        ["org_id", "revoked_at"],
        unique=False,
    )

    with op.batch_alter_table("member_attendances") as batch_op:
        batch_op.add_column(
            sa.Column("scanner_station_id", sa.Integer(), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_member_attendances_scanner_station_id",
            "attendance_stations",
            ["scanner_station_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(
            "ix_member_attendances_scanner_station_id",
            ["scanner_station_id"],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("member_attendances") as batch_op:
        batch_op.drop_index("ix_member_attendances_scanner_station_id")
        batch_op.drop_constraint(
            "fk_member_attendances_scanner_station_id",
            type_="foreignkey",
        )
        batch_op.drop_column("scanner_station_id")

    op.drop_index(
        "ix_attendance_stations_org_revoked",
        table_name="attendance_stations",
    )
    op.drop_index(
        "ix_attendance_stations_revoked_at",
        table_name="attendance_stations",
    )
    op.drop_index(
        "ix_attendance_stations_last_used_at",
        table_name="attendance_stations",
    )
    op.drop_index(
        "ix_attendance_stations_created_by_admin_id",
        table_name="attendance_stations",
    )
    op.drop_index(
        "ix_attendance_stations_pairing_expires_at",
        table_name="attendance_stations",
    )
    op.drop_index(
        "ix_attendance_stations_pairing_token_hash",
        table_name="attendance_stations",
    )
    op.drop_index(
        "ix_attendance_stations_credential_hash",
        table_name="attendance_stations",
    )
    op.drop_index(
        "ix_attendance_stations_org_id",
        table_name="attendance_stations",
    )
    op.drop_table("attendance_stations")
