from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
import sqlalchemy as sa

from app.models import MembershipPayment


REVISION = "79a6d82bc401"
RESERVATION_COLUMNS = {
    "reserved_card_no", "reserved_batch_id", "reserved_card_year",
    "reserved_numbering_scope_id", "reservation_expires_at", "reservation_state",
}


@pytest.fixture
def reservation_schema(tmp_path):
    migration_path = (
        Path(__file__).resolve().parents[1] / "alembic" / "versions"
        / f"{REVISION}_add_membership_card_reservations.py"
    )
    spec = importlib.util.spec_from_file_location("reservation_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'reservations.db'}")
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        for table in ("organizations", "card_batches", "numbering_scopes"):
            conn.exec_driver_sql(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY)")
            conn.exec_driver_sql(f"INSERT INTO {table} (id) VALUES (1), (2)")
        conn.exec_driver_sql(
            "CREATE TABLE membership_payments "
            "(id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, status VARCHAR NOT NULL)"
        )
        conn.exec_driver_sql(
            "INSERT INTO membership_payments (id, org_id, status) VALUES (1, 1, 'completed')"
        )
        conn.commit()
        with Operations.context(MigrationContext.configure(conn)):
            migration.upgrade()
        conn.commit()
        yield conn, migration
    engine.dispose()


def _hold(conn, *, payment_id=2, org_id=1, year=2026, scope_id=None, state="held"):
    conn.execute(sa.text(
        "INSERT INTO membership_payments "
        "(id, org_id, status, reserved_card_no, reserved_card_year, "
        "reserved_numbering_scope_id, reservation_state, reservation_expires_at) "
        "VALUES (:id, :org, 'pending', 100, :year, :scope, :state, '2000-01-01')"
    ), {"id": payment_id, "org": org_id, "year": year, "scope": scope_id, "state": state})


def test_upgrade_preserves_legacy_payments_and_matches_model(reservation_schema):
    conn, migration = reservation_schema
    assert migration.down_revision == "b3c4d5e6f7a8"
    assert conn.execute(sa.text(
        "SELECT status, reservation_state, reserved_card_no FROM membership_payments WHERE id=1"
    )).one() == ("completed", None, None)
    inspector = sa.inspect(conn)
    actual_columns = {column["name"] for column in inspector.get_columns("membership_payments")}
    assert RESERVATION_COLUMNS <= actual_columns
    assert RESERVATION_COLUMNS <= set(MembershipPayment.__table__.columns.keys())
    expected_indexes = {
        index.name for index in MembershipPayment.__table__.indexes
        if "held_" in index.name or "reservation_reconcile" in index.name
    }
    assert expected_indexes == {
        index["name"] for index in inspector.get_indexes("membership_payments")
    }


def test_held_org_number_cannot_be_reused_even_after_expiry_or_in_other_year(reservation_schema):
    conn, _ = reservation_schema
    _hold(conn)
    with pytest.raises(sa.exc.IntegrityError):
        _hold(conn, payment_id=3, year=2027)
    conn.execute(sa.text("UPDATE membership_payments SET reservation_state='released' WHERE id=2"))
    _hold(conn, payment_id=3, year=2027)


def test_shared_scope_number_cannot_be_reserved_by_another_org(reservation_schema):
    conn, _ = reservation_schema
    _hold(conn, scope_id=1)
    with pytest.raises(sa.exc.IntegrityError):
        _hold(conn, payment_id=3, org_id=2, year=2027, scope_id=1)
    _hold(conn, payment_id=3, org_id=2, scope_id=2)


@pytest.mark.parametrize("state", ["released", "consumed"])
def test_finished_reservations_remain_auditable_without_blocking_index(reservation_schema, state):
    conn, _ = reservation_schema
    _hold(conn, scope_id=1, state=state)
    _hold(conn, payment_id=3, scope_id=1)
    assert conn.execute(sa.text("SELECT COUNT(*) FROM membership_payments")).scalar() == 3


@pytest.mark.parametrize(
    "values", ["'held', NULL, 2026", "'held', 100, NULL", "'bogus', 100, 2026"]
)
def test_schema_rejects_invalid_reservation_state_or_incomplete_hold(reservation_schema, values):
    conn, _ = reservation_schema
    with pytest.raises(sa.exc.IntegrityError):
        conn.exec_driver_sql(
            "INSERT INTO membership_payments "
            "(id, org_id, status, reservation_state, reserved_card_no, reserved_card_year) "
            f"VALUES (2, 1, 'pending', {values})"
        )


def test_deleted_batch_and_scope_preserve_reserved_number_for_reconciliation(reservation_schema):
    conn, _ = reservation_schema
    _hold(conn, scope_id=1)
    conn.exec_driver_sql("UPDATE membership_payments SET reserved_batch_id=1 WHERE id=2")
    conn.exec_driver_sql("DELETE FROM card_batches WHERE id=1")
    conn.exec_driver_sql("DELETE FROM numbering_scopes WHERE id=1")
    assert conn.exec_driver_sql(
        "SELECT reserved_card_no, reserved_batch_id, reserved_numbering_scope_id, "
        "reservation_state FROM membership_payments WHERE id=2"
    ).one() == (100, None, None, "held")


def test_downgrade_refuses_held_cards_then_preserves_existing_payments(reservation_schema):
    conn, migration = reservation_schema
    _hold(conn)
    with Operations.context(MigrationContext.configure(conn)):
        with pytest.raises(RuntimeError, match="Reconcile all held"):
            migration.downgrade()
    conn.exec_driver_sql("UPDATE membership_payments SET reservation_state='released' WHERE id=2")
    with Operations.context(MigrationContext.configure(conn)):
        migration.downgrade()
    assert not RESERVATION_COLUMNS.intersection({
        column["name"] for column in sa.inspect(conn).get_columns("membership_payments")
    })
    assert conn.exec_driver_sql("SELECT id, status FROM membership_payments ORDER BY id").all() == [
        (1, "completed"), (2, "pending"),
    ]
