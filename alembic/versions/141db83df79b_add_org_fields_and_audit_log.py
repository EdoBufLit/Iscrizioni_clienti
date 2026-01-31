"""add_org_fields_and_audit_log

Revision ID: 141db83df79b
Revises: 78de494c8cac
Create Date: 2026-01-31 18:52:35.529142

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '141db83df79b'
down_revision: Union[str, Sequence[str], None] = '78de494c8cac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Create OperationLog
    op.create_table('operation_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('actor_admin_id', sa.Integer(), nullable=True),
        sa.Column('actor_role', sa.String(), nullable=True),
        sa.Column('action', sa.String(), nullable=True),
        sa.Column('entity_type', sa.String(), nullable=True),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('metadata_json', sa.JSON(), nullable=True),
        sa.Column('ip', sa.String(), nullable=True),
        sa.Column('user_agent', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['actor_admin_id'], ['admin_users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('operation_logs', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_operation_logs_action'), ['action'], unique=False)
        batch_op.create_index(batch_op.f('ix_operation_logs_entity_type'), ['entity_type'], unique=False)
        batch_op.create_index(batch_op.f('ix_operation_logs_id'), ['id'], unique=False)

    # 2. Update Organization
    with op.batch_alter_table('organizations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('address_line1', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('address_line2', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('city', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('province', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('postal_code', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('country', sa.String(), nullable=True, server_default='Italy'))
        batch_op.add_column(sa.Column('description', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('email', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('phone', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('website', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('logo_path', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('is_active', sa.Boolean(), nullable=True, server_default='1'))
        batch_op.add_column(sa.Column('created_by_admin_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('created_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('updated_at', sa.DateTime(), nullable=True))

        batch_op.create_index(batch_op.f('ix_organizations_city'), ['city'], unique=False)
        # Naming the constraint explicitly is good for SQLite/Alembic compatibility
        batch_op.create_foreign_key('fk_organizations_created_by', 'admin_users', ['created_by_admin_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('organizations', schema=None) as batch_op:
        batch_op.drop_constraint('fk_organizations_created_by', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_organizations_city'))
        batch_op.drop_column('updated_at')
        batch_op.drop_column('created_at')
        batch_op.drop_column('created_by_admin_id')
        batch_op.drop_column('is_active')
        batch_op.drop_column('logo_path')
        batch_op.drop_column('website')
        batch_op.drop_column('phone')
        batch_op.drop_column('email')
        batch_op.drop_column('description')
        batch_op.drop_column('country')
        batch_op.drop_column('postal_code')
        batch_op.drop_column('province')
        batch_op.drop_column('city')
        batch_op.drop_column('address_line2')
        batch_op.drop_column('address_line1')

    with op.batch_alter_table('operation_logs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_operation_logs_id'))
        batch_op.drop_index(batch_op.f('ix_operation_logs_entity_type'))
        batch_op.drop_index(batch_op.f('ix_operation_logs_action'))

    op.drop_table('operation_logs')
