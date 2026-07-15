from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy import CheckConstraint, Column, DateTime, Index, Integer, String, Text

from app.db import Base


def utcnow_aware() -> datetime:
    return datetime.now(timezone.utc)


class FileDeletionStatus(str, enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class FileDeletionTask(Base):
    """Transactional outbox entry for deleting a file after its DB reference is gone."""

    __tablename__ = "file_deletion_outbox"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    storage_root = Column(String(32), nullable=False, default="uploads", server_default="uploads")
    # Cleared after success so filenames containing personal data are not retained forever.
    relative_path = Column(Text, nullable=True)
    status = Column(
        String(16),
        nullable=False,
        default=FileDeletionStatus.QUEUED.value,
        server_default=FileDeletionStatus.QUEUED.value,
        index=True,
    )
    attempts = Column(Integer, nullable=False, default=0, server_default="0")
    next_retry_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow_aware,
        server_default=sa.func.now(),
        index=True,
    )
    last_error = Column(Text, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow_aware,
        server_default=sa.func.now(),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow_aware,
        onupdate=utcnow_aware,
        server_default=sa.func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "storage_root = 'uploads'",
            name="ck_file_deletion_outbox_storage_root",
        ),
        CheckConstraint(
            "status IN ('queued', 'processing', 'completed', 'failed')",
            name="ck_file_deletion_outbox_status",
        ),
        Index(
            "ix_file_deletion_outbox_dispatch",
            "status",
            "next_retry_at",
            "created_at",
        ),
    )
