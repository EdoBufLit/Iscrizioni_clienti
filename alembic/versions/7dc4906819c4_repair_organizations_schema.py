"""repair_organizations_schema

Revision ID: 7dc4906819c4
Revises: b10aaa03eff4
Create Date: 2026-02-01 01:24:42.506494

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7dc4906819c4'
down_revision: Union[str, Sequence[str], None] = 'b10aaa03eff4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Check for missing columns and add them if necessary (repair drift)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c['name'] for c in inspector.get_columns('organizations')}

    with op.batch_alter_table('organizations') as batch_op:
        if 'address_line1' not in columns:
            batch_op.add_column(sa.Column('address_line1', sa.String(), nullable=True))
        if 'address_line2' not in columns:
            batch_op.add_column(sa.Column('address_line2', sa.String(), nullable=True))
        if 'city' not in columns:
            batch_op.add_column(sa.Column('city', sa.String(), nullable=True))
            # Conditional index creation is tricky with batch mode if table is recreated
            # But here we only add it if column was missing
            batch_op.create_index(batch_op.f('ix_organizations_city'), ['city'], unique=False)
        if 'province' not in columns:
            batch_op.add_column(sa.Column('province', sa.String(), nullable=True))
        if 'postal_code' not in columns:
            batch_op.add_column(sa.Column('postal_code', sa.String(), nullable=True))
        if 'country' not in columns:
            batch_op.add_column(sa.Column('country', sa.String(), nullable=True, server_default='Italy'))
        if 'description' not in columns:
            batch_op.add_column(sa.Column('description', sa.Text(), nullable=True))
        if 'email' not in columns:
            batch_op.add_column(sa.Column('email', sa.String(), nullable=True))
        if 'phone' not in columns:
            batch_op.add_column(sa.Column('phone', sa.String(), nullable=True))
        if 'website' not in columns:
            batch_op.add_column(sa.Column('website', sa.String(), nullable=True))
        if 'logo_path' not in columns:
            batch_op.add_column(sa.Column('logo_path', sa.String(), nullable=True))
        if 'is_active' not in columns:
            batch_op.add_column(sa.Column('is_active', sa.Boolean(), nullable=True, server_default='1'))
        if 'created_by_admin_id' not in columns:
            batch_op.add_column(sa.Column('created_by_admin_id', sa.Integer(), nullable=True))
            batch_op.create_foreign_key('fk_organizations_created_by', 'admin_users', ['created_by_admin_id'], ['id'])
        if 'created_at' not in columns:
            batch_op.add_column(sa.Column('created_at', sa.DateTime(), nullable=True))
        if 'updated_at' not in columns:
            batch_op.add_column(sa.Column('updated_at', sa.DateTime(), nullable=True))
        if 'statute_updated_at' not in columns:
            batch_op.add_column(sa.Column('statute_updated_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    pass
