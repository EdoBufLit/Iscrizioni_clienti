"""Runtime DB limits; real checks require a disposable stock_tests database.

Run the PostgreSQL checks with APP_ENV=test and DATABASE_URL pointing only to
stock_tests, using pytest --noconftest tests/test_db_timeouts.py. Normal fixtures
force SQLite and still run the connection-configuration and checkout tests.
"""

from __future__ import annotations

import os
import time
from contextlib import contextmanager
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.dialects.postgresql.psycopg2 import PGDialect_psycopg2
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError, TimeoutError as PoolTimeoutError

from app.db import (
    _engine_kwargs_for_url,
    _restore_postgresql_timeouts,
    create_app_engine,
)


def test_postgresql_url_keeps_options_and_cannot_disable_runtime_timeouts():
    url = make_url("postgresql+psycopg2://test:test@localhost/stock_tests").update_query_dict(
        {
            "options": "-csearch_path=custom,public -cstatement_timeout=0 -clock_timeout=0",
            "connect_timeout": "0",
            "application_name": "existing-name",
        }
    )
    kwargs = _engine_kwargs_for_url(url.render_as_string(hide_password=False))
    _, connection_kwargs = PGDialect_psycopg2().create_connect_args(url)
    connection_kwargs.update(kwargs["connect_args"])

    assert connection_kwargs["application_name"] == "existing-name"
    assert connection_kwargs["connect_timeout"] == 5
    assert connection_kwargs["options"].startswith(url.query["options"] + " ")
    assert connection_kwargs["options"].endswith(
        "-clock_timeout=5000 -cstatement_timeout=30000 "
        "-cidle_in_transaction_session_timeout=60000"
    )
    engine = create_app_engine(url.render_as_string(hide_password=False))
    try:
        assert engine.pool.size() == 5
        assert engine.pool.timeout() == 5
        assert engine.pool._max_overflow == 5
    finally:
        engine.dispose()


def test_repeated_options_are_rejected_without_revealing_connection_credentials():
    with pytest.raises(ValueError, match="options must appear only once") as exc:
        _engine_kwargs_for_url(
            "postgresql://test:private-password@localhost/stock_tests?options=one&options=two"
        )
    assert "private-password" not in str(exc.value)


@pytest.mark.parametrize("initial_autocommit", [False, True])
@pytest.mark.parametrize("fails", [False, True])
def test_checkout_sets_limits_outside_transaction_and_restores_autocommit(
    initial_autocommit, fails
):
    class Connection:
        autocommit = initial_autocommit
        statements = []

        @contextmanager
        def cursor(self):
            yield self

        def execute(self, statement):
            assert self.autocommit is True
            self.statements.append(statement)
            if fails:
                raise RuntimeError("database unavailable")

    connection = Connection()
    if fails:
        with pytest.raises(RuntimeError, match="database unavailable"):
            _restore_postgresql_timeouts(connection, None, None)
    else:
        _restore_postgresql_timeouts(connection, None, None)
    assert connection.autocommit is initial_autocommit
    assert "SET lock_timeout = '5000ms'" in connection.statements[0]
    assert "SET statement_timeout = '30000ms'" in connection.statements[0]
    assert "SET idle_in_transaction_session_timeout = '60000ms'" in connection.statements[0]


def test_sqlite_connection_behavior_is_preserved():
    assert _engine_kwargs_for_url("sqlite://") == {
        "pool_pre_ping": True,
        "connect_args": {"check_same_thread": False},
    }
    engine = create_app_engine("sqlite://")
    try:
        with engine.connect() as connection:
            assert connection.execute(text("SELECT 1")).scalar_one() == 1
    finally:
        engine.dispose()


@pytest.fixture
def postgres_url():
    url = make_url(os.getenv("DATABASE_URL", "sqlite://"))
    if (
        os.getenv("APP_ENV", "").lower() != "test"
        or url.get_backend_name() != "postgresql"
        or url.database != "stock_tests"
    ):
        pytest.skip("Requires APP_ENV=test and disposable PostgreSQL database=stock_tests")
    return url


@pytest.fixture
def postgres_engine(postgres_url):
    engine = create_app_engine(postgres_url.render_as_string(hide_password=False))
    try:
        with engine.connect() as connection:
            assert connection.execute(text("SELECT current_database()")).scalar_one() == "stock_tests"
        yield engine
    finally:
        engine.dispose()


def test_postgresql_reuse_restores_disabled_timeouts_and_preserves_search_path(postgres_url):
    url = postgres_url.update_query_dict(
        {"options": "-csearch_path=pg_catalog,public -cstatement_timeout=0 -clock_timeout=0"}
    )
    engine = create_app_engine(url.render_as_string(hide_password=False))
    try:
        with engine.connect() as connection:
            assert connection.execute(text("SHOW search_path")).scalar_one() == "pg_catalog,public"
            assert connection.execute(text("SHOW lock_timeout")).scalar_one() == "5s"
            assert connection.execute(text("SHOW statement_timeout")).scalar_one() == "30s"
            assert connection.execute(text("SHOW idle_in_transaction_session_timeout")).scalar_one() == "1min"
            pid = connection.execute(text("SELECT pg_backend_pid()")).scalar_one()
            connection.execute(text("SET lock_timeout = 0"))
            connection.execute(text("SET statement_timeout = 0"))
            connection.execute(text("SET idle_in_transaction_session_timeout = 0"))
            connection.commit()
        with engine.connect() as connection:
            assert connection.execute(text("SELECT pg_backend_pid()")).scalar_one() == pid
            assert connection.execute(text("SHOW lock_timeout")).scalar_one() == "5s"
            assert connection.execute(text("SHOW statement_timeout")).scalar_one() == "30s"
            assert connection.execute(text("SHOW idle_in_transaction_session_timeout")).scalar_one() == "1min"
    finally:
        engine.dispose()


def test_postgresql_blocked_lock_fails_and_connection_recovers(postgres_engine):
    lock_key = uuid4().int % (2**63 - 1)
    with postgres_engine.connect() as holder, postgres_engine.connect() as waiter:
        holder.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})
        started = time.monotonic()
        with pytest.raises(OperationalError) as exc:
            waiter.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})
        assert getattr(exc.value.orig, "pgcode", None) == "55P03"
        assert 4 <= time.monotonic() - started < 10
        waiter.rollback()
        assert waiter.execute(text("SELECT 1")).scalar_one() == 1
        holder.rollback()
        waiter.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})


def test_postgresql_slow_statement_is_cancelled_and_connection_recovers(postgres_engine):
    with postgres_engine.connect() as connection:
        connection.execute(text("SET LOCAL statement_timeout = '100ms'"))
        with pytest.raises(OperationalError) as exc:
            connection.execute(text("SELECT pg_sleep(2)"))
        assert getattr(exc.value.orig, "pgcode", None) == "57014"
        connection.rollback()
        assert connection.execute(text("SELECT 1")).scalar_one() == 1


def test_postgresql_idle_transaction_is_terminated_and_pool_recovers(postgres_engine):
    with postgres_engine.connect() as connection:
        connection.execute(text("SET LOCAL idle_in_transaction_session_timeout = '100ms'"))
        connection.execute(text("SELECT 1"))
        time.sleep(0.3)
        with pytest.raises(OperationalError):
            connection.execute(text("SELECT 1"))
    with postgres_engine.connect() as connection:
        assert connection.execute(text("SELECT 1")).scalar_one() == 1


def test_postgresql_pool_exhaustion_is_bounded_and_recovers(postgres_engine):
    connections = [postgres_engine.connect() for _ in range(10)]
    try:
        started = time.monotonic()
        with pytest.raises(PoolTimeoutError):
            postgres_engine.connect()
        assert 4 <= time.monotonic() - started < 10
    finally:
        for connection in connections:
            connection.close()
    with postgres_engine.connect() as connection:
        assert connection.execute(text("SELECT 1")).scalar_one() == 1
