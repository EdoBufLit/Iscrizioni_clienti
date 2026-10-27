"""Persistent Google Wallet identities and transactional delivery intents."""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, JSON, String, Text, event
from sqlalchemy.orm import Session, relationship

from app.db import Base


class GoogleWalletPass(Base):
    __tablename__ = "google_wallet_passes"

    id = Column(Integer, primary_key=True)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    object_id = Column(String(255), nullable=False, unique=True)
    class_id = Column(String(255), nullable=False)
    kind = Column(String(16), nullable=False, default="annual")
    temporary_purchase_id = Column(Integer, nullable=True, index=True)
    revoked = Column(Boolean, nullable=False, default=False, server_default="0")
    provisioning = Column(Boolean, nullable=False, default=False, server_default="0")
    desired_revision = Column(Integer, nullable=False, default=1, server_default="1")
    synced_revision = Column(Integer, nullable=False, default=0, server_default="0")
    payload_json = Column(JSON, nullable=True)
    payload_hash = Column(String(64), nullable=True)
    next_check_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    last_synced_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    job = relationship("GoogleWalletSyncJob", back_populates="wallet_pass", uselist=False, cascade="all, delete-orphan")


class GoogleWalletSyncJob(Base):
    __tablename__ = "google_wallet_sync_jobs"

    id = Column(Integer, primary_key=True)
    pass_id = Column(Integer, ForeignKey("google_wallet_passes.id", ondelete="CASCADE"), nullable=False, unique=True)
    status = Column(String(16), nullable=False, default="pending", server_default="pending")
    available_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    attempts = Column(Integer, nullable=False, default=0, server_default="0")
    lease_token = Column(String(36), nullable=True)
    lease_expires_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    wallet_pass = relationship("GoogleWalletPass", back_populates="job")
    __table_args__ = (Index("ix_wallet_sync_dispatch", "status", "available_at"),)


def _track_wallet_changes(session, _flush_context, _instances):
    from app.services.google_wallet_sync import track_wallet_changes

    track_wallet_changes(session)


if not event.contains(Session, "before_flush", _track_wallet_changes):
    event.listen(Session, "before_flush", _track_wallet_changes)
