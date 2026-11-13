"""The new queue is additive and must never backfill historical messages."""

import importlib.util
from io import StringIO
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
import sqlalchemy as sa

from app.models import AffiliateCommunicationWhatsApp


@pytest.fixture
def migration():
    path = Path(__file__).resolve().parents[1] / "alembic/versions/20261113_01_central_whatsapp.py"
    spec = importlib.util.spec_from_file_location("central_whatsapp_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def migrated(tmp_path, migration):
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'central-wa.db'}")
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        conn.exec_driver_sql("CREATE TABLE organizations (id INTEGER PRIMARY KEY)")
        conn.exec_driver_sql("CREATE TABLE affiliate_communications (id INTEGER PRIMARY KEY, subject TEXT)")
        conn.exec_driver_sql("INSERT INTO organizations VALUES (1)")
        conn.exec_driver_sql("INSERT INTO affiliate_communications VALUES (1, 'Historical sample without audience')")
        conn.commit()
        with Operations.context(MigrationContext.configure(conn)):
            migration.upgrade()
        conn.commit()
        yield conn
    engine.dispose()


def add_job(conn, job_id="test-job"):
    conn.execute(sa.text("INSERT INTO affiliate_communication_whatsapp (id, communication_id, organization_id, organization_name) VALUES (:id, 1, 1, 'Synthetic association')"), {"id": job_id})


def test_upgrade_matches_model_and_does_not_create_historical_jobs(migrated, migration):
    conn = migrated
    assert migration.down_revision == "20261112_02_paper_cards"
    assert conn.exec_driver_sql("SELECT count(*) FROM affiliate_communication_whatsapp").scalar_one() == 0
    assert conn.exec_driver_sql("SELECT subject FROM affiliate_communications WHERE id=1").scalar_one() == "Historical sample without audience"
    inspector = sa.inspect(conn)
    columns = {row["name"]: row for row in inspector.get_columns("affiliate_communication_whatsapp")}
    assert set(columns) == set(AffiliateCommunicationWhatsApp.__table__.columns.keys())
    for column in AffiliateCommunicationWhatsApp.__table__.columns:
        if not column.primary_key:
            assert columns[column.name]["nullable"] == column.nullable
    assert {tuple(row["column_names"]) for row in inspector.get_unique_constraints("affiliate_communication_whatsapp")} == {("communication_id", "organization_id")}
    assert {row["options"].get("ondelete") for row in inspector.get_foreign_keys("affiliate_communication_whatsapp")} == {"CASCADE"}


@pytest.mark.parametrize("parent", ["organizations", "affiliate_communications"])
def test_parent_deletion_removes_queue_and_phone_snapshot(migrated, parent):
    add_job(migrated)
    migrated.exec_driver_sql(f"DELETE FROM {parent} WHERE id=1")
    assert migrated.exec_driver_sql("SELECT count(*) FROM affiliate_communication_whatsapp").scalar_one() == 0
    assert migrated.exec_driver_sql("PRAGMA foreign_key_check").all() == []


def test_downgrade_and_reupgrade_preserve_communication(migrated, migration):
    conn = migrated
    add_job(conn)
    conn.commit()
    with Operations.context(MigrationContext.configure(conn)):
        migration.downgrade()
    conn.commit()
    assert conn.exec_driver_sql("SELECT count(*) FROM affiliate_communications").scalar_one() == 1
    with Operations.context(MigrationContext.configure(conn)):
        migration.upgrade()
    assert conn.exec_driver_sql("SELECT count(*) FROM affiliate_communication_whatsapp").scalar_one() == 0
    assert conn.exec_driver_sql("PRAGMA foreign_key_check").all() == []


def test_postgresql_ddl_is_additive_and_uses_cascading_queue_fks(migration):
    output = StringIO()
    context = MigrationContext.configure(dialect_name="postgresql", opts={"as_sql":True, "output_buffer":output})
    with Operations.context(context):
        migration.upgrade()
        migration.downgrade()
    sql = output.getvalue()
    assert "CREATE TABLE affiliate_communication_whatsapp" in sql
    assert "UNIQUE (communication_id, organization_id)" in sql
    assert "REFERENCES organizations (id) ON DELETE CASCADE" in sql
    assert "INSERT INTO" not in sql
    assert "DROP TABLE affiliate_communications;" not in sql
