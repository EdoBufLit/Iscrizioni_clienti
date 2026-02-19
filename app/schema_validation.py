import logging
from sqlalchemy import inspect
from app.db import SQLALCHEMY_DATABASE_URL

logger = logging.getLogger(__name__)

REQUIRED_ORG_COLUMNS = {
    "is_active",
    "address_line1",
    "statute_updated_at",
    "country",
    "city",
    "created_at",
    "updated_at",
    "email",
    "phone",
    "club_display_name",
    "card_email_subject",
    "card_logo_url",
}

def validate_schema(engine):
    """
    Validates that the SQLite database schema matches expectations.
    Specifically checks for columns in the 'organizations' table that caused recent issues.
    """
    # Only run for SQLite
    if "sqlite" not in SQLALCHEMY_DATABASE_URL:
        return

    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    if "organizations" not in existing_tables:
        # If the table is missing, init_db probably hasn't run or failed.
        # But validate_schema is called AFTER init_db.
        logger.warning("Table 'organizations' missing in SQLite DB. Startup validation incomplete.")
        return

    columns = {col["name"] for col in inspector.get_columns("organizations")}
    missing = REQUIRED_ORG_COLUMNS - columns

    if missing:
        msg = (
            f"CRITICAL: SQLite schema drift detected. "
            f"Missing columns in 'organizations': {missing}. "
            "Please run 'alembic upgrade head' to fix the database schema."
        )
        logger.error(msg)
        raise RuntimeError(msg)

    logger.info("Schema validation passed: 'organizations' table has required columns.")
