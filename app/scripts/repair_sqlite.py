import sqlite3
import os
import sys

def get_db_path():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url or not db_url.startswith("sqlite"):
        print("Not using SQLite or DATABASE_URL not set. Skipping.")
        sys.exit(0)

    # Handle sqlite:///path vs sqlite:////absolute/path
    path = db_url.replace("sqlite:///", "")
    return path

def repair_db():
    db_path = get_db_path()
    print(f"Connecting to SQLite DB at: {db_path}")

    if not os.path.exists(db_path):
        print(f"Error: Database file not found at {db_path}")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # 1. Ensure Tables Exist (Basic check, usually they exist if app ran once)
        # We assume they exist or we can't repair columns.

        ensure_table(
            cursor,
            "numbering_scopes",
            """
            CREATE TABLE numbering_scopes (
                id INTEGER PRIMARY KEY,
                name VARCHAR NOT NULL UNIQUE,
                scope_type VARCHAR NOT NULL,
                prefix VARCHAR,
                description TEXT,
                is_system BOOLEAN NOT NULL DEFAULT 0,
                owner_org_id INTEGER REFERENCES organizations(id),
                created_at DATETIME,
                updated_at DATETIME
            )
            """,
        )

        # 2. Check/Add Columns for 'organizations'
        # Extended details columns might be missing in broken migrations
        org_columns = [
            ("address_line1", "VARCHAR"),
            ("address_line2", "VARCHAR"),
            ("city", "VARCHAR"),
            ("province", "VARCHAR"),
            ("postal_code", "VARCHAR"),
            ("country", "VARCHAR DEFAULT 'Italy'"),
            ("description", "TEXT"),
            ("email", "VARCHAR"),
            ("phone", "VARCHAR"),
            ("website", "VARCHAR"),
            ("logo_path", "VARCHAR"),
            ("club_display_name", "VARCHAR"),
            ("card_email_subject", "VARCHAR"),
            ("card_logo_url", "VARCHAR"),
            ("is_active", "BOOLEAN DEFAULT 1"),
            ("require_membership_document", "BOOLEAN DEFAULT 0"),
            ("adults_only_banner_enabled", "BOOLEAN DEFAULT 0"),
            ("stripe_connected_account_id", "VARCHAR"),
            ("stripe_platform_subscription_status", "VARCHAR"),
            ("stripe_platform_subscription_id", "VARCHAR"),
            ("statute_pdf_path", "VARCHAR"),
            ("statute_updated_at", "DATETIME"),
            ("privacy_version", "VARCHAR"),
            ("numbering_scope_id", "INTEGER REFERENCES numbering_scopes(id)"),
            ("temporary_membership_fee_amount", "NUMERIC(10,2)"),
            ("custom_membership_types_enabled", "BOOLEAN DEFAULT 0"),
            ("temporary_membership_duration_value", "INTEGER"),
            ("temporary_membership_duration_unit", "VARCHAR"),
        ]
        ensure_columns(cursor, "organizations", org_columns)

        # 3. Check/Add Columns for 'members'
        member_columns = [
            ("decision_at", "DATETIME"),
            ("decision_by_admin_id", "INTEGER REFERENCES admin_users(id)"),
            ("decision_notes", "TEXT"),
            ("deleted_at", "DATETIME"),
            ("deleted_by_admin_id", "INTEGER REFERENCES admin_users(id)"),
            ("numbering_scope_id", "INTEGER REFERENCES numbering_scopes(id)"),
            ("membership_type", "VARCHAR"),
            ("valid_from", "DATETIME"),
            ("valid_until", "DATETIME"),
            ("membership_fee_snapshot", "NUMERIC(10,2)"),
        ]
        ensure_columns(cursor, "members", member_columns)

        batch_columns = [
            ("numbering_scope_id", "INTEGER REFERENCES numbering_scopes(id)"),
        ]
        ensure_columns(cursor, "card_batches", batch_columns)

        recharge_request_columns = [
            ("card_batch_id", "INTEGER REFERENCES card_batches(id)"),
        ]
        ensure_columns(cursor, "recharge_requests", recharge_request_columns)

        # 4. Check/Add Columns for 'member_documents'
        doc_columns = [
            ("status", "VARCHAR DEFAULT 'uploaded'"),
            ("review_notes", "VARCHAR"),
            ("reviewed_at", "DATETIME"),
            ("reviewed_by", "INTEGER REFERENCES admin_users(id)"),
        ]
        ensure_columns(cursor, "member_documents", doc_columns)

        # 5. Check/Add Columns for 'admin_users'
        admin_columns = [
            ("deleted_at", "DATETIME"),
        ]
        ensure_columns(cursor, "admin_users", admin_columns)

        conn.commit()
        print("Schema columns verified/added.")

        # 6. Data Normalization: Status Enum
        print("Normalizing member status values...")
        try:
            # Check if members table exists first (though ensure_columns tries to read it)
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='members'")
            if cursor.fetchone():
                cursor.execute("UPDATE members SET status = 'pending_docs' WHERE status = 'PENDING_DOCS'")
                cursor.execute("UPDATE members SET status = 'pending_verification' WHERE status = 'PENDING_VERIFICATION'")
                cursor.execute("UPDATE members SET status = 'pending_cards' WHERE status = 'PENDING_CARDS'")
                cursor.execute("UPDATE members SET status = 'active' WHERE status = 'ACTIVE'")
                cursor.execute("UPDATE members SET status = 'rejected' WHERE status = 'REJECTED'")
                cursor.execute(
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
                conn.commit()
                print("Data normalization complete.")
            else:
                 print("Table 'members' not found, skipping normalization.")

        except Exception as e:
            print(f"Warning: normalization failed: {e}")

    except Exception as e:
        conn.rollback()
        print(f"Error during repair: {e}")
        sys.exit(1)
    finally:
        conn.close()

def ensure_columns(cursor, table_name, columns):
    print(f"Checking table '{table_name}'...")

    # Get existing columns
    try:
        cursor.execute(f"PRAGMA table_info({table_name})")
        existing_cols = {row[1] for row in cursor.fetchall()}
    except Exception as e:
        print(f"  Error reading table info: {e}. Skipping table.")
        return

    for col_name, col_type in columns:
        if col_name not in existing_cols:
            print(f"  Adding missing column: {col_name} ({col_type})")
            try:
                # SQLite ALTER TABLE ADD COLUMN is limited but works for simple types
                # and nullable columns or default values.
                cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}")
            except Exception as e:
                print(f"  Failed to add column {col_name}: {e}")


def ensure_table(cursor, table_name, create_sql):
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    )
    if cursor.fetchone():
        return
    print(f"Creating missing table: {table_name}")
    cursor.execute(create_sql)

if __name__ == "__main__":
    repair_db()
