import logging
import os

from sqlalchemy import inspect, text

from app.db import Base, SessionLocal, engine
import app.models
from app.models import Organization, AdminUser, AdminRole, CardBatch
from app.security import get_password_hash

logger = logging.getLogger(__name__)


def _add_column_if_missing(conn, table: str, column: str, col_type: str):
    """Add a column to an existing SQLite table if it doesn't exist yet."""
    cols = {c["name"] for c in inspect(conn).get_columns(table)}
    if column not in cols:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
        logger.info("Added column %s.%s", table, column)


def init_db():
    Base.metadata.create_all(bind=engine)

    # Migrate existing tables — add nullable columns that create_all won't add
    with engine.begin() as conn:
        _add_column_if_missing(conn, "card_movements", "admin_id", "INTEGER REFERENCES admin_users(id)")
        _add_column_if_missing(conn, "card_movements", "paid_ref", "TEXT")
    db = SessionLocal()
    admin_password = os.getenv("ADMIN_PASSWORD", "admin")

    try:
        # Check if org exists
        org = db.query(Organization).filter(Organization.slug == "my-association").first()
        if not org:
            logger.info("Creating seed organization...")
            org = Organization(
                name="My Awesome Association",
                slug="my-association",
                statute_version="v1.0",
                privacy_version="v2.023"
            )
            db.add(org)
            db.commit()
            db.refresh(org)
            logger.info("Organization '%s' created with slug '%s'.", org.name, org.slug)
        else:
            logger.info("Organization already exists.")

        # Check if admin exists
        admin = db.query(AdminUser).filter(AdminUser.email == "admin@example.com").first()
        if not admin:
            logger.info("Creating admin user...")
            admin = AdminUser(
                email="admin@example.com",
                password_hash=get_password_hash(admin_password),
                role=AdminRole.ORG_ADMIN,
                org_id=org.id,
                is_active=True,
            )
            db.add(admin)
            db.commit()
            logger.info("Admin user created (admin@example.com).")
        else:
            logger.info("Updating admin user password...")
            admin.password_hash = get_password_hash(admin_password)
            db.commit()

        # Check if batch exists
        batch = db.query(CardBatch).filter(CardBatch.org_id == org.id).first()
        if not batch:
            logger.info("Creating seed card batch...")
            batch = CardBatch(
                org_id=org.id,
                start_no=100,
                end_no=200,
                next_no=100
            )
            db.add(batch)
            db.commit()
            logger.info("Card batch created (100-200).")
        else:
            logger.info("Card batch already exists.")
    except Exception:
        logger.exception("Database seed failed.")
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
