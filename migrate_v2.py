from app.db import engine, Base
# Import models so Base knows about them
import app.models
import sqlite3
import os

DB_FILE = "data/app.db"

def migrate():
    print("Migrating database...")

    # 1. Create new tables via SQLAlchemy (safe, skips existing)
    Base.metadata.create_all(bind=engine)
    print("New tables created (if missing).")

    # 2. Add columns to existing tables using raw SQL
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # Check members table columns
    cursor.execute("PRAGMA table_info(members)")
    columns = [info[1] for info in cursor.fetchall()]

    if "card_no" not in columns:
        print("Adding card_no to members...")
        cursor.execute("ALTER TABLE members ADD COLUMN card_no INTEGER")

    if "batch_id" not in columns:
        print("Adding batch_id to members...")
        cursor.execute("ALTER TABLE members ADD COLUMN batch_id INTEGER REFERENCES card_batches(id)")

    # Check member_documents table columns
    cursor.execute("PRAGMA table_info(member_documents)")
    doc_columns = [info[1] for info in cursor.fetchall()]

    if "status" not in doc_columns:
        print("Adding status to member_documents...")
        # SQLite doesn't strictly enforce ENUMs in DDL, usually TEXT.
        cursor.execute("ALTER TABLE member_documents ADD COLUMN status VARCHAR DEFAULT 'uploaded'")

    if "review_notes" not in doc_columns:
        print("Adding review_notes to member_documents...")
        cursor.execute("ALTER TABLE member_documents ADD COLUMN review_notes VARCHAR")

    if "reviewed_at" not in doc_columns:
        print("Adding reviewed_at to member_documents...")
        cursor.execute("ALTER TABLE member_documents ADD COLUMN reviewed_at DATETIME")

    if "reviewed_by" not in doc_columns:
        print("Adding reviewed_by to member_documents...")
        cursor.execute("ALTER TABLE member_documents ADD COLUMN reviewed_by INTEGER REFERENCES admin_users(id)")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
