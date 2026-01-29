from app.db import engine, Base
import sqlite3
import os

DB_FILE = "data/app.db"

def migrate():
    print("Migrating database (v3)...")

    # 1. Create new tables via SQLAlchemy
    Base.metadata.create_all(bind=engine)

    # 2. No schema changes for MemberStatus (SQLite stores as VARCHAR),
    # so we don't need ALTER TABLE for the enum value itself.
    # The application logic will just start using the new value.

    print("Migration complete.")

if __name__ == "__main__":
    migrate()
