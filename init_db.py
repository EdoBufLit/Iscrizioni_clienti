"""
Database initialization module.

IMPORTANT: In production, schema should be managed ONLY by Alembic migrations.
Set SKIP_CREATE_ALL=1 in production to disable automatic table creation.

Deployment checklist:
1. Set SKIP_CREATE_ALL=1 (or any truthy value)
2. Run: alembic upgrade head
3. Start the application
"""
import logging
import os

from sqlalchemy import inspect, text

from app.db import Base, SessionLocal, engine
import app.models
from app.models import Organization, AdminUser, AdminRole, CardBatch
from app.security import get_password_hash
from app.config import settings

logger = logging.getLogger(__name__)

# Environment flag to skip create_all() in production
# Set SKIP_CREATE_ALL=1 in production environments
SKIP_CREATE_ALL = os.getenv("SKIP_CREATE_ALL", "").lower() in ("1", "true", "yes")


def _add_column_if_missing(conn, table: str, column: str, col_type: str):
    """Add a column to an existing SQLite table if it doesn't exist yet.

    DEPRECATED: Use Alembic migrations instead.
    """
    cols = {c["name"] for c in inspect(conn).get_columns(table)}
    if column not in cols:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
        logger.info("Added column %s.%s", table, column)


def init_db():
    """Initialize database schema and seed data.

    In production (SKIP_CREATE_ALL=1), this only runs Alembic migrations.
    In development, it also uses create_all() for convenience.
    """
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    if SKIP_CREATE_ALL:
        # Production mode: schema managed by Alembic only
        logger.info("SKIP_CREATE_ALL is set - skipping Base.metadata.create_all()")
        logger.info("Ensure you have run: alembic upgrade head")

        # Verify alembic_version table exists (migrations have been run)
        if "alembic_version" not in existing_tables:
            logger.warning(
                "WARNING: alembic_version table not found! "
                "Run 'alembic upgrade head' before starting the application."
            )
    else:
        # Development mode: use create_all for convenience
        logger.info("Running Base.metadata.create_all() (dev mode)")
        logger.info("Set SKIP_CREATE_ALL=1 in production to disable this.")
        Base.metadata.create_all(bind=engine)

        # If this is a fresh install (tables created but no alembic version), stamp it
        if "organizations" in existing_tables and "alembic_version" not in existing_tables:
            logger.info("Fresh database detected. Stamping alembic head...")
            from alembic.config import Config
            from alembic import command
            alembic_cfg = Config("alembic.ini")
            try:
                command.stamp(alembic_cfg, "head")
            except Exception:
                logger.exception("Failed to stamp alembic head.")

    # Legacy column migrations - DEPRECATED, kept for backwards compatibility
    with engine.begin() as conn:
        _add_column_if_missing(conn, "card_movements", "admin_id", "INTEGER REFERENCES admin_users(id)")
        _add_column_if_missing(conn, "card_movements", "paid_ref", "TEXT")
        # Add password_hash column for members (password-based login)
        _add_column_if_missing(conn, "members", "password_hash", "TEXT")
        # Add decision / soft-delete columns for members
        _add_column_if_missing(conn, "members", "decision_at", "DATETIME")
        _add_column_if_missing(conn, "members", "decision_by_admin_id", "INTEGER REFERENCES admin_users(id)")
        _add_column_if_missing(conn, "members", "decision_notes", "TEXT")
        _add_column_if_missing(conn, "members", "deleted_at", "DATETIME")
        _add_column_if_missing(conn, "members", "deleted_by_admin_id", "INTEGER REFERENCES admin_users(id)")
        _add_column_if_missing(conn, "members", "card_year", "INTEGER")
        _add_column_if_missing(conn, "members", "member_type", "TEXT")
        _add_column_if_missing(conn, "members", "internal_notes", "TEXT")
        _add_column_if_missing(conn, "members", "is_manual", "INTEGER DEFAULT 0")
        _add_column_if_missing(conn, "members", "payment_method", "TEXT")
        _add_column_if_missing(conn, "members", "signup_source", "TEXT")
        _add_column_if_missing(conn, "members", "external_customer_id", "TEXT")
        _add_column_if_missing(conn, "members", "card_email_sent_at", "DATETIME")
        _add_column_if_missing(conn, "member_documents", "rejection_note", "TEXT")
        _add_column_if_missing(conn, "member_documents", "reviewed_by_admin_id", "INTEGER REFERENCES admin_users(id)")
        _add_column_if_missing(conn, "member_documents", "replaces_document_id", "INTEGER REFERENCES member_documents(id)")
        _add_column_if_missing(conn, "operation_logs", "actor_member_id", "INTEGER REFERENCES members(id)")
        _add_column_if_missing(conn, "organizations", "deleted_at", "DATETIME")
        _add_column_if_missing(conn, "card_batches", "released_at", "DATETIME")

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
                privacy_version="v2.023",
                city="Roma",
                country="Italy",
                description="Associazione di prova",
                is_active=True
            )
            db.add(org)
            db.commit()
            db.refresh(org)
            logger.info("Organization '%s' created with slug '%s'.", org.name, org.slug)
        else:
            logger.info("Organization already exists.")

        # ── Seed super admin (Removed in favor of app/bootstrap.py) ─

        # Also ensure the old admin@example.com is an org admin if it exists
        sa_email = settings.SUPER_ADMIN_EMAIL
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
