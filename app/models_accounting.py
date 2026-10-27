"""Incoming money, explicit allocations and non-destructive accounting history."""
from datetime import datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, event, select, update
from sqlalchemy.orm import Session, relationship

from app.db import Base


def _now():
    return datetime.now(timezone.utc)


class AccountingReceipt(Base):
    __tablename__ = "accounting_receipts"

    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    version = Column(Integer, nullable=False, default=1, server_default="1")
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, default="EUR", server_default="EUR")
    method = Column(String(24), nullable=False)
    paid_on = Column(Date, nullable=False)
    payer = Column(String(255), nullable=True)
    reference = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    source = Column(String(24), nullable=False)
    source_key = Column(String(255), nullable=True)
    legacy_payment_id = Column(Integer, ForeignKey("membership_payments.id", ondelete="SET NULL"), nullable=True, unique=True)
    voided = Column(Boolean, nullable=False, default=False, server_default="0")
    created_by_admin_id = Column(Integer, ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)

    allocations = relationship("AccountingAllocation", back_populates="receipt", passive_deletes=True)
    events = relationship("AccountingEvent", back_populates="receipt", passive_deletes=True)

    __table_args__ = (
        UniqueConstraint("org_id", "source_key", name="uq_accounting_receipt_org_source"),
        CheckConstraint("amount_cents > 0", name="ck_accounting_receipt_positive"),
        CheckConstraint("version >= 1", name="ck_accounting_receipt_version"),
        Index("ix_accounting_receipt_org_date", "org_id", "paid_on", "id"),
    )


class AccountingAllocation(Base):
    __tablename__ = "accounting_allocations"

    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    receipt_id = Column(Integer, ForeignKey("accounting_receipts.id", ondelete="RESTRICT"), nullable=False, index=True)
    target_key = Column(String(100), nullable=False, index=True)
    kind = Column(String(16), nullable=False)
    target_id = Column(Integer, nullable=True)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True, index=True)
    member_name = Column(String(255), nullable=False)
    membership_year = Column(Integer, nullable=True)
    expected_cents = Column(Integer, nullable=False)
    amount_cents = Column(Integer, nullable=False)
    payment_id = Column(Integer, ForeignKey("membership_payments.id", ondelete="SET NULL"), nullable=True, index=True)
    reversed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)

    receipt = relationship("AccountingReceipt", back_populates="allocations")

    __table_args__ = (
        CheckConstraint("amount_cents > 0", name="ck_accounting_allocation_positive"),
        CheckConstraint("expected_cents >= 0", name="ck_accounting_allocation_expected"),
        Index("ix_accounting_allocation_target_active", "org_id", "target_key", "reversed_at"),
    )


class AccountingEvent(Base):
    __tablename__ = "accounting_events"

    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    receipt_id = Column(Integer, ForeignKey("accounting_receipts.id", ondelete="RESTRICT"), nullable=False, index=True)
    action = Column(String(40), nullable=False)
    reason = Column(Text, nullable=True)
    actor_admin_id = Column(Integer, ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True)
    actor_snapshot = Column(JSON, nullable=False)
    before_json = Column(JSON, nullable=True)
    after_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)

    receipt = relationship("AccountingReceipt", back_populates="events")


class AccountingMutation(Base):
    __tablename__ = "accounting_mutations"

    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    request_key = Column(String(120), nullable=False)
    payload_hash = Column(String(64), nullable=False)
    response_json = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)

    __table_args__ = (UniqueConstraint("org_id", "request_key", name="uq_accounting_mutation_org_key"),)


def _immutable_event(_mapper, _connection, _target):
    raise ValueError("Accounting events are immutable; append a correcting event instead.")


event.listen(AccountingEvent, "before_update", _immutable_event)
event.listen(AccountingEvent, "before_delete", _immutable_event)


def _detach_references(session, *, member_ids=None, payment_ids=None):
    # Some legacy SQLite databases have FK enforcement disabled. Preserve
    # accounting evidence without ever linking it to a subsequently reused ID.
    if member_ids is not None:
        session.execute(update(AccountingAllocation).where(AccountingAllocation.member_id.in_(member_ids)).values(member_id=None).execution_options(synchronize_session=False))
    if payment_ids is not None:
        from app.models import MemberPayment
        session.execute(update(AccountingAllocation).where(AccountingAllocation.payment_id.in_(payment_ids)).values(payment_id=None).execution_options(synchronize_session=False))
        session.execute(update(AccountingReceipt).where(AccountingReceipt.legacy_payment_id.in_(payment_ids)).values(legacy_payment_id=None).execution_options(synchronize_session=False))
        session.execute(update(MemberPayment).where(MemberPayment.membership_payment_id.in_(payment_ids)).values(membership_payment_id=None).execution_options(synchronize_session=False))


@event.listens_for(Session, "before_flush")
def _detach_accounting_before_delete(session, _flush_context, _instances):
    from app.models import Member, MembershipPayment
    members = [item.id for item in session.deleted if isinstance(item, Member)]
    payments = [item.id for item in session.deleted if isinstance(item, MembershipPayment)]
    if members:
        _detach_references(session, member_ids=members)
    if payments:
        _detach_references(session, payment_ids=payments)


@event.listens_for(Session, "do_orm_execute")
def _detach_accounting_before_bulk_delete(state):
    if not state.is_delete:
        return
    from app.models import Member, MembershipPayment
    table = getattr(getattr(state.statement, "table", None), "name", None)
    if table not in {"members", "membership_payments"}:
        return
    model = Member if table == "members" else MembershipPayment
    ids = select(model.id)
    if state.statement.whereclause is not None:
        ids = ids.where(state.statement.whereclause)
    _detach_references(state.session, **{"member_ids" if table == "members" else "payment_ids": ids})
