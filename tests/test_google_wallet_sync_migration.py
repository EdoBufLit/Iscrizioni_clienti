from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_wallet_migration_seeds_existing_annual_and_temporary_identities(monkeypatch):
    path = Path(__file__).resolve().parents[1] / "alembic/versions/20261017_04_wallet_sync.py"
    spec = spec_from_file_location("wallet_sync_migration", path)
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        for sql in (
            "CREATE TABLE organizations(id INTEGER PRIMARY KEY)",
            "CREATE TABLE members(id INTEGER PRIMARY KEY, org_id INTEGER, membership_type TEXT, card_no INTEGER, card_year INTEGER, google_wallet_object_id TEXT, google_wallet_class_id TEXT)",
            "CREATE TABLE temporary_membership_purchases(id INTEGER PRIMARY KEY, member_id INTEGER, card_no INTEGER, card_year INTEGER)",
            "INSERT INTO organizations VALUES(1)",
            "INSERT INTO members VALUES(1,1,'annual',100,2026,'123.annual','123.class'),(2,1,'temporary',101,2026,'123.temporary','123.class')",
            "INSERT INTO temporary_membership_purchases VALUES(10,2,101,2026)",
        ):
            connection.execute(text(sql))
        monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(connection)))
        migration.upgrade()
        rows = connection.execute(text("SELECT object_id,kind,temporary_purchase_id,provisioning FROM google_wallet_passes ORDER BY member_id")).all()
        assert [tuple(row) for row in rows] == [("123.annual", "annual", None, 0), ("123.temporary", "temporary", 10, 0)]
        assert connection.execute(text("SELECT count(*) FROM google_wallet_sync_jobs WHERE status='pending'")).scalar_one() == 2
        migration.downgrade()
        assert "google_wallet_passes" not in inspect(connection).get_table_names()
    engine.dispose()
