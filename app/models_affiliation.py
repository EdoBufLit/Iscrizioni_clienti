from __future__ import annotations

import enum
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

import app.models as core_models
from app.db import Base


def _core_or(name: str, fallback):
    return getattr(core_models, name, fallback)


class _AffiliationApplicationStatus(str, enum.Enum):
    DRAFT = "draft"
    UNDER_REVIEW = "under_review"
    CHANGES_REQUESTED = "changes_requested"
    APPROVED = "approved"
    REJECTED = "rejected"


class _AffiliationDocsStatus(str, enum.Enum):
    PENDING = "pending"
    OK = "ok"
    CHANGES_REQUESTED = "changes_requested"


class _AffiliationPaymentMethod(str, enum.Enum):
    STRIPE = "stripe"
    BANK_TRANSFER = "bank_transfer"
    CASH = "cash"


class _AffiliationPaymentStatus(str, enum.Enum):
    UNPAID = "unpaid"
    CHECKOUT_PENDING = "checkout_pending"
    PAID = "paid"
    PAYMENT_UNDER_REVIEW = "payment_under_review"
    VERIFIED = "verified"
    FAILED = "failed"


class _AffiliationDocumentStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class _ReferralStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REWARDED = "rewarded"


class _VideoJobStatus(str, enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class _AffiliationVideoMode(str, enum.Enum):
    REVIEW = "review"
    PAYMENT_PENDING = "payment_pending"
    APPROVED = "approved"


AffiliationApplicationStatus = _core_or(
    "AffiliationApplicationStatus", _AffiliationApplicationStatus
)
AffiliationDocsStatus = _core_or("AffiliationDocsStatus", _AffiliationDocsStatus)
AffiliationPaymentMethod = _core_or("AffiliationPaymentMethod", _AffiliationPaymentMethod)
AffiliationPaymentStatus = _core_or("AffiliationPaymentStatus", _AffiliationPaymentStatus)
AffiliationDocumentStatus = _core_or("AffiliationDocumentStatus", _AffiliationDocumentStatus)
ReferralStatus = _core_or("ReferralStatus", _ReferralStatus)
VideoJobStatus = _core_or("VideoJobStatus", _VideoJobStatus)
AffiliationVideoMode = _core_or("AffiliationVideoMode", _AffiliationVideoMode)

GENERIC_JSON_TYPE = getattr(core_models, "GENERIC_JSON_TYPE", sa.JSON())


if hasattr(core_models, "AffiliationApplication"):
    AffiliationApplication = core_models.AffiliationApplication
    AffiliationPerson = core_models.AffiliationPerson
    AffiliationDocument = core_models.AffiliationDocument
    AffiliationEvent = core_models.AffiliationEvent
    VideoJob = core_models.VideoJob
    Referral = core_models.Referral
else:

    class AffiliationApplication(Base):
        __tablename__ = "affiliation_applications"

        id = Column(Integer, primary_key=True, index=True)
        public_token = Column(String(64), nullable=False, unique=True, index=True)

        status = Column(
            String,
            nullable=False,
            default=AffiliationApplicationStatus.DRAFT.value,
            server_default=AffiliationApplicationStatus.DRAFT.value,
            index=True,
        )
        docs_status = Column(
            String,
            nullable=False,
            default=AffiliationDocsStatus.PENDING.value,
            server_default=AffiliationDocsStatus.PENDING.value,
            index=True,
        )
        payment_method = Column(String, nullable=True)
        payment_status = Column(
            String,
            nullable=False,
            default=AffiliationPaymentStatus.UNPAID.value,
            server_default=AffiliationPaymentStatus.UNPAID.value,
            index=True,
        )
        payment_amount_cents = Column(Integer, nullable=False, default=0, server_default="0")

        organization_name = Column(String, nullable=True)
        organization_legal_name = Column(String, nullable=True)
        organization_slug_candidate = Column(String, nullable=True)
        tax_code = Column(String, nullable=True)
        vat_number = Column(String, nullable=True)
        address_line1 = Column(String, nullable=True)
        address_line2 = Column(String, nullable=True)
        city = Column(String, nullable=True)
        province = Column(String, nullable=True)
        postal_code = Column(String, nullable=True)
        country = Column(String, nullable=True, default="Italy")

        applicant_full_name = Column(String, nullable=True)
        applicant_email = Column(String, nullable=True, index=True)
        applicant_phone = Column(String, nullable=True)
        notes = Column(Text, nullable=True)

        manual_preferred_date = Column(String, nullable=True)
        manual_preferred_time = Column(String, nullable=True)
        manual_contact = Column(String, nullable=True)

        stripe_checkout_session_id = Column(String, nullable=True, index=True)
        stripe_payment_intent_id = Column(String, nullable=True)
        stripe_last_event_id = Column(String, nullable=True)
        payment_verified_at = Column(DateTime, nullable=True)
        payment_verified_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)

        submitted_at = Column(DateTime, nullable=True)
        reviewed_at = Column(DateTime, nullable=True)
        reviewed_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
        review_notes = Column(Text, nullable=True)
        approved_at = Column(DateTime, nullable=True)
        rejected_at = Column(DateTime, nullable=True)
        approved_org_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)

        created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
        updated_at = Column(
            DateTime,
            default=datetime.utcnow,
            onupdate=datetime.utcnow,
            nullable=False,
        )

        people = relationship(
            "AffiliationPerson",
            back_populates="application",
            cascade="all, delete-orphan",
        )
        documents = relationship(
            "AffiliationDocument",
            back_populates="application",
            cascade="all, delete-orphan",
        )
        events = relationship(
            "AffiliationEvent",
            back_populates="application",
            cascade="all, delete-orphan",
        )
        video_jobs = relationship(
            "VideoJob",
            back_populates="application",
            cascade="all, delete-orphan",
        )
        referral = relationship(
            "Referral",
            back_populates="application",
            uselist=False,
            cascade="all, delete-orphan",
        )
        approved_organization = relationship("Organization", foreign_keys=[approved_org_id])


    class Referral(Base):
        __tablename__ = "referrals"

        id = Column(Integer, primary_key=True, index=True)
        referrer_org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
        application_id = Column(
            Integer,
            ForeignKey("affiliation_applications.id"),
            nullable=False,
            index=True,
            unique=True,
        )
        status = Column(
            String,
            nullable=False,
            default=ReferralStatus.PENDING.value,
            server_default=ReferralStatus.PENDING.value,
            index=True,
        )
        created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
        approved_at = Column(DateTime, nullable=True)
        rewarded_at = Column(DateTime, nullable=True)
        reward_code = Column(String, nullable=True)
        reward_title = Column(String, nullable=True)
        reward_description = Column(Text, nullable=True)
        reward_delivery_timing = Column(String, nullable=True)
        super_admin_notified_at = Column(DateTime, nullable=True)

        referrer_organization = relationship("Organization", foreign_keys=[referrer_org_id])
        application = relationship(
            "AffiliationApplication",
            back_populates="referral",
            foreign_keys=[application_id],
        )


    class AffiliationPerson(Base):
        __tablename__ = "affiliation_people"

        id = Column(Integer, primary_key=True, index=True)
        application_id = Column(
            Integer, ForeignKey("affiliation_applications.id"), nullable=False, index=True
        )
        role = Column(String, nullable=False)
        full_name = Column(String, nullable=True)
        email = Column(String, nullable=True)
        phone = Column(String, nullable=True)
        fiscal_code = Column(String, nullable=True)
        created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
        updated_at = Column(
            DateTime,
            default=datetime.utcnow,
            onupdate=datetime.utcnow,
            nullable=False,
        )

        application = relationship("AffiliationApplication", back_populates="people")


    class AffiliationDocument(Base):
        __tablename__ = "affiliation_documents"

        id = Column(Integer, primary_key=True, index=True)
        application_id = Column(
            Integer, ForeignKey("affiliation_applications.id"), nullable=False, index=True
        )
        doc_type = Column(String, nullable=False, index=True)
        rel_path = Column(String, nullable=False)
        original_filename = Column(String, nullable=True)
        mime_type = Column(String, nullable=True)
        size_bytes = Column(Integer, nullable=True)
        sha256 = Column(String, nullable=True)
        status = Column(
            String,
            nullable=False,
            default=AffiliationDocumentStatus.PENDING.value,
            server_default=AffiliationDocumentStatus.PENDING.value,
            index=True,
        )
        review_notes = Column(Text, nullable=True)
        rejection_note = Column(Text, nullable=True)
        reviewed_at = Column(DateTime, nullable=True)
        reviewed_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
        replaces_document_id = Column(Integer, ForeignKey("affiliation_documents.id"), nullable=True)
        uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

        application = relationship("AffiliationApplication", back_populates="documents")


    class AffiliationEvent(Base):
        __tablename__ = "affiliation_events"

        id = Column(Integer, primary_key=True, index=True)
        application_id = Column(
            Integer, ForeignKey("affiliation_applications.id"), nullable=False, index=True
        )
        event_type = Column(String, nullable=False, index=True)
        actor_type = Column(String, nullable=False, default="system", server_default="system")
        actor_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
        payload_json = Column(GENERIC_JSON_TYPE, nullable=False, default=dict)
        created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

        application = relationship("AffiliationApplication", back_populates="events")


    class VideoJob(Base):
        __tablename__ = "video_jobs"

        id = Column(Integer, primary_key=True, index=True)
        application_id = Column(
            Integer, ForeignKey("affiliation_applications.id"), nullable=True, index=True
        )
        mode = Column(
            String,
            nullable=False,
            default=AffiliationVideoMode.REVIEW.value,
            server_default=AffiliationVideoMode.REVIEW.value,
            index=True,
        )
        status = Column(
            String,
            nullable=False,
            default=VideoJobStatus.QUEUED.value,
            server_default=VideoJobStatus.QUEUED.value,
            index=True,
        )
        provider = Column(String, nullable=False, default="remotion", server_default="remotion")
        output_rel_path = Column(String, nullable=True)
        error_text = Column(Text, nullable=True)
        payload_json = Column(GENERIC_JSON_TYPE, nullable=False, default=dict)
        requested_at = Column(DateTime, default=datetime.utcnow, nullable=False)
        started_at = Column(DateTime, nullable=True)
        finished_at = Column(DateTime, nullable=True)
        created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

        application = relationship("AffiliationApplication", back_populates="video_jobs")


__all__ = [
    "AffiliationApplication",
    "AffiliationApplicationStatus",
    "AffiliationDocument",
    "AffiliationDocumentStatus",
    "AffiliationDocsStatus",
    "AffiliationEvent",
    "AffiliationPaymentMethod",
    "AffiliationPaymentStatus",
    "AffiliationPerson",
    "AffiliationVideoMode",
    "Referral",
    "ReferralStatus",
    "VideoJob",
    "VideoJobStatus",
]
