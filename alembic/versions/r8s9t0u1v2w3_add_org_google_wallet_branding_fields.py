"""add organization google wallet branding fields

Revision ID: r8s9t0u1v2w3
Revises: q1r2s3t4u5v6
Create Date: 2026-02-23 20:15:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "r8s9t0u1v2w3"
down_revision: Union[str, Sequence[str], None] = "q1r2s3t4u5v6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "organizations"


def _inspector():
    return sa.inspect(op.get_bind())


def _column_exists(table_name: str, column_name: str) -> bool:
    try:
        columns = _inspector().get_columns(table_name)
    except Exception:
        return False
    return any(col["name"] == column_name for col in columns)


def upgrade() -> None:
    columns_to_add: list[sa.Column] = [
        sa.Column("wallet_bg_color", sa.String(), nullable=True),
        sa.Column("wallet_logo_url", sa.Text(), nullable=True),
        sa.Column("wallet_hero_image_url", sa.Text(), nullable=True),
        sa.Column("wallet_title_override", sa.String(), nullable=True),
        sa.Column(
            "wallet_is_test_prefix",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    ]

    for column in columns_to_add:
        if _column_exists(_TABLE, str(column.name)):
            continue
        with op.batch_alter_table(_TABLE) as batch_op:
            batch_op.add_column(column)

    op.get_bind().execute(
        sa.text(
            """
            UPDATE organizations
               SET wallet_bg_color = COALESCE(NULLIF(trim(wallet_bg_color), ''), :wallet_bg_color),
                   wallet_logo_url = COALESCE(NULLIF(trim(wallet_logo_url), ''), :wallet_logo_url),
                   wallet_hero_image_url = COALESCE(NULLIF(trim(wallet_hero_image_url), ''), :wallet_hero_image_url),
                   wallet_title_override = COALESCE(NULLIF(trim(wallet_title_override), ''), :wallet_title_override),
                   wallet_is_test_prefix = COALESCE(wallet_is_test_prefix, FALSE)
             WHERE lower(trim(slug)) = 'oasi-2'
            """
        ),
        {
            "wallet_bg_color": "#0B3C75",
            "wallet_logo_url": "/static/card-logos/oasi-2.png",
            "wallet_hero_image_url": "/static/wallet-heroes/oasi-2-hero.png",
            "wallet_title_override": "Golden Age Club - Speakeasy",
        },
    )


def downgrade() -> None:
    for column_name in [
        "wallet_is_test_prefix",
        "wallet_title_override",
        "wallet_hero_image_url",
        "wallet_logo_url",
        "wallet_bg_color",
    ]:
        if not _column_exists(_TABLE, column_name):
            continue
        with op.batch_alter_table(_TABLE) as batch_op:
            batch_op.drop_column(column_name)
