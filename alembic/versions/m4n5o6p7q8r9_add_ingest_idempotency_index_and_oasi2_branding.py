"""add ingest idempotency index and update oasi-2 club display name

Revision ID: m4n5o6p7q8r9
Revises: l3m4n5o6p7q8
Create Date: 2026-02-20 09:40:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "m4n5o6p7q8r9"
down_revision: Union[str, Sequence[str], None] = "l3m4n5o6p7q8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEX_NAME = "uq_members_org_year_lower_email_active"
_NEW_OASI2_NAME = "Golden Age Club - Speakeasy"
_OLD_OASI2_NAME = "Golden Age - Speakeasy"


def _update_oasi2_display_name(new_value: str) -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            UPDATE organizations
               SET club_display_name = :new_value
             WHERE lower(trim(slug)) = 'oasi-2'
               AND (
                     club_display_name IS NULL
                  OR trim(club_display_name) = ''
                  OR lower(trim(club_display_name)) IN (
                        lower(:old_value),
                        lower(:new_value)
                  )
               )
            """
        ),
        {"new_value": new_value, "old_value": _OLD_OASI2_NAME},
    )


def upgrade() -> None:
    _update_oasi2_display_name(_NEW_OASI2_NAME)
    op.execute(
        sa.text(
            f"""
            CREATE UNIQUE INDEX IF NOT EXISTS {_INDEX_NAME}
                ON members (org_id, card_year, lower(email))
             WHERE deleted_at IS NULL
               AND email IS NOT NULL
               AND card_year IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    _update_oasi2_display_name(_OLD_OASI2_NAME)
    op.execute(sa.text(f"DROP INDEX IF EXISTS {_INDEX_NAME}"))
