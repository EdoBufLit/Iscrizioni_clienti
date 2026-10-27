from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
from sqlalchemy import create_engine, inspect, text


def test_temporary_migration_preserves_legacy_identity_and_is_repeatable(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    path = Path(__file__).resolve().parents[1] / "alembic/versions/20261017_02_temporary_memberships.py"
    spec = spec_from_file_location("temporary_membership_migration", path)
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    with engine.begin() as connection:
        for statement in (
            "CREATE TABLE organizations (id INTEGER PRIMARY KEY,membership_fee_currency TEXT)",
            "CREATE TABLE card_batches (id INTEGER PRIMARY KEY)",
            "CREATE TABLE numbering_scopes (id INTEGER PRIMARY KEY)",
            "CREATE TABLE membership_payments (id INTEGER PRIMARY KEY)",
            "CREATE TABLE member_payments (id INTEGER PRIMARY KEY)",
            "CREATE TABLE members (id INTEGER PRIMARY KEY, org_id INTEGER, status TEXT, membership_type TEXT, card_no INTEGER, card_year INTEGER, batch_id INTEGER, numbering_scope_id INTEGER, membership_fee_snapshot NUMERIC, valid_from DATETIME, valid_until DATETIME,joined_at DATETIME,deleted_at DATETIME)",
            "INSERT INTO organizations VALUES (1,'EUR')",
            "INSERT INTO members VALUES (1,1,'EXPIRED','temporary',321,2025,NULL,NULL,10,'2025-01-05 10:00:00','2025-01-05 14:00:00','2025-01-05 00:00:00',NULL)",
        ):
            connection.execute(text(statement))
        monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(connection)))
        migration.upgrade()
        migration.upgrade()
        snapshot = connection.execute(text("SELECT member_id,status,source,card_no,card_year,valid_from,valid_until FROM temporary_membership_purchases")).one()
        assert tuple(snapshot) == (1,"expired","legacy",321,2025,"2025-01-05 10:00:00","2025-01-05 14:00:00")
        assert connection.execute(text("SELECT access_email_requested FROM members")).scalar_one() == 0
        assert "temporary_purchase_id" in {item["name"] for item in inspect(connection).get_columns("membership_payments")}
        assert any(index["unique"] and index["column_names"] == ["membership_payment_id"] for index in inspect(connection).get_indexes("member_payments"))
        with pytest.raises(RuntimeError, match="history exists"):
            migration.downgrade()
    engine.dispose()
