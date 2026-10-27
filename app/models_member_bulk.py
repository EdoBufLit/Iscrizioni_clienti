"""Durable, tenant-scoped previews and per-member bulk operation receipts."""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, event, func, select, update
from sqlalchemy.orm import Session

from app.db import Base


class MemberBulkRun(Base):
    __tablename__ = "member_bulk_runs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by_admin_id = Column(Integer, ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True, index=True)
    request_key = Column(String(100), nullable=False)
    payload_fingerprint = Column(String(64), nullable=False)
    action = Column(String(30), nullable=False)
    selection_mode = Column(String(12), nullable=False)
    membership_year = Column(Integer, nullable=True)
    status = Column(String(16), nullable=False, default="preview", server_default="preview")
    selected_count = Column(Integer, nullable=False)
    eligible_count = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("org_id", "created_by_admin_id", "request_key", name="uq_member_bulk_runs_actor_request"),
        CheckConstraint("action IN ('export','send_access','quote_reminder')", name="ck_member_bulk_runs_action"),
        CheckConstraint("status IN ('preview','running','completed','expired')", name="ck_member_bulk_runs_status"),
        CheckConstraint("selected_count >= 0 AND eligible_count >= 0 AND eligible_count <= selected_count", name="ck_member_bulk_runs_counts"),
        Index("ix_member_bulk_runs_org_created", "org_id", "created_at"),
    )


class MemberBulkItem(Base):
    __tablename__ = "member_bulk_items"

    id = Column(Integer, primary_key=True)
    run_id = Column(String(36), ForeignKey("member_bulk_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    # Keep the requested number for the outcome while detaching a purged
    # profile. Reusing an integer ID must never target a replacement profile.
    member_id = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True)
    requested_member_id = Column(Integer, nullable=False)
    target_email_hash = Column(String(64), nullable=True)
    preview_outstanding_cents = Column(Integer, nullable=True)
    preview_eligible = Column(Boolean, nullable=False)
    status = Column(String(16), nullable=False, default="pending", server_default="pending")
    reason_code = Column(String(80), nullable=True)
    detail = Column(Text, nullable=True)
    attempts = Column(Integer, nullable=False, default=0, server_default="0")
    outbox_id = Column(String(36), ForeignKey("email_outbox.id", ondelete="SET NULL"), nullable=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("run_id", "requested_member_id", name="uq_member_bulk_items_run_member"),
        CheckConstraint("status IN ('pending','succeeded','skipped','failed')", name="ck_member_bulk_items_status"),
        CheckConstraint("attempts >= 0", name="ck_member_bulk_items_attempts"),
        Index("ix_member_bulk_items_run_status_id", "run_id", "status", "id"),
    )


class MemberBulkRequest(Base):
    """An atomic receipt makes retries safe even when the HTTP response is lost."""

    __tablename__ = "member_bulk_requests"

    id = Column(Integer, primary_key=True)
    run_id = Column(String(36), ForeignKey("member_bulk_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    request_key = Column(String(100), nullable=False)
    operation = Column(String(16), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("run_id", "request_key", name="uq_member_bulk_requests_run_key"),
        CheckConstraint("operation IN ('execute','retry_failed')", name="ck_member_bulk_requests_operation"),
    )


@event.listens_for(Session, "before_flush")
def _detach_bulk_profiles_before_flush(session, _flush_context, _instances):
    # SQLite installations historically run without FK enforcement. Cover ORM
    # deletes there as well; PostgreSQL's FK provides the final database guard.
    from app.models import Member

    ids = [member.id for member in session.deleted if isinstance(member, Member) and member.id is not None]
    if ids:
        session.execute(update(MemberBulkItem).where(MemberBulkItem.member_id.in_(ids)).values(member_id=None).execution_options(synchronize_session=False))


@event.listens_for(Session, "do_orm_execute")
def _detach_bulk_profiles_before_bulk_delete(state):
    # Maintenance purges use Query.delete(), which bypasses before_flush.
    if not state.is_delete or getattr(getattr(state.statement, "table", None), "name", None) != "members":
        return
    from app.models import Member

    ids = select(Member.id)
    if state.statement.whereclause is not None:
        ids = ids.where(state.statement.whereclause)
    state.session.execute(update(MemberBulkItem).where(MemberBulkItem.member_id.in_(ids)).values(member_id=None).execution_options(synchronize_session=False))
