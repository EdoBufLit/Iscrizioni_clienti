from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
from sqlalchemy import create_engine, inspect, text

from app import schema_validation
from init_db import _ensure_member_auth_columns


def _legacy_auth_schema(connection):
    for statement in (
        "CREATE TABLE members (id INTEGER PRIMARY KEY)",
        "CREATE TABLE tokens (id INTEGER PRIMARY KEY, member_id INTEGER, purpose TEXT)",
        "CREATE TABLE admin_mfa_factors (admin_id INTEGER, status TEXT)",
        "CREATE TABLE org_admin_sessions (id INTEGER PRIMARY KEY, admin_id INTEGER, mfa_verified_at DATETIME, revoked_at DATETIME)",
        "INSERT INTO members (id) VALUES (1)",
        "INSERT INTO tokens VALUES (1,1,'LOGIN_MAGIC_LINK'), (2,1,'PASSWORD_RESET'), (3,1,'REGISTRATION_CONTINUATION'), (4,1,'SIGNUP_CONTINUE')",
        "INSERT INTO admin_mfa_factors VALUES (10,'active'), (11,'pending')",
        "INSERT INTO org_admin_sessions VALUES (1,10,NULL,NULL), (2,10,'2026-01-01',NULL), (3,11,NULL,NULL), (4,10,NULL,'2026-01-02')",
    ):
        connection.execute(text(statement))


def test_auth_migration_backfills_existing_proofs_and_only_revokes_unverified_mfa_sessions(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'auth-migration.db'}")
    migration_path = Path(__file__).resolve().parents[1] / "alembic/versions/20261017_01_member_auth.py"
    spec = importlib.util.spec_from_file_location("member_auth_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    try:
        with engine.begin() as connection:
            _legacy_auth_schema(connection)
            monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(connection)))
            migration.upgrade()
            assert connection.execute(text("SELECT auth_version FROM members")).scalar_one() == 1
            assert connection.execute(text("SELECT auth_version FROM tokens ORDER BY id")).scalars().all() == [1, 1, 1, None]
            rows = dict(connection.execute(text("SELECT id, revoked_at FROM org_admin_sessions")).all())
            assert rows[1] is not None
            assert rows[2] is None
            assert rows[3] is None
            assert rows[4] == "2026-01-02"
            assert inspect(connection).get_columns("members")[-1]["nullable"] is False
        with pytest.raises(RuntimeError, match="cannot be removed safely"):
            migration.downgrade()
    finally:
        engine.dispose()


def test_local_bootstrap_backfills_once_and_never_upgrades_unversioned_proofs_again(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'auth-bootstrap.db'}")
    try:
        with engine.begin() as connection:
            _legacy_auth_schema(connection)
            _ensure_member_auth_columns(connection)
            connection.execute(text("UPDATE members SET auth_version=2"))
            connection.execute(text("INSERT INTO tokens (id, member_id, purpose) VALUES (5,1,'LOGIN_MAGIC_LINK')"))
            _ensure_member_auth_columns(connection)
            assert connection.execute(text("SELECT auth_version FROM tokens ORDER BY id")).scalars().all() == [1, 1, 1, None, None]
            assert connection.execute(text("SELECT auth_version FROM members")).scalar_one() == 2
    finally:
        engine.dispose()


@pytest.mark.parametrize("table", ["members", "tokens"])
def test_sqlite_schema_gate_requires_auth_version(tmp_path, table):
    engine = create_engine(f"sqlite:///{tmp_path / 'auth-gate.db'}")
    try:
        with engine.begin() as connection:
            org_columns = ", ".join(f'"{name}" TEXT' for name in schema_validation.REQUIRED_ORG_COLUMNS)
            connection.execute(text(f"CREATE TABLE organizations ({org_columns})"))
            for name in ("members", "tokens"):
                column = "id INTEGER" if name == table else "id INTEGER, auth_version INTEGER"
                connection.execute(text(f"CREATE TABLE {name} ({column})"))
        with pytest.raises(RuntimeError, match=f"{table}.auth_version"):
            schema_validation.validate_schema(engine)
    finally:
        engine.dispose()
