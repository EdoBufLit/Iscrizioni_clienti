"""add member card_delivered_at and normalize signup_source default

Revision ID: p6q7r8s9t0u1
Revises: n5o6p7q8r9s0
Create Date: 2026-02-23 12:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "p6q7r8s9t0u1"
down_revision: Union[str, Sequence[str], None] = "n5o6p7q8r9s0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_MEMBERS_TABLE = "members"
_CARD_DELIVERED_AT_COL = "card_delivered_at"
_CARD_EMAIL_SENT_AT_COL = "card_email_sent_at"
_SIGNUP_SOURCE_COL = "signup_source"
_SIGNUP_SOURCE_DEFAULT = "assonam_form"
_PIENISSIMO_CANONICAL = "pienissimo"


def _inspector():
    return sa.inspect(op.get_bind())


def _column_exists(table_name: str, column_name: str) -> bool:
    try:
        columns = _inspector().get_columns(table_name)
    except Exception:
        return False
    return any(col["name"] == column_name for col in columns)


def upgrade() -> None:
    if not _column_exists(_MEMBERS_TABLE, _CARD_DELIVERED_AT_COL):
        with op.batch_alter_table(_MEMBERS_TABLE) as batch_op:
            batch_op.add_column(sa.Column(_CARD_DELIVERED_AT_COL, sa.DateTime(), nullable=True))

    bind = op.get_bind()

    if _column_exists(_MEMBERS_TABLE, _CARD_DELIVERED_AT_COL) and _column_exists(
        _MEMBERS_TABLE, _CARD_EMAIL_SENT_AT_COL
    ):
        bind.execute(
            sa.text(
                f"""
                UPDATE {_MEMBERS_TABLE}
                   SET {_CARD_DELIVERED_AT_COL} = {_CARD_EMAIL_SENT_AT_COL}
                 WHERE {_CARD_DELIVERED_AT_COL} IS NULL
                   AND {_CARD_EMAIL_SENT_AT_COL} IS NOT NULL
                """
            )
        )

    if _column_exists(_MEMBERS_TABLE, _SIGNUP_SOURCE_COL):
        # Canonicalize known Pienissimo aliases.
        bind.execute(
            sa.text(
                f"""
                UPDATE {_MEMBERS_TABLE}
                   SET {_SIGNUP_SOURCE_COL} = :pienissimo
                 WHERE {_SIGNUP_SOURCE_COL} IS NOT NULL
                   AND lower(trim({_SIGNUP_SOURCE_COL})) IN ('pienissimo', 'pienissimo_api')
                """
            ),
            {"pienissimo": _PIENISSIMO_CANONICAL},
        )
        # Backfill empty/NULL sources as web form to avoid false integration badges.
        bind.execute(
            sa.text(
                f"""
                UPDATE {_MEMBERS_TABLE}
                   SET {_SIGNUP_SOURCE_COL} = :default_source
                 WHERE {_SIGNUP_SOURCE_COL} IS NULL
                    OR trim({_SIGNUP_SOURCE_COL}) = ''
                """
            ),
            {"default_source": _SIGNUP_SOURCE_DEFAULT},
        )

        with op.batch_alter_table(_MEMBERS_TABLE) as batch_op:
            batch_op.alter_column(
                _SIGNUP_SOURCE_COL,
                existing_type=sa.String(),
                existing_nullable=True,
                server_default=_SIGNUP_SOURCE_DEFAULT,
            )


def downgrade() -> None:
    if _column_exists(_MEMBERS_TABLE, _SIGNUP_SOURCE_COL):
        with op.batch_alter_table(_MEMBERS_TABLE) as batch_op:
            batch_op.alter_column(
                _SIGNUP_SOURCE_COL,
                existing_type=sa.String(),
                existing_nullable=True,
                server_default=None,
            )

    if _column_exists(_MEMBERS_TABLE, _CARD_DELIVERED_AT_COL):
        with op.batch_alter_table(_MEMBERS_TABLE) as batch_op:
            batch_op.drop_column(_CARD_DELIVERED_AT_COL)
