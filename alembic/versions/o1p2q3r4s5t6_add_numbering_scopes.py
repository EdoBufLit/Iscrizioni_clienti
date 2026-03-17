"""Add numbering scopes for hybrid card numbering.

Revision ID: o1p2q3r4s5t6
Revises: z9a0b1c2d3e4
Create Date: 2026-03-17 10:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "o1p2q3r4s5t6"
down_revision: Union[str, Sequence[str], None] = "z9a0b1c2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ASSONAM_CENTRAL_SCOPE_NAME = "ASSONAM_CENTRAL"


def _has_index(inspector: sa.Inspector, table_name: str, index_name: str) -> bool:
    return index_name in {index["name"] for index in inspector.get_indexes(table_name)}


def _has_fk(inspector: sa.Inspector, table_name: str, fk_name: str) -> bool:
    return fk_name in {fk["name"] for fk in inspector.get_foreign_keys(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    dialect_name = (bind.dialect.name or "").lower()
    existing_tables = set(inspector.get_table_names())

    if "numbering_scopes" not in existing_tables:
        op.create_table(
            "numbering_scopes",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("scope_type", sa.String(), nullable=False),
            sa.Column("prefix", sa.String(), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column(
                "is_system",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column("owner_org_id", sa.Integer(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint("name", name="uq_numbering_scopes_name"),
        )
        inspector = sa.inspect(bind)

    if _has_index(inspector, "numbering_scopes", "ix_numbering_scopes_name") is False:
        op.create_index("ix_numbering_scopes_name", "numbering_scopes", ["name"], unique=True)
    if _has_index(inspector, "numbering_scopes", "ix_numbering_scopes_scope_type") is False:
        op.create_index("ix_numbering_scopes_scope_type", "numbering_scopes", ["scope_type"])
    if _has_index(inspector, "numbering_scopes", "ix_numbering_scopes_is_system") is False:
        op.create_index("ix_numbering_scopes_is_system", "numbering_scopes", ["is_system"])
    if _has_index(inspector, "numbering_scopes", "ix_numbering_scopes_owner_org_id") is False:
        op.create_index("ix_numbering_scopes_owner_org_id", "numbering_scopes", ["owner_org_id"])

    if dialect_name != "sqlite" and _has_fk(inspector, "numbering_scopes", "fk_numbering_scopes_owner_org_id") is False:
        op.create_foreign_key(
            "fk_numbering_scopes_owner_org_id",
            "numbering_scopes",
            "organizations",
            ["owner_org_id"],
            ["id"],
        )

    org_columns = {col["name"] for col in inspector.get_columns("organizations")}
    if "numbering_scope_id" not in org_columns:
        op.add_column(
            "organizations",
            sa.Column("numbering_scope_id", sa.Integer(), nullable=True),
        )
        inspector = sa.inspect(bind)
    if _has_index(inspector, "organizations", "ix_organizations_numbering_scope_id") is False:
        op.create_index(
            "ix_organizations_numbering_scope_id",
            "organizations",
            ["numbering_scope_id"],
        )
    if dialect_name != "sqlite" and _has_fk(inspector, "organizations", "fk_organizations_numbering_scope_id") is False:
        op.create_foreign_key(
            "fk_organizations_numbering_scope_id",
            "organizations",
            "numbering_scopes",
            ["numbering_scope_id"],
            ["id"],
        )

    batch_columns = {col["name"] for col in inspector.get_columns("card_batches")}
    if "numbering_scope_id" not in batch_columns:
        op.add_column(
            "card_batches",
            sa.Column("numbering_scope_id", sa.Integer(), nullable=True),
        )
        inspector = sa.inspect(bind)
    if _has_index(inspector, "card_batches", "ix_card_batches_numbering_scope_id") is False:
        op.create_index(
            "ix_card_batches_numbering_scope_id",
            "card_batches",
            ["numbering_scope_id"],
        )
    if dialect_name != "sqlite" and _has_fk(inspector, "card_batches", "fk_card_batches_numbering_scope_id") is False:
        op.create_foreign_key(
            "fk_card_batches_numbering_scope_id",
            "card_batches",
            "numbering_scopes",
            ["numbering_scope_id"],
            ["id"],
        )

    member_columns = {col["name"] for col in inspector.get_columns("members")}
    if "numbering_scope_id" not in member_columns:
        op.add_column(
            "members",
            sa.Column("numbering_scope_id", sa.Integer(), nullable=True),
        )
        inspector = sa.inspect(bind)
    if _has_index(inspector, "members", "ix_members_numbering_scope_id") is False:
        op.create_index(
            "ix_members_numbering_scope_id",
            "members",
            ["numbering_scope_id"],
        )
    if dialect_name != "sqlite" and _has_fk(inspector, "members", "fk_members_numbering_scope_id") is False:
        op.create_foreign_key(
            "fk_members_numbering_scope_id",
            "members",
            "numbering_scopes",
            ["numbering_scope_id"],
            ["id"],
        )

    bind.execute(
        sa.text(
            """
            INSERT INTO numbering_scopes (name, scope_type, prefix, description, is_system, created_at, updated_at)
            SELECT :name, 'shared', NULL, :description, :is_system, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            WHERE NOT EXISTS (
                SELECT 1 FROM numbering_scopes WHERE name = :name
            )
            """
        ),
        {
            "name": ASSONAM_CENTRAL_SCOPE_NAME,
            "description": "Pool centrale condiviso ASSONAM",
            "is_system": True,
        },
    )


def downgrade() -> None:
    # Conservative no-op downgrade: the feature is additive and must not
    # destructively remove tables/columns/data from live databases.
    return None
