"""Accounting backfill preserves orders and recorded payments, even on replay."""

import importlib.util
from datetime import datetime
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
import sqlalchemy as sa


@pytest.fixture
def migration_db(tmp_path):
    path = Path(__file__).resolve().parents[1] / "alembic/versions/9d5e7a31c802_unify_whatsapp_card_credits.py"
    spec = importlib.util.spec_from_file_location("whatsapp_credits_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'credits.db'}")
    metadata = sa.MetaData()
    requests = sa.Table(
        "recharge_requests", metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("source", sa.String, nullable=False),
        sa.Column("billing_status", sa.String, nullable=False),
        sa.Column("requested_cards", sa.Integer, nullable=False),
        sa.Column("unit_price_cents", sa.Integer, nullable=False),
        sa.Column("amount_due_cents", sa.Integer, nullable=False),
        sa.Column("card_batch_id", sa.Integer),
        sa.Column("paid_at", sa.DateTime),
        sa.Column("paid_by_admin_id", sa.Integer),
        sa.Column("payment_reference", sa.String),
        sa.Column("accounting_note", sa.Text),
        sa.Column("accounting_updated_at", sa.DateTime),
        sa.Column("updated_at", sa.DateTime),
        sa.Column("created_at", sa.DateTime),
        sa.CheckConstraint("amount_due_cents = requested_cards * unit_price_cents"),
        sa.CheckConstraint("unit_price_cents = 100"),
    )
    events = sa.Table(
        "recharge_request_accounting_events", metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("recharge_request_id", sa.Integer, sa.ForeignKey("recharge_requests.id"), nullable=False),
        sa.Column("actor_admin_id", sa.Integer),
        sa.Column("previous_status", sa.String, nullable=False),
        sa.Column("new_status", sa.String, nullable=False),
        sa.Column("changes_json", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    with engine.begin() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        metadata.create_all(connection)
        for request_id, source, status in [
            (1, "whatsapp", "not_applicable"),
            (2, "whatsapp", "not_applicable"),
            (3, "whatsapp", "paid"),
            (4, "whatsapp", "unpaid"),
            (5, "org_admin_portal", "paid"),
            (6, "legacy_import", "not_applicable"),
        ]:
            paid = status == "paid"
            connection.execute(requests.insert().values(
                id=request_id, source=source, billing_status=status,
                requested_cards=250, unit_price_cents=100, amount_due_cents=25000,
                card_batch_id=None if request_id == 2 else request_id * 10,
                paid_at=datetime(2026, 9, 1) if paid else None,
                paid_by_admin_id=99 if paid else None,
                payment_reference=f"BON-{request_id}" if paid else None,
                accounting_note=f"Nota {request_id}",
                created_at=datetime(2026, 8, 1), updated_at=datetime(2026, 8, 2),
            ))
        yield connection, migration, requests, events
    engine.dispose()


def run_upgrade(connection, migration):
    with Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()


def test_backfill_includes_pending_orders_and_preserves_amounts_payments_and_notes(migration_db):
    connection, migration, requests, events = migration_db
    before = {row.id: dict(row._mapping) for row in connection.execute(sa.select(requests))}
    run_upgrade(connection, migration)
    after = {row.id: dict(row._mapping) for row in connection.execute(sa.select(requests))}
    assert migration.down_revision == "8c4d9e21f603"
    assert after[1]["billing_status"] == after[2]["billing_status"] == "unpaid"
    for request_id in (1, 2):
        expected = {**before[request_id], "billing_status": "unpaid"}
        actual = dict(after[request_id])
        assert actual.pop("accounting_updated_at") is not None
        assert actual.pop("updated_at") >= datetime(2026, 9, 12)
        expected.pop("accounting_updated_at")
        expected.pop("updated_at")
        assert actual == expected
    for request_id in (3, 4, 5, 6):
        assert after[request_id] == before[request_id]
    history = connection.execute(sa.select(events).order_by(events.c.id)).mappings().all()
    assert len(history) == 2
    assert {row["recharge_request_id"] for row in history} == {1, 2}
    for event in history:
        assert event["actor_admin_id"] is None
        assert (event["previous_status"], event["new_status"]) == ("not_applicable", "unpaid")
        assert event["changes_json"]["migration"] == migration.revision
        assert event["changes_json"]["amount_due_cents"] == 25000
        assert event["changes_json"]["before"]["billing_status"] == "not_applicable"
        assert event["changes_json"]["after"]["billing_status"] == "unpaid"
    assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []


def test_replay_and_downgrade_do_not_erase_later_payments_or_duplicate_history(migration_db):
    connection, migration, requests, events = migration_db
    run_upgrade(connection, migration)
    connection.execute(requests.update().where(requests.c.id == 1).values(
        billing_status="paid", paid_at=datetime(2026, 9, 12),
        paid_by_admin_id=99, payment_reference="BON-after-migration",
    ))
    before = connection.execute(sa.select(requests).order_by(requests.c.id)).all()
    run_upgrade(connection, migration)
    with Operations.context(MigrationContext.configure(connection)):
        migration.downgrade()
    run_upgrade(connection, migration)
    assert connection.execute(sa.select(requests).order_by(requests.c.id)).all() == before
    assert connection.scalar(sa.select(sa.func.count()).select_from(events)) == 2


def test_replay_converts_order_created_by_old_worker_during_rollout(migration_db):
    connection, migration, requests, events = migration_db
    run_upgrade(connection, migration)
    connection.execute(requests.insert().values(
        id=7, source="whatsapp", billing_status="not_applicable",
        requested_cards=10, unit_price_cents=100, amount_due_cents=1000,
    ))
    run_upgrade(connection, migration)
    assert connection.scalar(sa.select(requests.c.billing_status).where(requests.c.id == 7)) == "unpaid"
    assert connection.scalar(sa.select(sa.func.count()).select_from(events)) == 3
