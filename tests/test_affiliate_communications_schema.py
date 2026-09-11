"""Additive migration checks on an isolated database with foreign keys enabled."""

import importlib.util
from io import StringIO
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
import sqlalchemy as sa
from sqlalchemy.orm import Session

from app.db import Base
from app.models import (
    AdminRole, AdminUser,
    AffiliateCommunication, AffiliateCommunicationRead, AffiliateCommunicationRecipient,
    Organization, OrgAdminNotification,
)
from app.services.association_delete import _purge_association_dependencies


@pytest.fixture
def migration():
    path = Path(__file__).resolve().parents[1] / "alembic/versions/8c4d9e21f603_add_affiliate_communications.py"
    spec = importlib.util.spec_from_file_location("communications_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def communications_schema(tmp_path, migration):
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'communications.db'}")
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        for table in ("organizations", "admin_users"):
            conn.exec_driver_sql(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY)")
            conn.exec_driver_sql(f"INSERT INTO {table} (id) VALUES (1), (2)")
        conn.exec_driver_sql(
            "CREATE TABLE org_admin_notifications (id INTEGER PRIMARY KEY, "
            "admin_user_id INTEGER REFERENCES admin_users(id), "
            "org_id INTEGER REFERENCES organizations(id), "
            "type VARCHAR NOT NULL, title VARCHAR NOT NULL, is_read BOOLEAN NOT NULL)"
        )
        conn.exec_driver_sql(
            "INSERT INTO org_admin_notifications VALUES (1, 1, 1, 'low_cards', 'Scorta bassa', 0)"
        )
        conn.commit()
        with Operations.context(MigrationContext.configure(conn)):
            migration.upgrade()
        conn.commit()
        yield conn
    engine.dispose()


def insert_communication(conn):
    conn.exec_driver_sql(
        "INSERT INTO affiliate_communications "
        "(id, subject, body, audience, idempotency_key, request_fingerprint, "
        "created_by_admin_id, created_by_email, created_at, recipient_count, email_count, notification_count) "
        "VALUES (1, 'Circolare', 'Messaggio', 'all', 'unique-request', 'fingerprint', "
        "2, 'sender@example.com', '2026-09-11 08:00:00', 1, 1, 1)"
    )
    conn.exec_driver_sql(
        "INSERT INTO affiliate_communication_recipients "
        "(id, communication_id, organization_id, organization_name, admin_count, email_count) "
        "VALUES (1, 1, 2, 'Associazione storica', 1, 1)"
    )
    conn.exec_driver_sql(
        "INSERT INTO affiliate_communication_reads VALUES (1, 2, '2026-09-11 09:00:00')"
    )


def test_upgrade_preserves_notifications_and_matches_models(communications_schema, migration):
    conn = communications_schema
    assert migration.down_revision == "79a6d82bc401"
    assert conn.exec_driver_sql(
        "SELECT title, is_read, communication_id FROM org_admin_notifications WHERE id=1"
    ).one() == ("Scorta bassa", 0, None)
    inspector = sa.inspect(conn)
    for model in (AffiliateCommunication, AffiliateCommunicationRecipient, AffiliateCommunicationRead):
        table = model.__table__
        columns = {column["name"]: column for column in inspector.get_columns(table.name)}
        assert set(columns) == set(table.columns.keys())
        for column in table.columns:
            if not column.primary_key:
                assert columns[column.name]["nullable"] == column.nullable
        actual_fks = {
            (tuple(fk["constrained_columns"]), fk["referred_table"], fk["options"].get("ondelete"))
            for fk in inspector.get_foreign_keys(table.name)
        }
        expected_fks = {
            ((fk.parent.name,), fk.column.table.name, fk.ondelete)
            for fk in table.foreign_keys
        }
        assert actual_fks == expected_fks
    assert conn.exec_driver_sql("PRAGMA foreign_key_check").all() == []


def test_history_survives_org_and_sender_deletion_with_foreign_keys_enabled(communications_schema):
    conn = communications_schema
    insert_communication(conn)
    conn.exec_driver_sql("DELETE FROM organizations WHERE id=2")
    conn.exec_driver_sql("DELETE FROM admin_users WHERE id=2")
    assert conn.exec_driver_sql(
        "SELECT organization_id, organization_name FROM affiliate_communication_recipients"
    ).one() == (None, "Associazione storica")
    assert conn.exec_driver_sql(
        "SELECT created_by_admin_id, created_by_email, recipient_count FROM affiliate_communications"
    ).one() == (None, "sender@example.com", 1)
    assert conn.exec_driver_sql("SELECT COUNT(*) FROM affiliate_communication_reads").scalar() == 0
    assert conn.exec_driver_sql("PRAGMA foreign_key_check").all() == []


def test_downgrade_preserves_legacy_and_delivered_notifications(communications_schema, migration):
    conn = communications_schema
    insert_communication(conn)
    conn.exec_driver_sql(
        "INSERT INTO org_admin_notifications VALUES (2, 1, 1, 'central_communication', 'Circolare', 1, 1)"
    )
    with Operations.context(MigrationContext.configure(conn)):
        migration.downgrade()
    assert conn.exec_driver_sql(
        "SELECT id, type, title, is_read FROM org_admin_notifications ORDER BY id"
    ).all() == [(1, "low_cards", "Scorta bassa", 0), (2, "central_communication", "Circolare", 1)]
    assert "communication_id" not in {column["name"] for column in sa.inspect(conn).get_columns("org_admin_notifications")}
    assert not any(name.startswith("affiliate_communication") for name in sa.inspect(conn).get_table_names())
    assert conn.exec_driver_sql("PRAGMA foreign_key_check").all() == []


def test_postgresql_upgrade_and_downgrade_ddl(migration):
    output = StringIO()
    context = MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})
    with Operations.context(context):
        migration.upgrade()
        migration.downgrade()
    sql = output.getvalue()
    assert "CREATE TABLE affiliate_communications" in sql
    assert "UNIQUE (communication_id, organization_id)" in sql
    assert "FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE SET NULL" in sql
    assert "FOREIGN KEY(created_by_admin_id) REFERENCES admin_users (id) ON DELETE SET NULL" in sql
    assert "ALTER TABLE org_admin_notifications ADD COLUMN communication_id INTEGER" in sql
    assert "ALTER TABLE org_admin_notifications DROP COLUMN communication_id" in sql
    assert "DROP TABLE org_admin_notifications" not in sql


def test_association_purge_with_foreign_keys_enabled(tmp_path):
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'purge.db'}")
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        Base.metadata.create_all(conn)
        conn.commit()
        with Session(bind=conn, autoflush=False) as db:
            org = Organization(name="Associazione da eliminare", slug="purge-circolari")
            db.add(org)
            db.flush()
            admin = AdminUser(email="admin@example.com", role=AdminRole.ORG_ADMIN, org_id=org.id)
            db.add(admin)
            db.flush()
            message = AffiliateCommunication(
                subject="Circolare storica", body="Testo", audience="selected",
                idempotency_key="purge-message", request_fingerprint="fingerprint",
                created_by_admin_id=admin.id, created_by_email=admin.email, recipient_count=1,
            )
            db.add(message)
            db.flush()
            recipient = AffiliateCommunicationRecipient(
                communication_id=message.id, organization_id=org.id, organization_name=org.name,
            )
            db.add_all([
                recipient,
                AffiliateCommunicationRead(communication_id=message.id, admin_user_id=admin.id),
                OrgAdminNotification(admin_user_id=admin.id, org_id=org.id,
                                     type="central_communication", title=message.subject,
                                     body="Testo", href="/org-admin/comunicazioni-assonam",
                                     communication_id=message.id),
            ])
            db.commit()
            _purge_association_dependencies(db, org=org)
            db.commit()
            db.refresh(message)
            db.refresh(recipient)
            assert message.created_by_admin_id is None
            assert message.created_by_email == "admin@example.com"
            assert recipient.organization_id is None
            assert recipient.organization_name == "Associazione da eliminare"
            assert db.query(OrgAdminNotification).count() == 0
            assert db.query(AffiliateCommunicationRead).count() == 0
            assert conn.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    engine.dispose()
