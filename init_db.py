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
from app.models import (
    Organization,
    NumberingScope,
    AdminUser,
    AdminRole,
    OrgAdminSession,
    AffiliationApplication,
    CardBatch,
    EmailOutbox,
    WhatsAppSession,
    WhatsAppConnection,
    WhatsAppChat,
    WhatsAppMessage,
    RechargeRequest,
    OrganizationSharedDocument,
    OrganizationSharedDocumentAssignment,
    AccountingFolder,
    AccountingCategory,
    AccountingDocument,
    AccountingShareLink,
    EmailCampaign,
    EmailCampaignRecipient,
    EmailBuilderAsset,
    EmailTemplate,
    Form,
    FormField,
    FormSubmission,
    Booking,
    BookingEvent,
    Room,
    RoomTable,
    StripeWebhookEvent,
    MembershipPayment,
)
from app.security import get_password_hash
from app.config import settings
from app.services.numbering_scopes import ensure_assonam_central_scope
from app.services.affiliation_identity import sync_affiliation_identity_fields
from app.services.member_cleanup import (
    cleanup_deleted_member_traces,
    purge_deleted_members_permanently,
)
from app.services.email_templates import seed_system_email_templates
from app.services.accounting import (
    backfill_legacy_accounting_documents,
    ensure_accounting_seed_data,
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

    if "email_outbox" not in inspect(engine).get_table_names():
        logger.warning(
            "email_outbox table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        EmailOutbox.__table__.create(bind=engine, checkfirst=True)

    if "whatsapp_sessions" not in inspect(engine).get_table_names():
        logger.warning(
            "whatsapp_sessions table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        WhatsAppSession.__table__.create(bind=engine, checkfirst=True)

    if "whatsapp_connections" not in inspect(engine).get_table_names():
        logger.warning(
            "whatsapp_connections table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        WhatsAppConnection.__table__.create(bind=engine, checkfirst=True)

    if "whatsapp_chats" not in inspect(engine).get_table_names():
        logger.warning(
            "whatsapp_chats table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        WhatsAppChat.__table__.create(bind=engine, checkfirst=True)

    if "whatsapp_messages" not in inspect(engine).get_table_names():
        logger.warning(
            "whatsapp_messages table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        WhatsAppMessage.__table__.create(bind=engine, checkfirst=True)

    if "recharge_requests" not in inspect(engine).get_table_names():
        logger.warning(
            "recharge_requests table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        RechargeRequest.__table__.create(bind=engine, checkfirst=True)

    if "numbering_scopes" not in inspect(engine).get_table_names():
        logger.warning(
            "numbering_scopes table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        NumberingScope.__table__.create(bind=engine, checkfirst=True)

    if "organization_shared_documents" not in inspect(engine).get_table_names():
        logger.warning(
            "organization_shared_documents table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        OrganizationSharedDocument.__table__.create(bind=engine, checkfirst=True)

    if "organization_shared_document_assignments" not in inspect(engine).get_table_names():
        logger.warning(
            "organization_shared_document_assignments table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        OrganizationSharedDocumentAssignment.__table__.create(bind=engine, checkfirst=True)

    if "accounting_folders" not in inspect(engine).get_table_names():
        logger.warning(
            "accounting_folders table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        AccountingFolder.__table__.create(bind=engine, checkfirst=True)

    if "accounting_categories" not in inspect(engine).get_table_names():
        logger.warning(
            "accounting_categories table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        AccountingCategory.__table__.create(bind=engine, checkfirst=True)

    if "accounting_documents" not in inspect(engine).get_table_names():
        logger.warning(
            "accounting_documents table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        AccountingDocument.__table__.create(bind=engine, checkfirst=True)

    if "accounting_share_links" not in inspect(engine).get_table_names():
        logger.warning(
            "accounting_share_links table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        AccountingShareLink.__table__.create(bind=engine, checkfirst=True)

    if "email_campaigns" not in inspect(engine).get_table_names():
        logger.warning(
            "email_campaigns table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        EmailCampaign.__table__.create(bind=engine, checkfirst=True)

    if "email_campaign_recipients" not in inspect(engine).get_table_names():
        logger.warning(
            "email_campaign_recipients table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        EmailCampaignRecipient.__table__.create(bind=engine, checkfirst=True)

    if "email_builder_assets" not in inspect(engine).get_table_names():
        logger.warning(
            "email_builder_assets table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        EmailBuilderAsset.__table__.create(bind=engine, checkfirst=True)

    if "email_templates" not in inspect(engine).get_table_names():
        logger.warning(
            "email_templates table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        EmailTemplate.__table__.create(bind=engine, checkfirst=True)

    if "forms" not in inspect(engine).get_table_names():
        logger.warning(
            "forms table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        Form.__table__.create(bind=engine, checkfirst=True)

    if "form_fields" not in inspect(engine).get_table_names():
        logger.warning(
            "form_fields table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        FormField.__table__.create(bind=engine, checkfirst=True)

    if "form_submissions" not in inspect(engine).get_table_names():
        logger.warning(
            "form_submissions table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        FormSubmission.__table__.create(bind=engine, checkfirst=True)

    if "bookings" not in inspect(engine).get_table_names():
        logger.warning(
            "bookings table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        Booking.__table__.create(bind=engine, checkfirst=True)

    if "booking_events" not in inspect(engine).get_table_names():
        logger.warning(
            "booking_events table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        BookingEvent.__table__.create(bind=engine, checkfirst=True)

    if "rooms" not in inspect(engine).get_table_names():
        logger.warning(
            "rooms table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        Room.__table__.create(bind=engine, checkfirst=True)

    if "room_tables" not in inspect(engine).get_table_names():
        logger.warning(
            "room_tables table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        RoomTable.__table__.create(bind=engine, checkfirst=True)

    if "stripe_webhook_events" not in inspect(engine).get_table_names():
        logger.warning(
            "stripe_webhook_events table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        StripeWebhookEvent.__table__.create(bind=engine, checkfirst=True)

    if "membership_payments" not in inspect(engine).get_table_names():
        logger.warning(
            "membership_payments table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        MembershipPayment.__table__.create(bind=engine, checkfirst=True)

    if "org_admin_sessions" not in inspect(engine).get_table_names():
        logger.warning(
            "org_admin_sessions table not found. Creating it idempotently at startup; "
            "run 'alembic upgrade head' to align schema history."
        )
        OrgAdminSession.__table__.create(bind=engine, checkfirst=True)

    # Legacy column migrations - DEPRECATED, kept for backwards compatibility
    with engine.begin() as conn:
        table_names = set(inspect(conn).get_table_names())
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
        _add_column_if_missing(conn, "members", "membership_type", "TEXT")
        _add_column_if_missing(conn, "members", "valid_from", "DATETIME")
        _add_column_if_missing(conn, "members", "valid_until", "DATETIME")
        _add_column_if_missing(conn, "members", "membership_fee_snapshot", "NUMERIC(10,2)")
        _add_column_if_missing(conn, "members", "member_type", "TEXT")
        _add_column_if_missing(conn, "members", "internal_notes", "TEXT")
        _add_column_if_missing(conn, "members", "is_manual", "INTEGER DEFAULT 0")
        _add_column_if_missing(conn, "members", "payment_method", "TEXT")
        _add_column_if_missing(conn, "members", "payment_required", "INTEGER DEFAULT 0")
        _add_column_if_missing(
            conn, "members", "payment_status", "TEXT DEFAULT 'not_required'"
        )
        _add_column_if_missing(conn, "members", "payment_completed_at", "DATETIME")
        _add_column_if_missing(conn, "members", "birth_date", "DATE")
        _add_column_if_missing(conn, "members", "birth_place", "TEXT")
        _add_column_if_missing(conn, "members", "birth_place_code", "TEXT")
        _add_column_if_missing(conn, "members", "gender", "TEXT")
        _add_column_if_missing(conn, "members", "card_is_paid", "INTEGER DEFAULT 0")
        _add_column_if_missing(conn, "members", "card_paid_at", "DATETIME")
        _add_column_if_missing(conn, "members", "card_payment_status", "TEXT")
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
        _add_column_if_missing(
            conn,
            "members",
            "numbering_scope_id",
            "INTEGER REFERENCES numbering_scopes(id)",
        )
        _add_column_if_missing(conn, "referrals", "wheel_result", "TEXT")
        _add_column_if_missing(conn, "referrals", "wheel_spun_at", "DATETIME")
        _add_column_if_missing(conn, "referrals", "wheel_spun_by_org_admin_id", "INTEGER")
        if "forms" in table_names:
            _add_column_if_missing(conn, "forms", "accent_color", "TEXT")
            _add_column_if_missing(conn, "forms", "submit_button_text", "TEXT")
            _add_column_if_missing(conn, "forms", "show_logo", "INTEGER DEFAULT 1")
            _add_column_if_missing(conn, "forms", "cover_image_url", "TEXT")
            _add_column_if_missing(conn, "forms", "page_style", "TEXT DEFAULT 'editorial'")
            _add_column_if_missing(conn, "forms", "form_type", "TEXT DEFAULT 'generic'")
            _add_column_if_missing(conn, "forms", "booking_enabled", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "forms", "booking_requires_manual_confirmation", "INTEGER DEFAULT 1")
            _add_column_if_missing(conn, "forms", "booking_success_message_override", "TEXT")
            _add_column_if_missing(conn, "forms", "booking_notification_enabled", "INTEGER DEFAULT 1")
            _add_column_if_missing(conn, "forms", "booking_auto_assign_enabled", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "forms", "booking_field_mapping", "TEXT")
            _add_column_if_missing(conn, "forms", "booking_event_date", "DATE")
            _add_column_if_missing(conn, "forms", "booking_event_time", "TEXT")
            _add_column_if_missing(conn, "forms", "booking_event_details", "TEXT")
            _add_column_if_missing(conn, "forms", "survey_post_event_enabled", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "forms", "survey_post_event_delay_hours", "INTEGER DEFAULT 2")
            _add_column_if_missing(conn, "forms", "survey_post_event_message_template", "TEXT")
            _add_column_if_missing(conn, "forms", "notify_admin_on_submit", "INTEGER DEFAULT 1")
            _add_column_if_missing(conn, "forms", "send_user_confirmation", "INTEGER DEFAULT 1")
            _add_column_if_missing(conn, "forms", "whatsapp_auto_reply_enabled", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "forms", "whatsapp_auto_reply_template", "TEXT")
            _add_column_if_missing(conn, "forms", "whatsapp_confirmation_template", "TEXT")
            _add_column_if_missing(conn, "forms", "whatsapp_rejection_template", "TEXT")
            _add_column_if_missing(
                conn,
                "forms",
                "admin_notification_template_id",
                "INTEGER REFERENCES email_templates(id)",
            )
            _add_column_if_missing(
                conn,
                "forms",
                "user_confirmation_template_id",
                "INTEGER REFERENCES email_templates(id)",
            )
            _add_column_if_missing(conn, "forms", "create_internal_request", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "forms", "create_booking", "INTEGER DEFAULT 0")
            conn.execute(
                text(
                    """
                    UPDATE forms
                       SET form_type = CASE
                            WHEN COALESCE(booking_enabled, create_booking, FALSE) THEN 'booking'
                            ELSE COALESCE(NULLIF(trim(form_type), ''), 'generic')
                       END
                     WHERE form_type IS NULL
                        OR trim(form_type) = ''
                    """
                )
            )
            conn.execute(
                text(
                    """
                    UPDATE forms
                       SET booking_enabled = CASE
                            WHEN booking_enabled IS NULL THEN COALESCE(create_booking, FALSE)
                            ELSE booking_enabled
                       END
                     WHERE booking_enabled IS NULL
                    """
                )
            )
        if "form_submissions" in table_names:
            _add_column_if_missing(conn, "form_submissions", "reviewed_at", "DATETIME")
            _add_column_if_missing(conn, "form_submissions", "reviewed_by_admin_id", "INTEGER")
            _add_column_if_missing(conn, "form_submissions", "review_reason", "TEXT")
            conn.execute(
                text(
                    """
                    UPDATE form_submissions
                       SET status = 'pending'
                     WHERE status IS NULL
                        OR trim(status) = ''
                        OR lower(trim(status)) = 'new'
                    """
                )
            )
        if "email_templates" in table_names:
            _add_column_if_missing(conn, "email_templates", "design_json", "TEXT")
            _add_column_if_missing(conn, "email_templates", "linked_form_id", "INTEGER")
            _add_column_if_missing(conn, "email_templates", "template_type", "TEXT DEFAULT 'generic_notice'")
            _add_column_if_missing(conn, "email_templates", "editor_status", "TEXT DEFAULT 'draft'")
            _add_column_if_missing(conn, "email_templates", "grapesjs_project_json", "TEXT")
            _add_column_if_missing(conn, "email_templates", "mjml_source", "TEXT")
            _add_column_if_missing(conn, "email_templates", "compiled_html", "TEXT")
        if "email_campaigns" in table_names:
            _add_column_if_missing(conn, "email_campaigns", "design_json", "TEXT")
            _add_column_if_missing(conn, "email_campaigns", "linked_form_id", "INTEGER")
            _add_column_if_missing(conn, "email_campaigns", "source_template_id", "INTEGER")
            _add_column_if_missing(conn, "email_campaigns", "editor_status", "TEXT DEFAULT 'draft'")
            _add_column_if_missing(conn, "email_campaigns", "grapesjs_project_json", "TEXT")
            _add_column_if_missing(conn, "email_campaigns", "mjml_source", "TEXT")
            _add_column_if_missing(conn, "email_campaigns", "compiled_html", "TEXT")
        if "organizations" in table_names:
            _add_column_if_missing(
                conn, "organizations", "stripe_connected_account_id", "TEXT"
            )
            _add_column_if_missing(
                conn,
                "organizations",
                "stripe_platform_subscription_status",
                "TEXT",
            )
            _add_column_if_missing(
                conn,
                "organizations",
                "stripe_platform_subscription_id",
                "TEXT",
            )
            _add_column_if_missing(conn, "organizations", "payment_provider", "TEXT")
            _add_column_if_missing(
                conn,
                "organizations",
                "payment_required_before_card",
                "INTEGER DEFAULT 0",
            )
            _add_column_if_missing(
                conn, "organizations", "membership_payment_label", "TEXT"
            )
            _add_column_if_missing(
                conn, "organizations", "membership_fee_amount", "NUMERIC(10,2)"
            )
            _add_column_if_missing(
                conn, "organizations", "temporary_membership_fee_amount", "NUMERIC(10,2)"
            )
            _add_column_if_missing(
                conn,
                "organizations",
                "membership_fee_currency",
                "TEXT DEFAULT 'EUR'",
            )
            _add_column_if_missing(
                conn,
                "organizations",
                "custom_membership_types_enabled",
                "INTEGER DEFAULT 0",
            )
            _add_column_if_missing(
                conn,
                "organizations",
                "temporary_membership_duration_value",
                "INTEGER",
            )
            _add_column_if_missing(
                conn,
                "organizations",
                "temporary_membership_duration_unit",
                "TEXT",
            )
            _add_column_if_missing(
                conn,
                "organizations",
                "payment_button_label",
                "TEXT DEFAULT 'Paga con carta'",
            )
            _add_column_if_missing(
                conn, "organizations", "sumup_enabled", "INTEGER DEFAULT 0"
            )
            _add_column_if_missing(
                conn, "organizations", "sumup_api_key_encrypted", "TEXT"
            )
            _add_column_if_missing(conn, "organizations", "sumup_api_key_last4", "TEXT")
            _add_column_if_missing(
                conn, "organizations", "sumup_api_key_configured_at", "DATETIME"
            )
            _add_column_if_missing(
                conn,
                "organizations",
                "booking_whatsapp_reminder_enabled",
                "INTEGER DEFAULT 0",
            )
            _add_column_if_missing(
                conn,
                "organizations",
                "booking_whatsapp_reminder_hours_before",
                "INTEGER DEFAULT 24",
            )
            _add_column_if_missing(
                conn, "organizations", "booking_whatsapp_reminder_template", "TEXT"
            )
        if "bookings" in table_names:
            _add_column_if_missing(conn, "bookings", "room_id", "INTEGER")
            _add_column_if_missing(conn, "bookings", "table_id", "INTEGER")
        if "rooms" in table_names:
            _add_column_if_missing(conn, "rooms", "is_active", "INTEGER DEFAULT 1")
        if "room_tables" in table_names:
            _add_column_if_missing(conn, "room_tables", "capacity", "INTEGER DEFAULT 2")
            _add_column_if_missing(conn, "room_tables", "shape", "TEXT DEFAULT 'round'")
            _add_column_if_missing(conn, "room_tables", "pos_x", "INTEGER DEFAULT 80")
            _add_column_if_missing(conn, "room_tables", "pos_y", "INTEGER DEFAULT 80")
            _add_column_if_missing(conn, "room_tables", "width", "INTEGER")
            _add_column_if_missing(conn, "room_tables", "height", "INTEGER")
            _add_column_if_missing(conn, "room_tables", "is_active", "INTEGER DEFAULT 1")
            _add_column_if_missing(conn, "room_tables", "is_out_of_service", "INTEGER DEFAULT 0")
        if "affiliation_applications" in table_names:
            _add_column_if_missing(
                conn, "affiliation_applications", "normalized_applicant_email", "TEXT"
            )
            _add_column_if_missing(
                conn, "affiliation_applications", "normalized_org_name", "TEXT"
            )
            _add_column_if_missing(
                conn, "affiliation_applications", "idempotency_key", "TEXT"
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
        conn.execute(
            text(
                """
                UPDATE members
                   SET membership_fee_snapshot = (
                       COALESCE(
                           (
                               SELECT mp.amount
                                 FROM membership_payments mp
                                WHERE mp.socio_id = members.id
                                  AND lower(COALESCE(mp.status, '')) IN ('completed', 'manual_completed')
                                ORDER BY COALESCE(mp.confirmed_at, mp.created_at) DESC, mp.id DESC
                                LIMIT 1
                           ),
                           (
                               SELECT CAST(mpay.amount_cents AS NUMERIC) / 100.0
                                 FROM member_payments mpay
                                WHERE mpay.member_id = members.id
                                ORDER BY COALESCE(mpay.paid_at, mpay.created_at) DESC, mpay.id DESC
                                LIMIT 1
                           ),
                           (
                               SELECT org.membership_fee_amount
                                 FROM organizations org
                                WHERE org.id = members.org_id
                           )
                       )
                   )
                 WHERE membership_fee_snapshot IS NULL
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
        _add_column_if_missing(conn, "organizations", "whatsapp_e164", "TEXT")
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
            conn, "organizations", "communications_enabled", "INTEGER DEFAULT 0"
        )
        _add_column_if_missing(
            conn, "organizations", "sender_email_local_part", "VARCHAR"
        )
        _add_column_if_missing(
            conn, "organizations", "email_from_name_override", "VARCHAR"
        )
        _add_column_if_missing(conn, "organizations", "reply_to_email", "VARCHAR")
        _add_column_if_missing(
            conn, "organizations", "wallet_is_test_prefix", "INTEGER DEFAULT 0"
        )
        _add_column_if_missing(
            conn, "organizations", "auto_approve_signup", "INTEGER DEFAULT 0"
        )
        _add_column_if_missing(
            conn, "organizations", "require_membership_document", "INTEGER DEFAULT 0"
        )
        _add_column_if_missing(
            conn, "organizations", "adults_only_banner_enabled", "INTEGER DEFAULT 0"
        )
        _add_column_if_missing(
            conn, "organizations", "accounting_enabled", "INTEGER DEFAULT 0"
        )
        _add_column_if_missing(
            conn, "organizations", "last_low_cards_alert_at", "DATETIME"
        )
        _add_column_if_missing(
            conn,
            "organizations",
            "numbering_scope_id",
            "INTEGER REFERENCES numbering_scopes(id)",
        )
        conn.execute(
            text(
                """
                UPDATE organizations
                   SET communications_enabled = FALSE
                 WHERE communications_enabled IS NULL
                """
            )
        )
        conn.execute(
            text(
                """
                UPDATE organizations
                   SET require_membership_document = FALSE
                 WHERE require_membership_document IS NULL
                """
            )
        )
        conn.execute(
            text(
                """
                UPDATE organizations
                   SET adults_only_banner_enabled = FALSE
                 WHERE adults_only_banner_enabled IS NULL
                """
            )
        )
        conn.execute(
            text(
                """
                UPDATE organizations
                   SET custom_membership_types_enabled = FALSE
                 WHERE custom_membership_types_enabled IS NULL
                """
            )
        )
        conn.execute(
            text(
                """
                UPDATE organizations
                   SET membership_fee_currency = 'EUR'
                 WHERE membership_fee_currency IS NULL
                    OR trim(membership_fee_currency) = ''
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_members_valid_until
                    ON members (valid_until)
                """
            )
        )
        _add_column_if_missing(
            conn,
            "email_campaigns",
            "recipient_mode",
            "VARCHAR(40) DEFAULT 'all_members'",
        )
        _add_column_if_missing(
            conn,
            "email_campaigns",
            "selected_member_ids_json",
            "TEXT",
        )
        conn.execute(
            text(
                """
                UPDATE email_campaigns
                   SET recipient_mode = 'all_members'
                 WHERE recipient_mode IS NULL OR trim(recipient_mode) = ''
                """
            )
        )
        _add_column_if_missing(conn, "card_batches", "year", "INTEGER")
        _add_column_if_missing(
            conn, "card_batches", "is_enabled", "BOOLEAN DEFAULT TRUE"
        )
        _add_column_if_missing(conn, "card_batches", "notes", "TEXT")
        _add_column_if_missing(conn, "card_batches", "released_at", "DATETIME")
        _add_column_if_missing(
            conn,
            "card_batches",
            "numbering_scope_id",
            "INTEGER REFERENCES numbering_scopes(id)",
        )
        _add_column_if_missing(
            conn,
            "recharge_requests",
            "card_batch_id",
            "INTEGER REFERENCES card_batches(id)",
        )
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
        if "affiliation_applications" in table_names:
            conn.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS ix_affiliation_applications_normalized_applicant_email
                        ON affiliation_applications (normalized_applicant_email)
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS ix_affiliation_applications_normalized_org_name
                        ON affiliation_applications (normalized_org_name)
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliation_applications_active_idempotency_key
                        ON affiliation_applications (idempotency_key)
                     WHERE idempotency_key IS NOT NULL
                       AND status IN ('draft', 'changes_requested', 'under_review')
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
        accounting_seed = ensure_accounting_seed_data(db)
        accounting_backfill_count = backfill_legacy_accounting_documents(db)
        if accounting_seed["folders_created"] or accounting_seed["categories_created"] or accounting_backfill_count:
            db.commit()
            logger.info(
                "Accounting bootstrap completed: folders_created=%s categories_created=%s legacy_docs_backfilled=%s.",
                accounting_seed["folders_created"],
                accounting_seed["categories_created"],
                accounting_backfill_count,
            )
        seeded_templates = seed_system_email_templates(db)
        if seeded_templates:
            db.commit()
            logger.info("Seeded %s system email templates.", seeded_templates)
        affiliation_identity_updates = 0
        active_seen_idempotency_keys: set[str] = set()
        applications = (
            db.query(AffiliationApplication)
            .order_by(
                AffiliationApplication.updated_at.desc(),
                AffiliationApplication.created_at.desc(),
                AffiliationApplication.id.desc(),
            )
            .all()
        )
        for application in applications:
            before = (
                application.normalized_applicant_email,
                application.normalized_org_name,
                application.idempotency_key,
            )
            sync_affiliation_identity_fields(application)
            if (
                application.idempotency_key
                and application.status in {"draft", "changes_requested", "under_review"}
            ):
                if application.idempotency_key in active_seen_idempotency_keys:
                    application.idempotency_key = None
                else:
                    active_seen_idempotency_keys.add(application.idempotency_key)
            after = (
                application.normalized_applicant_email,
                application.normalized_org_name,
                application.idempotency_key,
            )
            if before != after:
                affiliation_identity_updates += 1
        if affiliation_identity_updates:
            db.commit()
            logger.info(
                "Backfilled %s affiliation identity rows.",
                affiliation_identity_updates,
            )
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
        central_scope = ensure_assonam_central_scope(db)
        db.commit()
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
                numbering_scope_id=central_scope.id,
            )
            db.add(org)
            db.commit()
            db.refresh(org)
            logger.info("Organization '%s' created with slug '%s'.", org.name, org.slug)
        else:
            if org.numbering_scope_id is None:
                org.numbering_scope_id = central_scope.id
                db.commit()
                db.refresh(org)
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
                numbering_scope_id=org.numbering_scope_id,
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
