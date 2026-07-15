from __future__ import annotations

import pytest
from sqlalchemy import create_engine, text

import init_db as init_db_module
from app.config import settings


def _isolated_engine(tmp_path, *versions: str, create_version_table: bool = True):
    target_engine = create_engine(f"sqlite:///{tmp_path / 'schema-gate.db'}")
    if create_version_table:
        with target_engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE TABLE alembic_version "
                    "(version_num VARCHAR(64) NOT NULL PRIMARY KEY)"
                )
            )
            for version in versions:
                conn.execute(
                    text("INSERT INTO alembic_version (version_num) VALUES (:version)"),
                    {"version": version},
                )
    return target_engine


def test_code_has_exactly_one_alembic_head():
    head = init_db_module._single_code_alembic_head()

    assert head
    assert isinstance(head, str)


def test_deployed_schema_gate_rejects_missing_version_table(tmp_path):
    target_engine = _isolated_engine(tmp_path, create_version_table=False)
    try:
        with pytest.raises(RuntimeError, match="alembic_version is missing"):
            init_db_module._validate_deployed_alembic_revision(target_engine)
    finally:
        target_engine.dispose()


def test_deployed_schema_gate_rejects_stale_revision(tmp_path):
    target_engine = _isolated_engine(tmp_path, "stale_revision")
    try:
        with pytest.raises(RuntimeError, match="does not exactly match code head"):
            init_db_module._validate_deployed_alembic_revision(target_engine)
    finally:
        target_engine.dispose()


def test_deployed_schema_gate_rejects_divergent_revisions(tmp_path):
    current_head = init_db_module._single_code_alembic_head()
    target_engine = _isolated_engine(tmp_path, current_head, "divergent_head")
    try:
        with pytest.raises(RuntimeError, match="does not exactly match code head"):
            init_db_module._validate_deployed_alembic_revision(target_engine)
    finally:
        target_engine.dispose()


@pytest.mark.parametrize(
    ("app_env", "skip_create_all"),
    [
        ("staging", False),
        ("production", False),
        ("local", True),
    ],
)
def test_deployed_init_requires_current_head_and_never_runs_legacy_ddl(
    tmp_path,
    monkeypatch,
    app_env: str,
    skip_create_all: bool,
):
    current_head = init_db_module._single_code_alembic_head()
    target_engine = _isolated_engine(tmp_path, current_head)
    seed_calls: list[str] = []

    monkeypatch.setattr(init_db_module, "engine", target_engine)
    monkeypatch.setattr(init_db_module, "SKIP_CREATE_ALL", skip_create_all)
    monkeypatch.setattr(settings, "APP_ENV", app_env)
    monkeypatch.setattr(
        init_db_module,
        "_run_legacy_table_bootstrap",
        lambda: pytest.fail("legacy table CREATE path ran in deployed mode"),
    )
    monkeypatch.setattr(
        init_db_module,
        "_run_legacy_column_migrations",
        lambda: pytest.fail("legacy ALTER/index path ran in deployed mode"),
    )
    monkeypatch.setattr(init_db_module, "_seed_database", lambda: seed_calls.append("seed"))

    try:
        init_db_module.init_db()
    finally:
        target_engine.dispose()

    assert seed_calls == ["seed"]


def test_deployed_init_fails_before_seed_when_revision_is_stale(tmp_path, monkeypatch):
    target_engine = _isolated_engine(tmp_path, "stale_revision")
    seed_calls: list[str] = []

    monkeypatch.setattr(init_db_module, "engine", target_engine)
    monkeypatch.setattr(init_db_module, "SKIP_CREATE_ALL", False)
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(init_db_module, "_seed_database", lambda: seed_calls.append("seed"))

    try:
        with pytest.raises(RuntimeError, match="does not exactly match code head"):
            init_db_module.init_db()
    finally:
        target_engine.dispose()

    assert seed_calls == []
