"""Add is_active column to admin_users table."""

from app.db import engine, Base
import app.models
import sqlite3

DB_FILE = "data/app.db"


def migrate():
    print("Migrating database (v4)...")

    # 1. Create any new tables via SQLAlchemy (safe, skips existing)
    Base.metadata.create_all(bind=engine)
    print("New tables created (if missing).")

    # 2. Add is_active column to admin_users
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    cursor.execute("PRAGMA table_info(admin_users)")
    columns = [info[1] for info in cursor.fetchall()]

    if "is_active" not in columns:
        print("Adding is_active to admin_users...")
        cursor.execute(
            "ALTER TABLE admin_users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1"
        )
        conn.commit()
        print("Column is_active added.")
    else:
        print("Column is_active already exists.")

    conn.close()
    print("Migration complete.")


if __name__ == "__main__":
    migrate()
