"""Normalize TAG CULTURE naming in organizations table.

Revision ID: v5w6x7y8z9a0
Revises: u4v5w6x7y8z9
Create Date: 2026-02-28 21:05:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "v5w6x7y8z9a0"
down_revision: Union[str, Sequence[str], None] = "u4v5w6x7y8z9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    organizations = sa.table(
        "organizations",
        sa.column("slug", sa.String()),
        sa.column("name", sa.String()),
        sa.column("club_display_name", sa.String()),
        sa.column("card_email_subject", sa.String()),
        sa.column("wallet_title_override", sa.String()),
    )

    op.execute(
        organizations.update()
        .where(organizations.c.slug == "t-a-g-culture")
        .values(
            name=sa.func.replace(organizations.c.name, "T.A.G.", "TAG"),
            club_display_name=sa.func.replace(
                organizations.c.club_display_name,
                "T.A.G.",
                "TAG",
            ),
            card_email_subject=sa.func.replace(
                organizations.c.card_email_subject,
                "T.A.G.",
                "TAG",
            ),
            wallet_title_override=sa.func.replace(
                organizations.c.wallet_title_override,
                "T.A.G.",
                "TAG",
            ),
        )
    )


def downgrade() -> None:
    organizations = sa.table(
        "organizations",
        sa.column("slug", sa.String()),
        sa.column("name", sa.String()),
        sa.column("club_display_name", sa.String()),
        sa.column("card_email_subject", sa.String()),
        sa.column("wallet_title_override", sa.String()),
    )

    op.execute(
        organizations.update()
        .where(organizations.c.slug == "t-a-g-culture")
        .values(
            name=sa.func.replace(organizations.c.name, "TAG", "T.A.G."),
            club_display_name=sa.func.replace(
                organizations.c.club_display_name,
                "TAG",
                "T.A.G.",
            ),
            card_email_subject=sa.func.replace(
                organizations.c.card_email_subject,
                "TAG",
                "T.A.G.",
            ),
            wallet_title_override=sa.func.replace(
                organizations.c.wallet_title_override,
                "TAG",
                "T.A.G.",
            ),
        )
    )
