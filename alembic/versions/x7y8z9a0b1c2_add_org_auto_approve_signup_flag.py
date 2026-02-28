"""Add organization auto_approve_signup flag.

Revision ID: x7y8z9a0b1c2
Revises: w6x7y8z9a0b1
Create Date: 2026-02-28 23:55:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "x7y8z9a0b1c2"
down_revision: Union[str, Sequence[str], None] = "w6x7y8z9a0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"]: col for col in inspector.get_columns("organizations")}

    if "auto_approve_signup" not in columns:
        op.add_column(
            "organizations",
            sa.Column(
                "auto_approve_signup",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
        )
    elif not isinstance(columns["auto_approve_signup"]["type"], sa.Boolean):
        op.alter_column(
            "organizations",
            "auto_approve_signup",
            existing_type=columns["auto_approve_signup"]["type"],
            type_=sa.Boolean(),
            postgresql_using="(auto_approve_signup::int <> 0)",
        )

    bind.execute(
        sa.text(
            """
            UPDATE organizations
               SET auto_approve_signup = FALSE
             WHERE auto_approve_signup IS NULL
            """
        )
    )

    op.alter_column(
        "organizations",
        "auto_approve_signup",
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=sa.text("false"),
    )

    bind.execute(
        sa.text(
            """
            UPDATE organizations
               SET auto_approve_signup = TRUE
             WHERE slug = 't-a-g-culture'
            """
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("organizations")}
    if "auto_approve_signup" in columns:
        op.drop_column("organizations", "auto_approve_signup")
