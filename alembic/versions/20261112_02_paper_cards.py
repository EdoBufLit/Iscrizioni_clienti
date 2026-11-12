"""Separate operator-imported paper card references from digital stock."""

from contextlib import contextmanager

import sqlalchemy as sa
from alembic import op

revision = "20261112_02_paper_cards"
down_revision = "20261112_01_member_accounts"
branch_labels = None
depends_on = None


@contextmanager
def _safe_schema_changes():
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        yield
        return
    context = op.get_context()
    if bind.in_transaction() and getattr(context, "_transaction", None) is None:
        raise RuntimeError("Paper card migration must run through Alembic outside an externally managed SQLite transaction.")
    # Rebuilding the parent members table with foreign keys enabled can
    # cascade-delete documents/payments. SQLite ignores PRAGMA changes inside
    # a transaction, so both switches and the rebuild run in autocommit.
    with context.autocommit_block():
        enabled = bind.exec_driver_sql("PRAGMA foreign_keys").scalar()
        bind.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            yield
        finally:
            bind.exec_driver_sql(f"PRAGMA foreign_keys={'ON' if enabled else 'OFF'}")
        if bind.exec_driver_sql("PRAGMA foreign_key_check").first() is not None:
            raise RuntimeError("Foreign key verification failed after paper card migration.")


def _member_uniqueness(columns):
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    desired = set(columns)
    constraints = [item for item in inspector.get_unique_constraints("members")
                   if set(item["column_names"]) in ({"org_id", "card_no"}, {"org_id", "card_namespace", "card_no"})]
    indexes = [item for item in inspector.get_indexes("members")
               if item.get("unique") and set(item["column_names"]) in ({"org_id", "card_no"}, {"org_id", "card_namespace", "card_no"})
               and not item.get("duplicates_constraint")]
    if any(set(item["column_names"]) == desired for item in (*constraints, *indexes)):
        return
    # Production may contain pgloader's unique index instead of SQLAlchemy's
    # named constraint. Discover both forms rather than assuming its name.
    for item in indexes:
        op.drop_index(item["name"], table_name="members")
    if bind.dialect.name == "sqlite":
        # SQLite reflection omits expression indexes such as the existing
        # case-insensitive active-email uniqueness rule. Preserve their exact
        # SQL, and triggers, across Alembic's parent-table rebuild.
        ancillary = bind.execute(sa.text("SELECT type, name, sql FROM sqlite_master WHERE tbl_name = 'members' AND type IN ('index', 'trigger') AND sql IS NOT NULL")).all()
        convention = {"uq": "uq_%(table_name)s_%(column_0_name)s"}
        with op.batch_alter_table("members", naming_convention=convention) as batch:
            for item in constraints:
                batch.drop_constraint(item["name"] or f"uq_members_{item['column_names'][0]}", type_="unique")
            batch.create_unique_constraint("uix_org_card", columns)
        existing = set(bind.execute(sa.text("SELECT name FROM sqlite_master WHERE type IN ('index', 'trigger')")).scalars())
        for _kind, name, sql in ancillary:
            if name not in existing:
                bind.exec_driver_sql(sql)
    else:
        for item in constraints:
            op.drop_constraint(item["name"], "members", type_="unique")
        op.create_unique_constraint("uix_org_card", "members", columns)


def _term_index(columns):
    name = "uq_annual_membership_terms_active_org_year_card"
    indexes = {item["name"]: item for item in sa.inspect(op.get_bind()).get_indexes("annual_membership_terms")}
    if name in indexes and indexes[name]["column_names"] == columns:
        return
    if name in indexes:
        op.drop_index(name, table_name="annual_membership_terms")
    predicate = sa.text("status NOT IN ('expired', 'cancelled')")
    op.create_index(name, "annual_membership_terms", columns, unique=True, sqlite_where=predicate, postgresql_where=predicate)


def upgrade():
    with _safe_schema_changes():
        for table in ("members", "annual_membership_terms"):
            if "card_namespace" not in {item["name"] for item in sa.inspect(op.get_bind()).get_columns(table)}:
                op.add_column(table, sa.Column("card_namespace", sa.String(24), nullable=False, server_default="digital"))
        _member_uniqueness(["org_id", "card_namespace", "card_no"])
        _term_index(["org_id", "card_year", "card_namespace", "card_no"])


def downgrade():
    bind = op.get_bind()
    for table in ("members", "annual_membership_terms"):
        if bind.execute(sa.text(f"SELECT 1 FROM {table} WHERE card_namespace <> 'digital' LIMIT 1")).first():
            raise RuntimeError("Paper card references exist; downgrade would merge distinct numbering namespaces.")
    with _safe_schema_changes():
        _member_uniqueness(["org_id", "card_no"])
        _term_index(["org_id", "card_year", "card_no"])
        op.drop_column("annual_membership_terms", "card_namespace")
        op.drop_column("members", "card_namespace")
