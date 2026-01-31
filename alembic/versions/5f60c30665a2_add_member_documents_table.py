"""add member_documents table

Revision ID: 5f60c30665a2
Revises: d9638477c3a7
Create Date: 2026-01-31 22:39:44.951060

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5f60c30665a2'
down_revision: Union[str, Sequence[str], None] = 'd9638477c3a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('member_documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('member_id', sa.Integer(), nullable=True),
        sa.Column('doc_type', sa.String(), nullable=True),
        sa.Column('rel_path', sa.String(), nullable=True),
        sa.Column('original_filename', sa.String(), nullable=True),
        sa.Column('mime_type', sa.String(), nullable=True),
        sa.Column('size_bytes', sa.Integer(), nullable=True),
        sa.Column('sha256', sa.String(), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('review_notes', sa.String(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('reviewed_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['member_id'], ['members.id'], ),
        sa.ForeignKeyConstraint(['reviewed_by'], ['admin_users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('member_documents', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_member_documents_id'), ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('member_documents', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_member_documents_id'))

    op.drop_table('member_documents')
