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
from datetime import datetime

from sqlalchemy import inspect, text

from app.db import Base, SessionLocal, engine
import app.models
from app.models import Organization, AdminUser, AdminRole, CardBatch
from app.security import get_password_hash
from app.config import settings
from app.services.member_cleanup import (
    cleanup_deleted_member_traces,
    purge_deleted_members_permanently,
)

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


def _column_type_name(conn, table: str, column: str) -> str:
    try:
        columns = inspect(conn).get_columns(table)
    except Exception:
        return ""
    for col in columns:
        if col["name"] == column:
            return type(col["type"]).__name__.lower()
    return ""


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
        if (
            "organizations" in existing_tables
            and "alembic_version" not in existing_tables
        ):
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
        _add_column_if_missing(
            conn, "card_movements", "admin_id", "INTEGER REFERENCES admin_users(id)"
        )
        _add_column_if_missing(conn, "card_movements", "paid_ref", "TEXT")
        # Add password_hash column for members (password-based login)
        _add_column_if_missing(conn, "members", "password_hash", "TEXT")
        # Add decision / soft-delete columns for members
        _add_column_if_missing(conn, "members", "decision_at", "DATETIME")
        _add_column_if_missing(
            conn,
            "members",
            "decision_by_admin_id",
            "INTEGER REFERENCES admin_users(id)",
        )
        _add_column_if_missing(conn, "members", "decision_notes", "TEXT")
        _add_column_if_missing(conn, "members", "expired_at", "DATETIME")
        _add_column_if_missing(conn, "members", "purged_at", "DATETIME")
        _add_column_if_missing(conn, "members", "deleted_at", "DATETIME")
        _add_column_if_missing(
            conn, "members", "deleted_by_admin_id", "INTEGER REFERENCES admin_users(id)"
        )
        _add_column_if_missing(conn, "members", "card_year", "INTEGER")
        _add_column_if_missing(conn, "members", "member_type", "TEXT")
        _add_column_if_missing(conn, "members", "internal_notes", "TEXT")
        _add_column_if_missing(conn, "members", "is_manual", "INTEGER DEFAULT 0")
        _add_column_if_missing(conn, "members", "payment_method", "TEXT")
        _add_column_if_missing(conn, "members", "birth_date", "DATE")
        _add_column_if_missing(conn, "members", "birth_place", "TEXT")
        _add_column_if_missing(conn, "members", "birth_place_code", "TEXT")
        _add_column_if_missing(conn, "members", "gender", "TEXT")
        _add_column_if_missing(conn, "members", "signup_source", "TEXT")
        _add_column_if_missing(conn, "members", "external_customer_id", "TEXT")
        _add_column_if_missing(conn, "members", "card_email_sent_at", "DATETIME")
        _add_column_if_missing(conn, "members", "card_delivered_at", "DATETIME")
        _add_column_if_missing(conn, "members", "google_wallet_class_id", "TEXT")
        _add_column_if_missing(conn, "members", "google_wallet_object_id", "TEXT")
        _add_column_if_missing(conn, "members", "google_wallet_added_at", "DATETIME")
        _add_column_if_missing(conn, "members", "google_wallet_last_error", "TEXT")
        _add_column_if_missing(
            conn, "members", "google_wallet_last_synced_at", "DATETIME"
        )
        conn.execute(
            text(
                """
                UPDATE members
                   SET card_delivered_at = card_email_sent_at
                 WHERE card_delivered_at IS NULL
                   AND card_email_sent_at IS NOT NULL
                """
            )
        )
        conn.execute(
            text(
                """
                UPDATE members
                   SET signup_source = 'pienissimo'
                 WHERE signup_source IS NOT NULL
                   AND lower(trim(signup_source)) IN ('pienissimo', 'pienissimo_api')
                """
            )
        )
        conn.execute(
            text(
                """
                UPDATE members
                   SET signup_source = 'assonam_form'
                 WHERE signup_source IS NULL
                    OR trim(signup_source) = ''
                """
            )
        )
        _add_column_if_missing(conn, "member_documents", "rejection_note", "TEXT")
        _add_column_if_missing(
            conn,
            "member_documents",
            "reviewed_by_admin_id",
            "INTEGER REFERENCES admin_users(id)",
        )
        _add_column_if_missing(
            conn,
            "member_documents",
            "replaces_document_id",
            "INTEGER REFERENCES member_documents(id)",
        )
        _add_column_if_missing(
            conn, "operation_logs", "actor_member_id", "INTEGER REFERENCES members(id)"
        )
        _add_column_if_missing(conn, "organizations", "deleted_at", "DATETIME")
        # Card-branding fields: keep startup resilient even if alembic wasn't run yet.
        _add_column_if_missing(conn, "organizations", "club_display_name", "VARCHAR")
        _add_column_if_missing(conn, "organizations", "card_email_subject", "VARCHAR")
        _add_column_if_missing(conn, "organizations", "card_logo_url", "VARCHAR")
        _add_column_if_missing(conn, "organizations", "wallet_bg_color", "VARCHAR")
        _add_column_if_missing(conn, "organizations", "wallet_logo_url", "TEXT")
        _add_column_if_missing(conn, "organizations", "wallet_hero_image_url", "TEXT")
        _add_column_if_missing(
            conn, "organizations", "wallet_title_override", "VARCHAR"
        )
        _add_column_if_missing(
            conn, "organizations", "wallet_is_test_prefix", "INTEGER DEFAULT 0"
        )
        _add_column_if_missing(
            conn, "organizations", "auto_approve_signup", "INTEGER DEFAULT 0"
        )
        _add_column_if_missing(conn, "card_batches", "year", "INTEGER")
        _add_column_if_missing(
            conn, "card_batches", "is_enabled", "BOOLEAN DEFAULT TRUE"
        )
        _add_column_if_missing(conn, "card_batches", "notes", "TEXT")
        _add_column_if_missing(conn, "card_batches", "released_at", "DATETIME")
        conn.execute(
            text(
                """
                UPDATE card_batches
                   SET year = :current_year
                 WHERE year IS NULL
                """
            ),
            {"current_year": datetime.utcnow().year},
        )
        is_enabled_type = _column_type_name(conn, "card_batches", "is_enabled")
        if "bool" in is_enabled_type:
            conn.execute(
                text(
                    """
                    UPDATE card_batches
                       SET is_enabled = TRUE
                     WHERE is_enabled IS NULL
                    """
                )
            )
        else:
            conn.execute(
                text(
                    """
                    UPDATE card_batches
                       SET is_enabled = 1
                     WHERE is_enabled IS NULL
                    """
                )
            )
        # Ingest idempotency safety index (active member per org/year/email).
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_members_org_year_lower_email_active
                    ON members (org_id, card_year, lower(email))
                 WHERE deleted_at IS NULL
                   AND email IS NOT NULL
                   AND card_year IS NOT NULL
                """
            )
        )
        # Keep oasi-2 naming aligned with current customer-facing branding.
        conn.execute(
            text(
                """
                UPDATE organizations
                   SET club_display_name = :club_display_name
                 WHERE lower(trim(slug)) = 'oasi-2'
                   AND (
                        club_display_name IS NULL
                        OR trim(club_display_name) = ''
                        OR lower(trim(club_display_name)) IN (
                            lower(:old_name),
                            lower(:club_display_name)
                        )
                   )
                """
            ),
            {
                "club_display_name": "Golden Age Club - Speakeasy",
                "old_name": "Golden Age - Speakeasy",
            },
        )
        # Wallet branding defaults for Golden Age (oasi-2); safe no-op when already customized.
        conn.execute(
            text(
                """
                UPDATE organizations
                   SET wallet_bg_color = COALESCE(NULLIF(trim(wallet_bg_color), ''), :wallet_bg_color),
                       wallet_logo_url = COALESCE(NULLIF(trim(wallet_logo_url), ''), :wallet_logo_url),
                       wallet_hero_image_url = COALESCE(NULLIF(trim(wallet_hero_image_url), ''), :wallet_hero_image_url),
                       wallet_title_override = COALESCE(NULLIF(trim(wallet_title_override), ''), :wallet_title_override),
                       wallet_is_test_prefix = COALESCE(wallet_is_test_prefix, FALSE)
                 WHERE lower(trim(slug)) = 'oasi-2'
                """
            ),
            {
                "wallet_bg_color": "#0B3C75",
                "wallet_logo_url": "/static/card-logos/oasi-2.png",
                "wallet_hero_image_url": "/static/wallet-heroes/oasi-2-hero.png",
                "wallet_title_override": "Golden Age Club - Speakeasy",
            },
        )

    db = SessionLocal()

    try:
        cleaned_deleted_members = cleanup_deleted_member_traces(db)
        if cleaned_deleted_members:
            db.commit()
            logger.info(
                "Sanitized %s soft-deleted member rows with legacy identifiers.",
                cleaned_deleted_members,
            )
        purged_deleted_members = purge_deleted_members_permanently(db)
        if purged_deleted_members:
            db.commit()
            logger.info(
                "Hard-purged %s soft-deleted member rows and dependencies.",
                purged_deleted_members,
            )
        # ── Seed organization ──────────────────────────────────────
        org = (
            db.query(Organization).filter(Organization.slug == "my-association").first()
        )
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
                is_active=True,
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
        old_admin = (
            db.query(AdminUser)
            .filter(
                AdminUser.email == "admin@example.com",
                AdminUser.email != sa_email,
            )
            .first()
        )
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
                year=datetime.utcnow().year,
                start_no=100,
                end_no=200,
                next_no=100,
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
