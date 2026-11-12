"""The account migration must leave every pre-existing membership untouched."""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def _migration():
    path = Path(__file__).resolve().parents[1] / "alembic/versions/20261112_01_member_accounts.py"
    spec = importlib.util.spec_from_file_location("member_accounts_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _legacy_data(connection):
    for statement in (
        "PRAGMA foreign_keys=ON",
        "CREATE TABLE organizations (id INTEGER PRIMARY KEY, name TEXT)",
        "CREATE TABLE members (id INTEGER PRIMARY KEY, org_id INTEGER REFERENCES organizations(id), email TEXT, card_no INTEGER, card_year INTEGER, password_hash TEXT, auth_version INTEGER NOT NULL DEFAULT 1)",
        "CREATE TABLE tokens (id INTEGER PRIMARY KEY, member_id INTEGER REFERENCES members(id), purpose TEXT, auth_version INTEGER)",
        "CREATE TABLE member_documents (id INTEGER PRIMARY KEY, member_id INTEGER REFERENCES members(id), original_filename TEXT)",
        "CREATE TABLE member_payments (id INTEGER PRIMARY KEY, member_id INTEGER REFERENCES members(id), amount_cents INTEGER)",
        "INSERT INTO organizations VALUES (1,'One'),(2,'Two')",
        "INSERT INTO members VALUES (11,1,'shared@example.test',27635,2026,'legacy-a',4),(22,2,'shared@example.test',28696,2026,'legacy-b',2)",
        "INSERT INTO tokens VALUES (1,11,'LOGIN_MAGIC_LINK',4),(2,22,'PASSWORD_RESET',2)",
        "INSERT INTO member_documents VALUES (1,11,'identity-a.pdf'),(2,22,'identity-b.pdf')",
        "INSERT INTO member_payments VALUES (1,11,1500),(2,22,2500)",
    ):
        connection.execute(text(statement))


def _snapshot(connection):
    return {
        "members": connection.execute(text("SELECT id,org_id,email,card_no,card_year,password_hash,auth_version FROM members ORDER BY id")).all(),
        "tokens": connection.execute(text("SELECT id,member_id,purpose,auth_version FROM tokens ORDER BY id")).all(),
        "documents": connection.execute(text("SELECT * FROM member_documents ORDER BY id")).all(),
        "payments": connection.execute(text("SELECT * FROM member_payments ORDER BY id")).all(),
    }


def test_account_migration_is_additive_repeatable_and_never_merges_shared_email(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'personal-account-migration.db'}")
    migration = _migration()
    try:
        with engine.begin() as connection:
            _legacy_data(connection)
            before = _snapshot(connection)
            monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(connection)))
            migration.upgrade()
            assert _snapshot(connection) == before
            assert connection.execute(text("SELECT COUNT(*) FROM member_accounts")).scalar_one() == 0
            assert connection.execute(text("SELECT account_id FROM members ORDER BY id")).scalars().all() == [None, None]
            assert connection.execute(text("SELECT account_id,account_auth_version FROM tokens ORDER BY id")).all() == [(None, None), (None, None)]
            assert "ix_members_account_id" in {item["name"] for item in inspect(connection).get_indexes("members")}
            foreign_keys = inspect(connection).get_foreign_keys("members")
            assert any(item["constrained_columns"] == ["account_id"] and item["referred_table"] == "member_accounts" for item in foreign_keys)
            migration.upgrade()
            assert _snapshot(connection) == before
            assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    finally:
        engine.dispose()


def test_unadopted_migration_can_roll_back_and_reapply_without_changing_cards_or_history(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'personal-account-roundtrip.db'}")
    migration = _migration()
    try:
        with engine.begin() as connection:
            _legacy_data(connection)
            before = _snapshot(connection)
            monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(connection)))
            migration.upgrade()
            migration.downgrade()
            assert "account_id" not in {column["name"] for column in inspect(connection).get_columns("members")}
            assert _snapshot(connection) == before
            migration.upgrade()
            assert _snapshot(connection) == before
            assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    finally:
        engine.dispose()
