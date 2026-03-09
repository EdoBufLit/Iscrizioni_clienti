"""add association email sender fields

Revision ID: a1c9e8f7b6d5
Revises: z9a0b1c2d3e4
Create Date: 2026-03-09 11:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1c9e8f7b6d5"
down_revision: Union[str, Sequence[str], None] = "z9a0b1c2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    organization_columns = inspector.get_columns("organizations")
    columns = {column["name"] for column in organization_columns}
    communications_column = next(
        (column for column in organization_columns if column["name"] == "communications_enabled"),
        None,
    )

    if "communications_enabled" not in columns:
        op.add_column(
            "organizations",
            sa.Column(
                "communications_enabled",
                sa.Boolean(),
                nullable=True,
                server_default=sa.text("false"),
            ),
        )
    elif bind.dialect.name == "postgresql":
        existing_type_name = type(communications_column["type"]).__name__.lower()
        if existing_type_name in {"integer", "smallinteger", "biginteger"}:
            op.execute(
                sa.text(
                    """
                    ALTER TABLE organizations
                    ALTER COLUMN communications_enabled DROP DEFAULT
                    """
                )
            )
            op.execute(
                sa.text(
                    """
                    ALTER TABLE organizations
                    ALTER COLUMN communications_enabled TYPE BOOLEAN
                    USING CASE
                        WHEN communications_enabled IS NULL THEN NULL
                        WHEN communications_enabled = 0 THEN FALSE
                        ELSE TRUE
                    END
                    """
                )
            )
    if "sender_email_local_part" not in columns:
        op.add_column(
            "organizations",
            sa.Column("sender_email_local_part", sa.String(), nullable=True),
        )
    if "email_from_name_override" not in columns:
        op.add_column(
            "organizations",
            sa.Column("email_from_name_override", sa.String(), nullable=True),
        )
    if "reply_to_email" not in columns:
        op.add_column(
            "organizations",
            sa.Column("reply_to_email", sa.String(), nullable=True),
        )

    op.execute(
        sa.text(
            """
            UPDATE organizations
               SET communications_enabled = FALSE
             WHERE communications_enabled IS NULL
            """
        )
    )
    op.alter_column(
        "organizations",
        "communications_enabled",
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=sa.text("false"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("organizations")}

    for column_name in [
        "reply_to_email",
        "email_from_name_override",
        "sender_email_local_part",
        "communications_enabled",
    ]:
        if column_name in columns:
            op.drop_column("organizations", column_name)
