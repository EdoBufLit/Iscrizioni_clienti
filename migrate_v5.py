"""Create card_movements table."""

from app.db import engine, Base
import app.models


def migrate():
    print("Migrating database (v5)...")

    # Create any new tables via SQLAlchemy (safe, skips existing)
    Base.metadata.create_all(bind=engine)
    print("New tables created (if missing).")

    print("Migration complete.")


if __name__ == "__main__":
    migrate()
