from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_visibility_migration_hides_legacy_forms_and_is_idempotent(monkeypatch):
    path = Path(__file__).resolve().parents[1] / "alembic/versions/20261105_01_member_booking_visibility.py"
    spec = spec_from_file_location("member_booking_visibility", path)
    migration = module_from_spec(spec); spec.loader.exec_module(migration)
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE forms(id INTEGER PRIMARY KEY, title TEXT)")
        connection.exec_driver_sql("INSERT INTO forms(id,title) VALUES(1,'Legacy')")
        monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(connection)))
        migration.upgrade(); migration.upgrade()
        assert connection.execute(text("SELECT member_booking_visibility,member_booking_visible_until FROM forms")).one() == ("hidden", None)
        connection.exec_driver_sql("UPDATE forms SET member_booking_visibility='permanent'")
        migration.upgrade()
        assert connection.execute(text("SELECT member_booking_visibility FROM forms")).scalar_one() == "permanent"
        migration.downgrade()
        assert {column["name"] for column in inspect(connection).get_columns("forms")} == {"id", "title"}
        assert connection.execute(text("SELECT title FROM forms")).scalar_one() == "Legacy"
    engine.dispose()
