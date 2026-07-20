"""Add non-destructive annual membership history and deactivation receipts.

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-07-18 12:00:00.000000
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "d2e3f4a5b6c7"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


def _json_type(bind):
    if (bind.dialect.name or "").lower() == "postgresql":
        return postgresql.JSONB(astext_type=sa.Text())
    return sa.JSON()


def _json_empty_list_default(bind):
    if (bind.dialect.name or "").lower() == "postgresql":
        return sa.text("'[]'::jsonb")
    return sa.text("'[]'")


def _status_value(raw_status: object, *, card_year: int, is_deleted: bool) -> str:
    normalized = str(raw_status or "").strip().lower()
    if is_deleted or normalized in {"expired", "memberstatus.expired"}:
        return "expired"
    if normalized in {"rejected", "memberstatus.rejected"}:
        return "cancelled"
    local_today = datetime.now(ZoneInfo("Europe/Rome")).date()
    if local_today > date(card_year + 1, 1, 1):
        return "expired"
    if card_year > local_today.year:
        return "scheduled"
    if normalized not in {"active", "memberstatus.active"}:
        return "due"
    return "active"


def _starts_on(raw_value: object, *, membership_year: int) -> date:
    if isinstance(raw_value, datetime) and raw_value.year == membership_year:
        return raw_value.date()
    if isinstance(raw_value, date) and raw_value.year == membership_year:
        return raw_value
    return date(membership_year, 1, 1)


def upgrade() -> None:
    bind = op.get_bind()
    json_type = _json_type(bind)

    op.create_table(
        "annual_membership_terms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("membership_year", sa.Integer(), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("valid_through", sa.Date(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("fee_amount", sa.Numeric(10, 2), nullable=True),
        sa.Column("currency", sa.String(), nullable=False, server_default="EUR"),
        sa.Column("card_no", sa.Integer(), nullable=True),
        sa.Column("card_year", sa.Integer(), nullable=True),
        sa.Column("batch_id", sa.Integer(), nullable=True),
        sa.Column("numbering_scope_id", sa.Integer(), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["batch_id"], ["card_batches.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["numbering_scope_id"],
            ["numbering_scopes.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "member_id",
            "membership_year",
            name="uq_annual_membership_terms_member_year",
        ),
    )
    op.create_index(
        "ix_annual_membership_terms_member_id",
        "annual_membership_terms",
        ["member_id"],
    )
    op.create_index(
        "ix_annual_membership_terms_org_id",
        "annual_membership_terms",
        ["org_id"],
    )
    op.create_index(
        "ix_annual_membership_terms_membership_year",
        "annual_membership_terms",
        ["membership_year"],
    )
    op.create_index(
        "ix_annual_membership_terms_valid_through",
        "annual_membership_terms",
        ["valid_through"],
    )
    op.create_index(
        "ix_annual_membership_terms_status",
        "annual_membership_terms",
        ["status"],
    )
    op.create_index(
        "ix_annual_membership_terms_batch_id",
        "annual_membership_terms",
        ["batch_id"],
    )
    op.create_index(
        "ix_annual_membership_terms_numbering_scope_id",
        "annual_membership_terms",
        ["numbering_scope_id"],
    )
    op.create_index(
        "ix_annual_membership_terms_org_year_status",
        "annual_membership_terms",
        ["org_id", "membership_year", "status"],
    )
    op.create_index(
        "uq_annual_membership_terms_active_org_year_card",
        "annual_membership_terms",
        ["org_id", "card_year", "card_no"],
        unique=True,
        sqlite_where=sa.text("status NOT IN ('expired', 'cancelled')"),
        postgresql_where=sa.text("status NOT IN ('expired', 'cancelled')"),
    )

    op.create_table(
        "annual_card_deactivation_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("membership_year", sa.Integer(), nullable=False),
        sa.Column("valid_through", sa.Date(), nullable=False),
        sa.Column("preview_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "deactivated_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "term_ids_json",
            json_type,
            nullable=False,
            server_default=_json_empty_list_default(bind),
        ),
        sa.Column("actor_admin_id", sa.Integer(), nullable=True),
        sa.Column(
            "executed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["actor_admin_id"],
            ["admin_users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_annual_card_deactivation_runs_membership_year",
        "annual_card_deactivation_runs",
        ["membership_year"],
    )
    op.create_index(
        "ix_annual_card_deactivation_runs_preview_hash",
        "annual_card_deactivation_runs",
        ["preview_hash"],
        unique=True,
    )
    op.create_index(
        "ix_annual_card_deactivation_runs_actor_admin_id",
        "annual_card_deactivation_runs",
        ["actor_admin_id"],
    )

    members = sa.table(
        "members",
        sa.column("id", sa.Integer()),
        sa.column("org_id", sa.Integer()),
        sa.column("status", sa.String()),
        sa.column("card_no", sa.Integer()),
        sa.column("card_year", sa.Integer()),
        sa.column("membership_type", sa.String()),
        sa.column("valid_from", sa.DateTime()),
        sa.column("joined_at", sa.DateTime()),
        sa.column("membership_fee_snapshot", sa.Numeric(10, 2)),
        sa.column("batch_id", sa.Integer()),
        sa.column("numbering_scope_id", sa.Integer()),
        sa.column("card_email_sent_at", sa.DateTime()),
        sa.column("expired_at", sa.DateTime()),
        sa.column("deleted_at", sa.DateTime()),
        sa.column("signup_source", sa.String()),
    )
    organizations = sa.table(
        "organizations",
        sa.column("id", sa.Integer()),
        sa.column("membership_fee_currency", sa.String()),
    )
    annual_terms = sa.table(
        "annual_membership_terms",
        sa.column("member_id", sa.Integer()),
        sa.column("org_id", sa.Integer()),
        sa.column("membership_year", sa.Integer()),
        sa.column("starts_on", sa.Date()),
        sa.column("valid_through", sa.Date()),
        sa.column("status", sa.String()),
        sa.column("fee_amount", sa.Numeric(10, 2)),
        sa.column("currency", sa.String()),
        sa.column("card_no", sa.Integer()),
        sa.column("card_year", sa.Integer()),
        sa.column("batch_id", sa.Integer()),
        sa.column("numbering_scope_id", sa.Integer()),
        sa.column("issued_at", sa.DateTime(timezone=True)),
        sa.column("activated_at", sa.DateTime(timezone=True)),
        sa.column("deactivated_at", sa.DateTime(timezone=True)),
        sa.column("source", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )

    rows = bind.execute(
        sa.select(
            members.c.id,
            members.c.org_id,
            members.c.status,
            members.c.card_no,
            members.c.card_year,
            members.c.membership_type,
            members.c.valid_from,
            members.c.joined_at,
            members.c.membership_fee_snapshot,
            members.c.batch_id,
            members.c.numbering_scope_id,
            members.c.card_email_sent_at,
            members.c.expired_at,
            members.c.deleted_at,
            members.c.signup_source,
            organizations.c.membership_fee_currency,
        )
        .select_from(
            members.outerjoin(organizations, organizations.c.id == members.c.org_id)
        )
        .where(
            members.c.card_no.is_not(None),
            members.c.card_year.is_not(None),
            sa.or_(
                members.c.membership_type.is_(None),
                sa.func.lower(members.c.membership_type) != "temporary",
            ),
        )
        .order_by(members.c.id.asc())
    ).mappings()

    now = datetime.now(timezone.utc)
    payloads = []
    for row in rows:
        membership_year = int(row["card_year"])
        status = _status_value(
            row["status"],
            card_year=membership_year,
            is_deleted=row["deleted_at"] is not None,
        )
        issued_at = (
            row["card_email_sent_at"]
            or row["valid_from"]
            or row["joined_at"]
            or now
        )
        payloads.append(
            {
                "member_id": row["id"],
                "org_id": row["org_id"],
                "membership_year": membership_year,
                "starts_on": _starts_on(
                    row["valid_from"] or row["joined_at"],
                    membership_year=membership_year,
                ),
                "valid_through": date(membership_year + 1, 1, 1),
                "status": status,
                "fee_amount": row["membership_fee_snapshot"],
                "currency": str(row["membership_fee_currency"] or "EUR").upper(),
                "card_no": int(row["card_no"]),
                "card_year": membership_year,
                "batch_id": row["batch_id"],
                "numbering_scope_id": row["numbering_scope_id"],
                "issued_at": issued_at,
                "activated_at": issued_at if status == "active" else None,
                "deactivated_at": (
                    row["expired_at"] or now if status == "expired" else None
                ),
                "source": row["signup_source"],
                "created_at": now,
                "updated_at": now,
            }
        )
    if payloads:
        bind.execute(sa.insert(annual_terms), payloads)


def downgrade() -> None:
    op.drop_table("annual_card_deactivation_runs")
    op.drop_table("annual_membership_terms")
