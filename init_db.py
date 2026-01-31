import logging
import os

from sqlalchemy import inspect, text

from app.db import Base, SessionLocal, engine
import app.models
from app.models import Organization, AdminUser, AdminRole, CardBatch
from app.security import get_password_hash
from app.config import settings

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
        # Add password_hash column for members (password-based login)
        _add_column_if_missing(conn, "members", "password_hash", "TEXT")

    db = SessionLocal()

    try:
        # ── Seed organization ──────────────────────────────────────
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

        # ── Seed super admin ───────────────────────────────────────
        sa_email = settings.SUPER_ADMIN_EMAIL
        sa_password = settings.SUPER_ADMIN_PASSWORD
        super_admin = db.query(AdminUser).filter(
            AdminUser.email == sa_email,
            AdminUser.role == AdminRole.SUPER_ADMIN,
        ).first()
        if not super_admin:
            # Check if the email exists as a different role and upgrade
            existing = db.query(AdminUser).filter(AdminUser.email == sa_email).first()
            if existing:
                logger.info("Upgrading existing admin %s to SUPER_ADMIN.", sa_email)
                existing.role = AdminRole.SUPER_ADMIN
                existing.password_hash = get_password_hash(sa_password)
                existing.org_id = None
                existing.is_active = True
                db.commit()
            else:
                logger.info("Creating super admin user (%s)...", sa_email)
                super_admin = AdminUser(
                    email=sa_email,
                    password_hash=get_password_hash(sa_password),
                    role=AdminRole.SUPER_ADMIN,
                    org_id=None,
                    is_active=True,
                )
                db.add(super_admin)
                db.commit()
                logger.info("Super admin created (%s).", sa_email)
        else:
            logger.info("Updating super admin password...")
            super_admin.password_hash = get_password_hash(sa_password)
            db.commit()

        # Also ensure the old admin@example.com is an org admin if it exists
        old_admin = db.query(AdminUser).filter(
            AdminUser.email == "admin@example.com",
            AdminUser.email != sa_email,
        ).first()
        if old_admin and old_admin.role != AdminRole.SUPER_ADMIN:
            old_admin.org_id = old_admin.org_id or org.id
            old_admin.role = AdminRole.ORG_ADMIN
            old_admin_pw = os.getenv("ADMIN_PASSWORD", "admin")
            old_admin.password_hash = get_password_hash(old_admin_pw)
            db.commit()
            logger.info("Legacy admin@example.com kept as ORG_ADMIN.")

        # ── Seed card batch ────────────────────────────────────────
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
