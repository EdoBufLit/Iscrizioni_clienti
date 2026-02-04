"""
DEPRECATED: Use Alembic migrations instead.

This script is kept for legacy compatibility but should NOT be used in production.
Schema changes should be managed exclusively via Alembic.

For production deployment:
    alembic upgrade head

For development (new database):
    # Option 1: Use Alembic (recommended)
    alembic upgrade head

    # Option 2: Use init_db (will auto-stamp alembic)
    python init_db.py
"""
import sys
from app.db import engine, Base
from app.models import Organization, Member, MemberDocument, Token

def create_tables():
    print("WARNING: create_tables.py is DEPRECATED!")
    print("Use 'alembic upgrade head' instead for schema management.")
    print()

    response = input("Are you sure you want to continue? (yes/no): ")
    if response.lower() != "yes":
        print("Aborted.")
        sys.exit(1)

    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    print("Tables created.")
    print()
    print("IMPORTANT: Run 'alembic stamp head' to sync Alembic version.")

if __name__ == "__main__":
    create_tables()
