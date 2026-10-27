from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
import pytest

from app.db import Base


def test_extra_migrations_preserve_history_and_detach_deleted_profiles(monkeypatch):
    root = Path(__file__).resolve().parents[1]
    migrations = []
    for filename in ("20261026_05_accounting.py", "20261026_06_member_bulk.py"):
        spec = spec_from_file_location(filename.replace(".py", ""), root / "alembic" / "versions" / filename)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)
        migrations.append(module)
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        for table, key in (("organizations", "INTEGER"), ("admin_users", "INTEGER"), ("members", "INTEGER"), ("membership_payments", "INTEGER"), ("email_outbox", "VARCHAR(36)")):
            connection.exec_driver_sql(f"CREATE TABLE {table}(id {key} PRIMARY KEY)")
        for migration in migrations:
            monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(connection)))
            migration.upgrade()
        expected = {name for name in Base.metadata.tables if name.startswith(("accounting_receipts", "accounting_allocations", "accounting_events", "accounting_mutations", "member_bulk_"))}
        assert len(expected) == 7
        inspector = inspect(connection)
        for name in expected:
            columns = {column["name"]: column["nullable"] for column in inspector.get_columns(name)}
            assert columns == {column.name: column.nullable for column in Base.metadata.tables[name].columns}
            actual_indexes = {index["name"] for index in inspector.get_indexes(name)}
            assert actual_indexes == {index.name for index in Base.metadata.tables[name].indexes}
        for table in ("organizations", "admin_users", "members", "membership_payments"):
            connection.execute(text(f"INSERT INTO {table}(id) VALUES(1)"))
        connection.execute(text("INSERT INTO accounting_receipts(id,org_id,amount_cents,method,paid_on,source) VALUES(1,1,3000,'cash','2026-10-26','manual')"))
        connection.execute(text("INSERT INTO accounting_allocations(id,org_id,receipt_id,target_key,kind,member_id,member_name,expected_cents,amount_cents,payment_id) VALUES(1,1,1,'initial:1:2026','initial',1,'Socio storico',3000,3000,1)"))
        connection.execute(text("INSERT INTO accounting_events(id,org_id,receipt_id,action,actor_snapshot) VALUES(1,1,1,'created','{}')"))
        connection.execute(text("INSERT INTO member_bulk_runs(id,org_id,created_by_admin_id,request_key,payload_fingerprint,action,selection_mode,selected_count,eligible_count,expires_at) VALUES('run-1',1,1,'preview-key','hash','export','ids',1,1,'2026-10-26 23:00:00')"))
        connection.execute(text("INSERT INTO member_bulk_items(id,run_id,member_id,requested_member_id,preview_eligible) VALUES(1,'run-1',1,1,1)"))
        connection.execute(text("INSERT INTO member_bulk_requests(run_id,request_key,operation) VALUES('run-1','execute-key','execute')"))
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(text("INSERT INTO member_bulk_requests(run_id,request_key,operation) VALUES('run-1','execute-key','execute')"))
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(text("UPDATE accounting_receipts SET amount_cents=0 WHERE id=1"))
        connection.execute(text("DELETE FROM members WHERE id=1"))
        assert connection.execute(text("SELECT member_id FROM accounting_allocations")).scalar_one() is None
        assert connection.execute(text("SELECT member_id,requested_member_id FROM member_bulk_items")).one() == (None, 1)
        connection.execute(text("DELETE FROM membership_payments WHERE id=1"))
        assert connection.execute(text("SELECT payment_id FROM accounting_allocations")).scalar_one() is None
        connection.execute(text("DELETE FROM organizations WHERE id=1"))
        assert connection.execute(text("SELECT org_id FROM accounting_receipts")).scalar_one() is None
        assert connection.execute(text("SELECT COUNT(*) FROM accounting_events")).scalar_one() == 1
        assert connection.execute(text("SELECT COUNT(*) FROM member_bulk_items")).scalar_one() == 0
        for migration in reversed(migrations):
            migration.downgrade()
        assert not expected.intersection(inspect(connection).get_table_names())
    engine.dispose()
