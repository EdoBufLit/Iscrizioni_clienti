"""Namespacing cards must preserve legacy SQLite parents and their children."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import subprocess
import sys

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError


def _migration():
    path = Path(__file__).resolve().parents[1] / "alembic/versions/20261112_02_paper_cards.py"
    spec = importlib.util.spec_from_file_location("paper_cards_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _legacy_data(connection, *, unique_kind="constraint"):
    connection.exec_driver_sql("PRAGMA foreign_keys=ON")
    constraint = ", CONSTRAINT uix_org_card UNIQUE(org_id,card_no)" if unique_kind == "constraint" else ""
    statements = [
        "CREATE TABLE organizations (id INTEGER PRIMARY KEY, name TEXT)",
        "CREATE TABLE member_accounts (id INTEGER PRIMARY KEY, email TEXT)",
        f"CREATE TABLE members (id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES organizations(id), account_id INTEGER REFERENCES member_accounts(id) ON DELETE SET NULL, email TEXT, card_no INTEGER, card_year INTEGER, password_hash TEXT, auth_version INTEGER NOT NULL DEFAULT 1, deleted_at DATETIME, CONSTRAINT uq_other_member_field UNIQUE(org_id,email){constraint})",
        "CREATE TABLE annual_membership_terms (id INTEGER PRIMARY KEY, member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE, org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, membership_year INTEGER NOT NULL, card_year INTEGER, card_no INTEGER, status TEXT NOT NULL, CONSTRAINT uq_term_member_year UNIQUE(member_id,membership_year))",
        "CREATE UNIQUE INDEX uq_annual_membership_terms_active_org_year_card ON annual_membership_terms(org_id,card_year,card_no) WHERE status NOT IN ('expired','cancelled')",
        "CREATE UNIQUE INDEX uq_members_org_year_lower_email_active ON members(org_id,card_year,lower(email)) WHERE deleted_at IS NULL AND email IS NOT NULL AND card_year IS NOT NULL",
        "CREATE INDEX ix_members_account_id ON members(account_id)",
        "CREATE TABLE member_documents (id INTEGER PRIMARY KEY, member_id INTEGER REFERENCES members(id) ON DELETE CASCADE, filename TEXT)",
        "CREATE TABLE member_payments (id INTEGER PRIMARY KEY, member_id INTEGER REFERENCES members(id), amount_cents INTEGER)",
        "CREATE TABLE tokens (id INTEGER PRIMARY KEY, member_id INTEGER REFERENCES members(id) ON DELETE CASCADE, token_hash TEXT)",
        "INSERT INTO organizations VALUES (1,'Golden'),(2,'Frutta')",
        "INSERT INTO member_accounts VALUES (1,'person@example.com')",
        "INSERT INTO members VALUES (11,1,1,'person@example.com',27635,2026,'hash-one',3,NULL),(22,1,NULL,'other@example.com',28696,2026,'hash-two',7,NULL)",
        "INSERT INTO annual_membership_terms VALUES (101,11,1,2026,2026,27635,'active'),(102,22,1,2026,2026,28696,'active')",
        "INSERT INTO member_documents VALUES (1,11,'identity.pdf'),(2,22,'other.pdf')",
        "INSERT INTO member_payments VALUES (1,11,1500),(2,22,2500)",
        "INSERT INTO tokens VALUES (1,11,'hash-proof-one'),(2,22,'hash-proof-two')",
    ]
    if unique_kind == "index":
        statements.insert(3, "CREATE UNIQUE INDEX pgloader_card_unique ON members(org_id,card_no)")
    for statement in statements:
        connection.execute(text(statement))
    connection.commit()


def _snapshot(connection):
    return {
        "members": connection.execute(text("SELECT id,org_id,account_id,email,card_no,card_year,password_hash,auth_version,deleted_at FROM members ORDER BY id")).all(),
        "terms": connection.execute(text("SELECT id,member_id,org_id,membership_year,card_year,card_no,status FROM annual_membership_terms ORDER BY id")).all(),
        **{table: connection.execute(text(f"SELECT * FROM {table} ORDER BY id")).all()
           for table in ("member_accounts", "member_documents", "member_payments", "tokens")},
    }


def _run(connection, migration, monkeypatch, direction="upgrade"):
    # The migration owns this transaction and may commit/restart it to switch
    # SQLite foreign_keys safely. An external engine.begin() is not equivalent.
    connection.commit()
    context = MigrationContext.configure(connection, opts={"transactional_ddl": True})
    monkeypatch.setattr(migration, "op", Operations(context))
    with context.begin_transaction():
        getattr(migration, direction)()


@pytest.mark.parametrize("unique_kind", ["constraint", "index"])
def test_paper_migration_preserves_fk_children_credentials_and_unrelated_indexes(tmp_path, monkeypatch, unique_kind):
    engine = create_engine(f"sqlite:///{tmp_path / ('paper-' + unique_kind + '.db')}")
    migration = _migration()
    try:
        with engine.connect() as connection:
            _legacy_data(connection, unique_kind=unique_kind)
            before = _snapshot(connection)
            email_index = connection.execute(text("SELECT sql FROM sqlite_master WHERE name='uq_members_org_year_lower_email_active'")).scalar_one()
            _run(connection, migration, monkeypatch)
            assert _snapshot(connection) == before
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
            assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
            assert connection.execute(text("SELECT sql FROM sqlite_master WHERE name='uq_members_org_year_lower_email_active'")).scalar_one() == email_index
            for table in ("members", "annual_membership_terms"):
                column = next(item for item in inspect(connection).get_columns(table) if item["name"] == "card_namespace")
                assert column["nullable"] is False
                assert connection.execute(text(f"SELECT DISTINCT card_namespace FROM {table}")).scalars().all() == ["digital"]
            constraints = inspect(connection).get_unique_constraints("members")
            assert any(set(item["column_names"]) == {"org_id", "card_namespace", "card_no"} for item in constraints)
            assert any(set(item["column_names"]) == {"org_id", "email"} for item in constraints)
            _run(connection, migration, monkeypatch)
            assert _snapshot(connection) == before
    finally:
        engine.dispose()


def test_namespace_uniqueness_allows_paper_and_digital_but_rejects_same_namespace_duplicates(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'paper-unique.db'}")
    try:
        with engine.connect() as connection:
            _legacy_data(connection)
            _run(connection, _migration(), monkeypatch)
            connection.execute(text("INSERT INTO members(id,org_id,email,card_no,card_year,card_namespace) VALUES (33,1,'paper@example.com',28696,2026,'paper_exception')"))
            connection.execute(text("INSERT INTO annual_membership_terms(id,member_id,org_id,membership_year,card_year,card_no,status,card_namespace) VALUES (103,33,1,2026,2026,28696,'active','paper_exception')"))
            connection.commit()
            assert connection.execute(text("SELECT card_namespace FROM members WHERE card_no=28696 ORDER BY id")).scalars().all() == ["digital", "paper_exception"]
            with pytest.raises(IntegrityError):
                with connection.begin_nested():
                    connection.execute(text("INSERT INTO members(id,org_id,email,card_no,card_year,card_namespace) VALUES (44,1,'duplicate@example.com',28696,2026,'paper_exception')"))
            with pytest.raises(IntegrityError):
                with connection.begin_nested():
                    connection.execute(text("INSERT INTO annual_membership_terms(id,member_id,org_id,membership_year,card_year,card_no,status,card_namespace) VALUES (104,11,1,2027,2026,28696,'active','paper_exception')"))
            assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    finally:
        engine.dispose()


def test_digital_only_schema_can_round_trip_without_losing_children_or_credentials(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'paper-roundtrip.db'}")
    migration = _migration()
    try:
        with engine.connect() as connection:
            _legacy_data(connection)
            before = _snapshot(connection)
            _run(connection, migration, monkeypatch)
            _run(connection, migration, monkeypatch, "downgrade")
            assert _snapshot(connection) == before
            assert "card_namespace" not in {item["name"] for item in inspect(connection).get_columns("members")}
            _run(connection, migration, monkeypatch)
            assert _snapshot(connection) == before
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
            assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    finally:
        engine.dispose()


@pytest.mark.parametrize("table", ["members", "annual_membership_terms"])
def test_downgrade_fails_before_mutation_when_any_paper_snapshot_exists(tmp_path, monkeypatch, table):
    engine = create_engine(f"sqlite:///{tmp_path / ('paper-downgrade-' + table + '.db')}")
    migration = _migration()
    try:
        with engine.connect() as connection:
            _legacy_data(connection)
            _run(connection, migration, monkeypatch)
            connection.execute(text(f"UPDATE {table} SET card_namespace='paper_exception' WHERE id=" + ("11" if table == "members" else "101")))
            connection.commit()
            before = _snapshot(connection)
            with pytest.raises(RuntimeError, match="Paper card references exist"):
                _run(connection, migration, monkeypatch, "downgrade")
            assert _snapshot(connection) == before
            assert "card_namespace" in {item["name"] for item in inspect(connection).get_columns("members")}
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
    finally:
        engine.dispose()


def test_external_sqlite_transaction_is_rejected_without_rebuilding_or_deleting_rows(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'paper-external-transaction.db'}")
    migration = _migration()
    try:
        with engine.connect() as connection:
            _legacy_data(connection)
            before = _snapshot(connection)
            connection.commit()
            with connection.begin():
                context = MigrationContext.configure(connection)
                monkeypatch.setattr(migration, "op", Operations(context))
                with pytest.raises(RuntimeError, match="externally managed SQLite transaction"):
                    migration.upgrade()
            assert _snapshot(connection) == before
            assert "card_namespace" not in {item["name"] for item in inspect(connection).get_columns("members")}
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
    finally:
        engine.dispose()


def test_real_alembic_cli_upgrades_a_stamped_sqlite_database_without_losing_children(tmp_path):
    path = tmp_path / "paper-real-alembic.db"
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    try:
        with engine.connect() as connection:
            _legacy_data(connection)
            before = _snapshot(connection)
            connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"))
            connection.execute(text("INSERT INTO alembic_version VALUES ('20261112_01_member_accounts')"))
            connection.commit()
        environment = dict(os.environ, DATABASE_URL=f"sqlite:///{path.as_posix()}", APP_ENV="test", SKIP_CREATE_ALL="1")
        repository = Path(__file__).resolve().parents[1]
        result = subprocess.run([sys.executable, "-m", "alembic", "-c", str(repository / "alembic.ini"),
                                 "upgrade", "20261112_02_paper_cards"], cwd=repository, env=environment,
                                capture_output=True, text=True, timeout=45)
        assert result.returncode == 0, result.stdout + result.stderr
        with engine.connect() as connection:
            assert _snapshot(connection) == before
            assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "20261112_02_paper_cards"
            assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    finally:
        engine.dispose()
