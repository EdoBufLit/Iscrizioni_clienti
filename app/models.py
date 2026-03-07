import sqlalchemy as sa
from sqlalchemy import (
    Column,
    Integer,
    String,
    Date,
    DateTime,
    ForeignKey,
    Boolean,
    Enum,
    UniqueConstraint,
    Text,
    JSON,
    TypeDecorator,
    Index,
    and_,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum
import uuid
from .db import Base


def utcnow_aware() -> datetime:
    return datetime.now(timezone.utc)


GENERIC_JSON_TYPE = JSON().with_variant(JSONB, "postgresql")
EMAIL_PAYLOAD_TYPE = GENERIC_JSON_TYPE


class MemberStatus(str, enum.Enum):
    PENDING_VERIFICATION = "pending_verification"
    PENDING_DOCS = "pending_docs"
    PENDING_CARDS = "pending_cards"
    ACTIVE = "active"
    REJECTED = "rejected"
    EXPIRED = "expired"


class PaymentMethod(str, enum.Enum):
    CASH = "CASH"
    BONIFICO = "BONIFICO"


class SafeMemberStatusType(TypeDecorator):
    """Stores MemberStatus as plain strings; normalises legacy uppercase values on read."""

    impl = String
    cache_ok = True

    _LEGACY_MAP = {
        e.name: e.value for e in MemberStatus
    }  # e.g. "PENDING_DOCS" -> "pending_docs"

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, MemberStatus):
            return value.value
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        normalized = self._LEGACY_MAP.get(value, value)
        try:
            return MemberStatus(normalized)
        except ValueError:
            return value


class SafePaymentMethodType(TypeDecorator):
    """Stores payment method as strings while normalizing legacy aliases on read/write."""

    impl = String
    cache_ok = True

    _NORMALIZED_MAP = {
        "cash": PaymentMethod.CASH.value,
        "contanti": PaymentMethod.CASH.value,
        "bonifico": PaymentMethod.BONIFICO.value,
        "bank_transfer": PaymentMethod.BONIFICO.value,
    }

    @classmethod
    def _normalize(cls, value):
        if value is None:
            return None
        cleaned = str(value).strip()
        if cleaned == "":
            return None
        upper = cleaned.upper()
        if upper in {PaymentMethod.CASH.value, PaymentMethod.BONIFICO.value}:
            return upper
        return cls._NORMALIZED_MAP.get(cleaned.lower())

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, PaymentMethod):
            return value.value
        normalized = self._normalize(value)
        if normalized is None:
            raise ValueError(f"Invalid payment method: {value}")
        return normalized

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        normalized = self._normalize(value)
        if normalized is None:
            return value
        try:
            return PaymentMethod(normalized)
        except ValueError:
            return value


class DocStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class AdminRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    ORG_ADMIN = "org_admin"


class SignupSource(str, enum.Enum):
    ASSONAM_FORM = "assonam_form"
    PIENISSIMO = "pienissimo"
    ADMIN = "admin"


class AffiliationApplicationStatus(str, enum.Enum):
    DRAFT = "draft"
    UNDER_REVIEW = "under_review"
    CHANGES_REQUESTED = "changes_requested"
    APPROVED = "approved"
    REJECTED = "rejected"


class AffiliationDocsStatus(str, enum.Enum):
    PENDING = "pending"
    OK = "ok"
    CHANGES_REQUESTED = "changes_requested"


class AffiliationPaymentMethod(str, enum.Enum):
    STRIPE = "stripe"
    BANK_TRANSFER = "bank_transfer"
    CASH = "cash"


class AffiliationPaymentStatus(str, enum.Enum):
    UNPAID = "unpaid"
    CHECKOUT_PENDING = "checkout_pending"
    PAID = "paid"
    PAYMENT_UNDER_REVIEW = "payment_under_review"
    VERIFIED = "verified"
    FAILED = "failed"


class AffiliationDocumentStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ReferralStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REWARDED = "rewarded"


class VideoJobStatus(str, enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class AffiliationVideoMode(str, enum.Enum):
    REVIEW = "review"
    PAYMENT_PENDING = "payment_pending"
    APPROVED = "approved"


class TokenType(str, enum.Enum):
    SIGNUP_CONTINUE = "signup_continue"
    LOGIN_MAGIC_LINK = "login_magic_link"


class EmailOutboxStatus(str, enum.Enum):
    QUEUED = "queued"
    SENDING = "sending"
    SENT = "sent"
    FAILED = "failed"


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    slug = Column(String, unique=True, index=True)
    statute_version = Column(String)
    statute_pdf_path = Column(
        String, nullable=True
    )  # Path relative to static or uploads
    statute_updated_at = Column(DateTime, nullable=True)
    privacy_version = Column(String)

    # Extended details
    address_line1 = Column(String, nullable=True)
    address_line2 = Column(String, nullable=True)
    city = Column(String, index=True, nullable=True)
    province = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    country = Column(String, default="Italy")
    description = Column(Text, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    whatsapp_e164 = Column(String, nullable=True)
    website = Column(String, nullable=True)
    logo_path = Column(String, nullable=True)
    club_display_name = Column(String, nullable=True)
    card_email_subject = Column(String, nullable=True)
    card_logo_url = Column(String, nullable=True)
    wallet_bg_color = Column(String, nullable=True)
    wallet_logo_url = Column(String, nullable=True)
    wallet_hero_image_url = Column(String, nullable=True)
    wallet_title_override = Column(String, nullable=True)
    wallet_is_test_prefix = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    auto_approve_signup = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    accounting_enabled = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    is_active = Column(Boolean, default=True)
    last_low_cards_alert_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)

    created_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    members = relationship("Member", back_populates="organization")
    batches = relationship("CardBatch", back_populates="organization")
    integration_api_keys = relationship(
        "IntegrationApiKey", back_populates="organization"
    )
    recharge_requests = relationship(
        "RechargeRequest", back_populates="organization"
    )
    admins = relationship(
        "AdminUser", back_populates="organization", foreign_keys="AdminUser.org_id"
    )
    affiliation_applications = relationship(
        "AffiliationApplication",
        back_populates="approved_organization",
        foreign_keys="AffiliationApplication.approved_org_id",
    )
    sent_referrals = relationship(
        "Referral",
        back_populates="referrer_organization",
        foreign_keys="Referral.referrer_org_id",
    )
    shared_document_assignments = relationship(
        "OrganizationSharedDocumentAssignment",
        back_populates="organization",
        foreign_keys="OrganizationSharedDocumentAssignment.association_id",
    )


class OperationLog(Base):
    __tablename__ = "operation_logs"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    actor_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
    actor_member_id = Column(Integer, ForeignKey("members.id"), nullable=True)
    actor_role = Column(String)
    action = Column(String, index=True)
    entity_type = Column(String, index=True)
    entity_id = Column(Integer, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)


class EmailOutbox(Base):
    __tablename__ = "email_outbox"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    to_email = Column(String, nullable=False, index=True)
    subject = Column(String, nullable=False)
    email_type = Column(String, nullable=False, index=True)
    payload_json = Column(EMAIL_PAYLOAD_TYPE, nullable=False, default=dict)
    status = Column(
        String,
        nullable=False,
        default=EmailOutboxStatus.QUEUED.value,
        server_default=EmailOutboxStatus.QUEUED.value,
        index=True,
    )
    priority = Column(Integer, nullable=False, default=5, server_default="5", index=True)
    attempts = Column(Integer, nullable=False, default=0, server_default="0")
    next_retry_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow_aware,
        server_default=sa.func.now(),
        index=True,
    )
    last_error = Column(Text, nullable=True)
    provider_message_id = Column(Text, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    dedupe_key = Column(String, nullable=True, index=True)
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
        Index(
            "ix_email_outbox_dispatch",
            "status",
            "priority",
            "next_retry_at",
            "created_at",
        ),
    )


class WhatsAppSession(Base):
    __tablename__ = "whatsapp_sessions"

    id = Column(Integer, primary_key=True, index=True)
    wa_from = Column(String, nullable=False, unique=True, index=True)
    state = Column(String, nullable=False, default="idle", server_default="idle")
    data = Column(GENERIC_JSON_TYPE, nullable=False, default=dict)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class RechargeRequest(Base):
    __tablename__ = "recharge_requests"

    id = Column(Integer, primary_key=True, index=True)
    association_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    association_name = Column(String, nullable=False)
    requester_whatsapp = Column(String, nullable=False)
    requester_profile_name = Column(String, nullable=True)
    requested_cards = Column(Integer, nullable=False)
    notes = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="new", server_default="new")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="recharge_requests")


class AdminUser(Base):
    __tablename__ = "admin_users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    role = Column(Enum(AdminRole), default=AdminRole.ORG_ADMIN)
    org_id = Column(
        Integer, ForeignKey("organizations.id"), nullable=True
    )  # Null for super_admin
    is_active = Column(Boolean, default=True, nullable=False, server_default="1")
    created_at = Column(DateTime, default=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)

    organization = relationship(
        "Organization", back_populates="admins", foreign_keys=[org_id]
    )
    uploaded_shared_documents = relationship(
        "OrganizationSharedDocument",
        back_populates="uploaded_by_admin",
        foreign_keys="OrganizationSharedDocument.uploaded_by_admin_id",
    )


class OrganizationSharedDocument(Base):
    __tablename__ = "organization_shared_documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    kind = Column(String, nullable=False, index=True)
    rel_path = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    mime_type = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=True)
    sha256 = Column(String, nullable=True)
    uploaded_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    uploaded_by_admin = relationship(
        "AdminUser",
        back_populates="uploaded_shared_documents",
        foreign_keys=[uploaded_by_admin_id],
    )
    assignments = relationship(
        "OrganizationSharedDocumentAssignment",
        back_populates="document",
        cascade="all, delete-orphan",
    )


class OrganizationSharedDocumentAssignment(Base):
    __tablename__ = "organization_shared_document_assignments"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(
        Integer, ForeignKey("organization_shared_documents.id"), nullable=False, index=True
    )
    association_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    document = relationship(
        "OrganizationSharedDocument",
        back_populates="assignments",
        foreign_keys=[document_id],
    )
    organization = relationship(
        "Organization",
        back_populates="shared_document_assignments",
        foreign_keys=[association_id],
    )

    __table_args__ = (
        UniqueConstraint(
            "document_id",
            "association_id",
            name="uq_org_shared_document_assignment",
        ),
    )


class CardBatch(Base):
    __tablename__ = "card_batches"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"))
    year = Column(Integer, nullable=False, default=lambda: datetime.utcnow().year)
    start_no = Column(Integer)
    end_no = Column(Integer)
    next_no = Column(Integer)  # Tracks the next available number
    is_enabled = Column(Boolean, default=True, nullable=False, server_default=sa.true())
    notes = Column(Text, nullable=True)
    released_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="batches")


class Member(Base):
    __tablename__ = "members"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"))
    first_name = Column(String)
    last_name = Column(String)
    email = Column(String, index=True)
    phone = Column(String)
    fiscal_code = Column(String)
    birth_date = Column(Date, nullable=True)
    birth_place = Column(String, nullable=True)
    birth_place_code = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    payment_method = Column(SafePaymentMethodType(), nullable=True)
    password_hash = Column(String, nullable=True)
    status = Column(SafeMemberStatusType(), default=MemberStatus.PENDING_DOCS.value)

    card_no = Column(Integer, nullable=True)
    card_year = Column(Integer, nullable=True)
    batch_id = Column(Integer, ForeignKey("card_batches.id"), nullable=True)
    card_email_sent_at = Column(DateTime, nullable=True)
    card_delivered_at = Column(DateTime, nullable=True)
    google_wallet_class_id = Column(String, nullable=True)
    google_wallet_object_id = Column(String, nullable=True)
    google_wallet_added_at = Column(DateTime, nullable=True)
    google_wallet_last_error = Column(Text, nullable=True)
    google_wallet_last_synced_at = Column(DateTime, nullable=True)

    joined_at = Column(DateTime, nullable=True)
    member_type = Column(String, nullable=True)
    internal_notes = Column(Text, nullable=True)
    is_manual = Column(Boolean, default=False, nullable=False, server_default="0")

    accepted_statute_at = Column(DateTime, nullable=True)
    accepted_statute_version = Column(String, nullable=True)

    accepted_privacy_at = Column(DateTime, nullable=True)
    accepted_privacy_version = Column(String, nullable=True)

    signup_source = Column(
        String, nullable=True, server_default=SignupSource.ASSONAM_FORM.value
    )
    external_customer_id = Column(String, nullable=True)

    signup_ip = Column(String, nullable=True)
    signup_user_agent = Column(String, nullable=True)

    decision_at = Column(DateTime, nullable=True)
    decision_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
    decision_notes = Column(Text, nullable=True)

    expired_at = Column(DateTime, nullable=True)
    purged_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)

    organization = relationship("Organization", back_populates="members")
    documents = relationship("MemberDocument", back_populates="member")
    payments = relationship("MemberPayment", back_populates="member")
    tokens = relationship("Token", back_populates="member")
    batch = relationship("CardBatch")

    __table_args__ = (
        UniqueConstraint("org_id", "card_no", name="uix_org_card"),
        UniqueConstraint(
            "org_id",
            "signup_source",
            "external_customer_id",
            name="uix_member_external_source",
        ),
        Index(
            "uq_members_org_year_lower_email_active",
            "org_id",
            "card_year",
            func.lower(email),
            unique=True,
            sqlite_where=and_(
                deleted_at.is_(None), email.isnot(None), card_year.isnot(None)
            ),
            postgresql_where=and_(
                deleted_at.is_(None), email.isnot(None), card_year.isnot(None)
            ),
        ),
        Index("ix_members_card_year_deleted", "card_year", "deleted_at"),
    )


class IntegrationApiKey(Base):
    __tablename__ = "integration_api_keys"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    key_hash = Column(String, nullable=False, index=True)
    scopes = Column(JSON, nullable=False, default=list)
    is_active = Column(Boolean, default=True, nullable=False, server_default="1")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    last_used_ip = Column(String, nullable=True)
    last_used_user_agent = Column(String, nullable=True)

    organization = relationship("Organization", back_populates="integration_api_keys")

    __table_args__ = (
        UniqueConstraint("key_hash", name="uq_integration_api_keys_key_hash"),
    )


class IngestRateLimit(Base):
    __tablename__ = "ingest_rate_limits"

    id = Column(Integer, primary_key=True, index=True)
    org_slug = Column(String, nullable=False, index=True)
    client_ip = Column(String, nullable=False, index=True)
    window_started_at = Column(DateTime, nullable=False)
    request_count = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        UniqueConstraint("org_slug", "client_ip", name="uix_ingest_rate_limits_org_ip"),
    )


class MemberDocument(Base):
    __tablename__ = "member_documents"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id"))
    doc_type = Column(String)  # "identity", "fiscal_code"
    rel_path = Column(String)
    original_filename = Column(String)
    mime_type = Column(String)
    size_bytes = Column(Integer)
    sha256 = Column(String)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    # Using String for SQLite compatibility to avoid Enum lookup issues with manual migration
    status = Column(String, default=DocStatus.PENDING.value)
    review_notes = Column(String, nullable=True)
    rejection_note = Column(Text, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
    reviewed_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
    replaces_document_id = Column(
        Integer, ForeignKey("member_documents.id"), nullable=True
    )

    member = relationship("Member", back_populates="documents")


class MemberPayment(Base):
    __tablename__ = "member_payments"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=False)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
    amount_cents = Column(Integer, nullable=False)
    method = Column(String, nullable=False)  # cash | bank_transfer | other
    paid_at = Column(DateTime, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    member = relationship("Member", back_populates="payments")
    organization = relationship("Organization")
    admin = relationship("AdminUser")


class Token(Base):
    __tablename__ = "tokens"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id"))
    purpose = Column(Enum(TokenType))
    token_hash = Column(String, index=True)
    expires_at = Column(DateTime)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    member = relationship("Member", back_populates="tokens")


class CardMovement(Base):
    __tablename__ = "card_movements"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=True)
    admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
    card_no = Column(Integer, nullable=True)
    delta = Column(Integer, nullable=False)
    reason = Column(String, nullable=False)
    paid_ref = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization")
    member = relationship("Member")
    admin = relationship("AdminUser")


class OrgAdminToken(Base):
    __tablename__ = "org_admin_tokens"

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=False)
    token_hash = Column(String, index=True)
    expires_at = Column(DateTime)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    admin = relationship("AdminUser")


class OnboardingTour(Base):
    __tablename__ = "onboarding_tours"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    role = Column(String, nullable=False)  # "member" | "org_admin"
    tour_key = Column(
        String, nullable=False
    )  # "member_dashboard_v1" | "org_admin_dashboard_v1"
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    skipped_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "role", "tour_key", name="uix_user_role_tour"),
    )


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
    payment_amount_cents = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

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
    normalized_applicant_email = Column(String, nullable=True, index=True)
    applicant_phone = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    normalized_org_name = Column(String, nullable=True, index=True)
    idempotency_key = Column(String(64), nullable=True)

    manual_preferred_date = Column(String, nullable=True)
    manual_preferred_time = Column(String, nullable=True)
    manual_contact = Column(String, nullable=True)

    stripe_checkout_session_id = Column(String, nullable=True, index=True)
    stripe_payment_intent_id = Column(String, nullable=True)
    stripe_last_event_id = Column(String, nullable=True)
    payment_verified_at = Column(DateTime, nullable=True)
    payment_verified_by_admin_id = Column(
        Integer, ForeignKey("admin_users.id"), nullable=True
    )

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
    approved_organization = relationship(
        "Organization",
        back_populates="affiliation_applications",
        foreign_keys=[approved_org_id],
    )
    referral = relationship(
        "Referral",
        back_populates="application",
        uselist=False,
        cascade="all, delete-orphan",
    )


class Referral(Base):
    __tablename__ = "referrals"

    id = Column(Integer, primary_key=True, index=True)
    referrer_org_id = Column(
        Integer,
        ForeignKey("organizations.id"),
        nullable=False,
        index=True,
    )
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
    wheel_result = Column(GENERIC_JSON_TYPE, nullable=True)
    wheel_spun_at = Column(DateTime, nullable=True)
    wheel_spun_by_org_admin_id = Column(
        Integer,
        ForeignKey("admin_users.id"),
        nullable=True,
        index=True,
    )
    super_admin_notified_at = Column(DateTime, nullable=True)

    referrer_organization = relationship(
        "Organization",
        back_populates="sent_referrals",
        foreign_keys=[referrer_org_id],
    )
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

    __table_args__ = (
        UniqueConstraint(
            "application_id",
            "role",
            name="uix_affiliation_people_application_role",
        ),
    )


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
    replaces_document_id = Column(
        Integer, ForeignKey("affiliation_documents.id"), nullable=True
    )
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    application = relationship("AffiliationApplication", back_populates="documents")

    __table_args__ = (
        Index(
            "ix_affiliation_documents_application_doc_type_uploaded",
            "application_id",
            "doc_type",
            "uploaded_at",
        ),
    )


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
