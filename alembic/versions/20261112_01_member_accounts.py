"""Add personal member accounts without merging legacy memberships."""

import sqlalchemy as sa
from alembic import op

revision = "20261112_01_member_accounts"
down_revision = "20261109_01_org_capacity"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("member_accounts"):
        op.create_table(
            "member_accounts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("email", sa.String(), nullable=True),
            sa.Column("password_hash", sa.String(), nullable=True),
            sa.Column("preferred_member_id", sa.Integer(), nullable=True),
            sa.Column("auth_version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_member_accounts_email", "member_accounts", ["email"])
    elif "preferred_member_id" not in {c["name"] for c in inspector.get_columns("member_accounts")}:
        op.add_column("member_accounts", sa.Column("preferred_member_id", sa.Integer(), nullable=True))
    if "account_id" not in {c["name"] for c in inspector.get_columns("members")}:
        # SQLite supports an inline nullable REFERENCES column; adding a
        # named FK afterward would require rebuilding this large legacy table.
        if bind.dialect.name == "sqlite":
            op.execute("ALTER TABLE members ADD COLUMN account_id INTEGER REFERENCES member_accounts(id) ON DELETE SET NULL")
        else:
            op.add_column("members", sa.Column("account_id", sa.Integer(), sa.ForeignKey("member_accounts.id", ondelete="SET NULL"), nullable=True))
        op.create_index("ix_members_account_id", "members", ["account_id"])
    token_columns = {c["name"] for c in inspector.get_columns("tokens")}
    for name in ("account_id", "account_auth_version"):
        if name not in token_columns:
            op.add_column("tokens", sa.Column(name, sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("tokens", "account_auth_version")
    op.drop_column("tokens", "account_id")
    op.drop_index("ix_members_account_id", table_name="members")
    if op.get_bind().dialect.name == "sqlite":
        op.execute("ALTER TABLE members DROP COLUMN account_id")
    else:
        op.drop_column("members", "account_id")
    op.drop_index("ix_member_accounts_email", table_name="member_accounts")
    op.drop_table("member_accounts")
