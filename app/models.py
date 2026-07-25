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
    Numeric,
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


class OrganizationPaymentProvider(str, enum.Enum):
    NONE = "none"
    SUMUP = "sumup"


class MembershipPaymentStatus(str, enum.Enum):
    NOT_REQUIRED = "not_required"
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    MANUAL_COMPLETED = "manual_completed"


class MembershipPaymentSource(str, enum.Enum):
    SUMUP = "sumup"
    MANUAL = "manual"


class MembershipPaymentKind(str, enum.Enum):
    INITIAL = "initial"
    RENEWAL = "renewal"


class MembershipType(str, enum.Enum):
    ANNUAL = "annual"
    TEMPORARY = "temporary"


class AnnualMembershipTermStatus(str, enum.Enum):
    DUE = "due"
    PAYMENT_PENDING = "payment_pending"
    APPROVED_WAITING_CARD = "approved_waiting_card"
    PAID_WAITING_CARD = "paid_waiting_card"
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class TemporaryMembershipDurationUnit(str, enum.Enum):
    HOURS = "hours"
    DAYS = "days"


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


class OrgAdminNotificationType(str, enum.Enum):
    DOCUMENT_GENERAL = "document_general"
    DOCUMENT_ACCOUNTING = "document_accounting"
    LOW_CARDS = "low_cards"
    RENEWAL = "renewal"


class MemberNotificationType(str, enum.Enum):
    RENEWAL = "renewal"


class SignupSource(str, enum.Enum):
    ASSONAM_FORM = "assonam_form"
    PIENISSIMO = "pienissimo"
    ADMIN = "admin"


class NumberingScopeType(str, enum.Enum):
    SHARED = "shared"
    DEDICATED = "dedicated"


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
    REGISTRATION_CONTINUATION = "registration_continuation"
    LOGIN_MAGIC_LINK = "login_magic_link"
    PASSWORD_RESET = "password_reset"


class EmailOutboxStatus(str, enum.Enum):
    QUEUED = "queued"
    SENDING = "sending"
    SENT = "sent"
    FAILED = "failed"
    SUPPRESSED = "suppressed"


class WhatsAppWebhookEventStatus(str, enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    PROCESSED = "processed"
    FAILED = "failed"
    SKIPPED = "skipped"


class BookingStatus(str, enum.Enum):
    NEW = "new"
    PENDING = "pending"
    CONFIRMED = "confirmed"
    SEATED = "seated"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


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
    card_style_json = Column(Text, nullable=True)
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
    require_membership_document = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    adults_only_banner_enabled = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    communications_enabled = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    sender_email_local_part = Column(String, nullable=True)
    email_from_name_override = Column(String, nullable=True)
    reply_to_email = Column(String, nullable=True)
    booking_whatsapp_reminder_enabled = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    booking_whatsapp_reminder_hours_before = Column(
        Integer, nullable=False, default=24, server_default="24"
    )
    booking_whatsapp_reminder_template = Column(Text, nullable=True)
    stripe_connected_account_id = Column(String, nullable=True, unique=True)
    stripe_platform_subscription_status = Column(String, nullable=True)
    stripe_platform_subscription_id = Column(String, nullable=True)
    accounting_enabled = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    payment_provider = Column(String, nullable=True)
    payment_required_before_card = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    cash_only_signup_payment = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    membership_payment_label = Column(String, nullable=True)
    membership_fee_amount = Column(Numeric(10, 2), nullable=True)
    temporary_membership_fee_amount = Column(Numeric(10, 2), nullable=True)
    membership_fee_currency = Column(
        String, nullable=False, default="EUR", server_default="EUR"
    )
    custom_membership_types_enabled = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    temporary_membership_duration_value = Column(Integer, nullable=True)
    temporary_membership_duration_unit = Column(String, nullable=True)
    payment_button_label = Column(
        String, nullable=False, default="Paga con carta", server_default="Paga con carta"
    )
    sumup_enabled = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    sumup_api_key_encrypted = Column(Text, nullable=True)
    sumup_api_key_last4 = Column(String, nullable=True)
    sumup_api_key_configured_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    last_low_cards_alert_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)
    numbering_scope_id = Column(
        Integer, ForeignKey("numbering_scopes.id"), nullable=True, index=True
    )

    created_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    numbering_scope = relationship(
        "NumberingScope",
        back_populates="organizations",
        foreign_keys=[numbering_scope_id],
    )
    members = relationship("Member", back_populates="organization")
    batches = relationship("CardBatch", back_populates="organization")
    integration_api_keys = relationship(
        "IntegrationApiKey", back_populates="organization"
    )
    recharge_requests = relationship(
        "RechargeRequest", back_populates="organization"
    )
    member_import_batches = relationship(
        "MemberImportBatch",
        back_populates="organization",
        passive_deletes=True,
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
    membership_payments = relationship("MembershipPayment", back_populates="organization")
    member_notifications = relationship(
        "MemberNotification",
        back_populates="organization",
        foreign_keys="MemberNotification.org_id",
        passive_deletes=True,
    )
    annual_membership_terms = relationship(
        "AnnualMembershipTerm",
        back_populates="organization",
        foreign_keys="AnnualMembershipTerm.org_id",
        passive_deletes=True,
    )
    accounting_folders = relationship(
        "AccountingFolder",
        back_populates="organization",
        foreign_keys="AccountingFolder.org_id",
    )
    accounting_categories = relationship(
        "AccountingCategory",
        back_populates="organization",
        foreign_keys="AccountingCategory.org_id",
    )
    accounting_documents = relationship(
        "AccountingDocument",
        back_populates="organization",
        foreign_keys="AccountingDocument.org_id",
    )
    email_campaigns = relationship(
        "EmailCampaign",
        back_populates="organization",
        foreign_keys="EmailCampaign.association_id",
        cascade="all, delete-orphan",
    )
    email_templates = relationship(
        "EmailTemplate",
        back_populates="organization",
        foreign_keys="EmailTemplate.association_id",
        cascade="all, delete-orphan",
    )
    email_builder_assets = relationship(
        "EmailBuilderAsset",
        back_populates="organization",
        foreign_keys="EmailBuilderAsset.association_id",
        cascade="all, delete-orphan",
    )
    email_campaign_recipients = relationship(
        "EmailCampaignRecipient",
        back_populates="organization",
        foreign_keys="EmailCampaignRecipient.association_id",
    )
    whatsapp_automations = relationship(
        "WhatsAppAutomation",
        back_populates="organization",
        foreign_keys="WhatsAppAutomation.association_id",
        cascade="all, delete-orphan",
    )
    forms = relationship(
        "Form",
        back_populates="organization",
        foreign_keys="Form.association_id",
        cascade="all, delete-orphan",
    )
    form_submissions = relationship(
        "FormSubmission",
        back_populates="organization",
        foreign_keys="FormSubmission.association_id",
    )
    bookings = relationship(
        "Booking",
        back_populates="organization",
        foreign_keys="Booking.association_id",
        cascade="all, delete-orphan",
    )
    booking_event_series = relationship(
        "BookingEventSeries",
        back_populates="organization",
        foreign_keys="BookingEventSeries.association_id",
        cascade="all, delete-orphan",
    )
    rooms = relationship(
        "Room",
        back_populates="organization",
        foreign_keys="Room.association_id",
        cascade="all, delete-orphan",
    )
    room_tables = relationship(
        "RoomTable",
        back_populates="organization",
        foreign_keys="RoomTable.association_id",
        cascade="all, delete-orphan",
    )
    whatsapp_connection = relationship(
        "WhatsAppConnection",
        back_populates="organization",
        foreign_keys="WhatsAppConnection.org_id",
        uselist=False,
        cascade="all, delete-orphan",
    )
    whatsapp_chats = relationship(
        "WhatsAppChat",
        back_populates="organization",
        foreign_keys="WhatsAppChat.org_id",
        cascade="all, delete-orphan",
    )
    whatsapp_messages = relationship(
        "WhatsAppMessage",
        back_populates="organization",
        foreign_keys="WhatsAppMessage.org_id",
        cascade="all, delete-orphan",
    )
    managed_numbering_scopes = relationship(
        "NumberingScope",
        back_populates="owner_organization",
        foreign_keys="NumberingScope.owner_org_id",
    )


class NumberingScope(Base):
    __tablename__ = "numbering_scopes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True, index=True)
    scope_type = Column(String, nullable=False, index=True)
    prefix = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    is_system = Column(
        Boolean, nullable=False, default=False, server_default=sa.false(), index=True
    )
    owner_org_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    organizations = relationship(
        "Organization",
        back_populates="numbering_scope",
        foreign_keys="Organization.numbering_scope_id",
    )
    owner_organization = relationship(
        "Organization",
        back_populates="managed_numbering_scopes",
        foreign_keys=[owner_org_id],
    )
    batches = relationship(
        "CardBatch",
        back_populates="numbering_scope",
        foreign_keys="CardBatch.numbering_scope_id",
    )
    members = relationship(
        "Member",
        back_populates="numbering_scope",
        foreign_keys="Member.numbering_scope_id",
    )


class OperationLog(Base):
    __tablename__ = "operation_logs"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    actor_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
    actor_member_id = Column(Integer, ForeignKey("members.id"), nullable=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    actor_role = Column(String)
    action = Column(String, index=True)
    category = Column(String, nullable=True, index=True)
    outcome = Column(String, nullable=False, default="success", server_default="success", index=True)
    request_id = Column(String(64), nullable=True, index=True)
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


class WhatsAppWebhookEvent(Base):
    __tablename__ = "whatsapp_webhook_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_name = Column(String, nullable=False, index=True)
    instance_name = Column(String, nullable=False, index=True)
    payload_json = Column(GENERIC_JSON_TYPE, nullable=False, default=dict)
    status = Column(
        String,
        nullable=False,
        default=WhatsAppWebhookEventStatus.QUEUED.value,
        server_default=WhatsAppWebhookEventStatus.QUEUED.value,
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
    dedupe_key = Column(String, nullable=False, unique=True, index=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)
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
            "ix_whatsapp_webhook_events_dispatch",
            "status",
            "priority",
            "next_retry_at",
            "created_at",
        ),
    )


class WhatsAppConnection(Base):
    __tablename__ = "whatsapp_connections"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, unique=True, index=True)
    instance_name = Column(String, nullable=False, unique=True, index=True)
    provider = Column(String, nullable=False, default="evolution", server_default="evolution", index=True)
    provider_instance_id = Column(String, nullable=True, index=True)
    provider_token_encrypted = Column(Text, nullable=True)
    provider_api_url = Column(String, nullable=True)
    provider_webhook_secret_hash = Column(String, nullable=True)
    status = Column(String, nullable=False, default="not_connected", server_default="not_connected", index=True)
    phone_number = Column(String, nullable=True)
    profile_name = Column(String, nullable=True)
    qr_code = Column(Text, nullable=True)
    last_error = Column(Text, nullable=True)
    connected_at = Column(DateTime, nullable=True)
    last_event_at = Column(DateTime, nullable=True)
    last_healthcheck_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship(
        "Organization",
        back_populates="whatsapp_connection",
        foreign_keys=[org_id],
    )
    chats = relationship(
        "WhatsAppChat",
        back_populates="connection",
        foreign_keys="WhatsAppChat.connection_id",
        cascade="all, delete-orphan",
    )
    messages = relationship(
        "WhatsAppMessage",
        back_populates="connection",
        foreign_keys="WhatsAppMessage.connection_id",
        cascade="all, delete-orphan",
    )


class WhatsAppChat(Base):
    __tablename__ = "whatsapp_chats"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    connection_id = Column(Integer, ForeignKey("whatsapp_connections.id"), nullable=False, index=True)
    external_chat_id = Column(String, nullable=False, index=True)
    display_name = Column(String, nullable=True)
    last_message_text = Column(Text, nullable=True)
    last_message_at = Column(DateTime, nullable=True, index=True)
    unread_count = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship(
        "Organization",
        back_populates="whatsapp_chats",
        foreign_keys=[org_id],
    )
    connection = relationship(
        "WhatsAppConnection",
        back_populates="chats",
        foreign_keys=[connection_id],
    )
    messages = relationship(
        "WhatsAppMessage",
        back_populates="chat",
        foreign_keys="WhatsAppMessage.chat_id",
        cascade="all, delete-orphan",
        order_by="WhatsAppMessage.created_at.asc(), WhatsAppMessage.id.asc()",
    )

    __table_args__ = (
        UniqueConstraint(
            "connection_id",
            "external_chat_id",
            name="uq_whatsapp_chats_connection_external_chat",
        ),
        Index(
            "ix_whatsapp_chats_connection_last_message_at",
            "connection_id",
            "last_message_at",
        ),
    )


class WhatsAppMessage(Base):
    __tablename__ = "whatsapp_messages"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    connection_id = Column(Integer, ForeignKey("whatsapp_connections.id"), nullable=False, index=True)
    chat_id = Column(Integer, ForeignKey("whatsapp_chats.id"), nullable=False, index=True)
    external_message_id = Column(String, nullable=True, index=True)
    dedupe_key = Column(String, nullable=False, unique=True, index=True)
    direction = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, default="pending", server_default="pending", index=True)
    sender_phone = Column(String, nullable=True)
    recipient_phone = Column(String, nullable=True)
    text_body = Column(Text, nullable=True)
    send_attempts = Column(Integer, nullable=False, default=0, server_default="0")
    next_retry_at = Column(DateTime, nullable=True, index=True)
    last_error = Column(Text, nullable=True)
    fallback_email_to = Column(String, nullable=True)
    fallback_email_subject = Column(String, nullable=True)
    fallback_email_outbox_id = Column(String(36), ForeignKey("email_outbox.id"), nullable=True, index=True)
    sent_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)
    failed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship(
        "Organization",
        back_populates="whatsapp_messages",
        foreign_keys=[org_id],
    )
    connection = relationship(
        "WhatsAppConnection",
        back_populates="messages",
        foreign_keys=[connection_id],
    )
    chat = relationship(
        "WhatsAppChat",
        back_populates="messages",
        foreign_keys=[chat_id],
    )

    __table_args__ = (
        Index(
            "ix_whatsapp_messages_chat_created_at",
            "chat_id",
            "created_at",
        ),
        Index(
            "ix_whatsapp_messages_connection_external_message",
            "connection_id",
            "external_message_id",
        ),
    )


class StripeWebhookEvent(Base):
    __tablename__ = "stripe_webhook_events"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(String, nullable=False, unique=True, index=True)
    event_type = Column(String, nullable=False, index=True)
    livemode = Column(Boolean, nullable=False, default=False, server_default="false")
    processed_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class RechargeRequest(Base):
    __tablename__ = "recharge_requests"

    id = Column(Integer, primary_key=True, index=True)
    association_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    association_name = Column(String, nullable=False)
    requester_whatsapp = Column(String, nullable=False)
    requester_profile_name = Column(String, nullable=True)
    requested_cards = Column(Integer, nullable=False)
    requested_year = Column(
        Integer,
        nullable=False,
        default=lambda: datetime.utcnow().year,
    )
    notes = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="new", server_default="new")
    card_batch_id = Column(Integer, ForeignKey("card_batches.id"), nullable=True, index=True)
    source = Column(
        String,
        nullable=False,
        default="whatsapp",
        server_default="whatsapp",
        index=True,
    )
    requested_by_admin_id = Column(
        Integer,
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    idempotency_key = Column(String(64), nullable=True)
    unit_price_cents = Column(Integer, nullable=False, default=100, server_default="100")
    amount_due_cents = Column(
        Integer,
        nullable=False,
        default=lambda context: int(
            context.get_current_parameters().get("requested_cards") or 0
        )
        * 100,
        server_default="0",
    )
    currency = Column(String(3), nullable=False, default="EUR", server_default="EUR")
    billing_status = Column(
        String,
        nullable=False,
        default="not_applicable",
        server_default="not_applicable",
        index=True,
    )
    paid_at = Column(DateTime, nullable=True)
    paid_by_admin_id = Column(
        Integer,
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    payment_reference = Column(String(160), nullable=True)
    accounting_note = Column(Text, nullable=True)
    accounting_updated_at = Column(DateTime, nullable=True)
    notification_email_outbox_id = Column(
        String(36),
        ForeignKey("email_outbox.id", ondelete="SET NULL"),
        nullable=True,
    )
    super_admin_notified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=sa.func.now(),
    )

    organization = relationship("Organization", back_populates="recharge_requests")
    card_batch = relationship("CardBatch", back_populates="recharge_request")
    requested_by_admin = relationship(
        "AdminUser",
        foreign_keys=[requested_by_admin_id],
    )
    paid_by_admin = relationship(
        "AdminUser",
        foreign_keys=[paid_by_admin_id],
    )
    accounting_events = relationship(
        "RechargeRequestAccountingEvent",
        back_populates="recharge_request",
        cascade="all, delete-orphan",
        order_by="RechargeRequestAccountingEvent.created_at",
    )

    __table_args__ = (
        UniqueConstraint(
            "association_id",
            "idempotency_key",
            name="uq_recharge_requests_org_idempotency_key",
        ),
        sa.CheckConstraint(
            "requested_cards >= 1 AND requested_cards <= 5000",
            name="ck_recharge_requests_requested_cards_range",
        ),
        sa.CheckConstraint(
            "unit_price_cents = 100",
            name="ck_recharge_requests_unit_price_one_euro",
        ),
        sa.CheckConstraint(
            "amount_due_cents = requested_cards * unit_price_cents",
            name="ck_recharge_requests_amount_due",
        ),
        sa.CheckConstraint(
            "currency = 'EUR'",
            name="ck_recharge_requests_currency_eur",
        ),
        sa.CheckConstraint(
            "billing_status IN ('not_applicable', 'unpaid', 'paid')",
            name="ck_recharge_requests_billing_status",
        ),
    )


class RechargeRequestAccountingEvent(Base):
    """Append-only accounting history for card replenishment requests."""

    __tablename__ = "recharge_request_accounting_events"

    id = Column(Integer, primary_key=True, index=True)
    recharge_request_id = Column(
        Integer,
        ForeignKey("recharge_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    actor_admin_id = Column(
        Integer,
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    previous_status = Column(String, nullable=False)
    new_status = Column(String, nullable=False)
    changes_json = Column(GENERIC_JSON_TYPE, nullable=False, default=dict)
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=sa.func.now(),
        index=True,
    )

    recharge_request = relationship(
        "RechargeRequest",
        back_populates="accounting_events",
    )
    actor_admin = relationship("AdminUser", foreign_keys=[actor_admin_id])


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
    uploaded_accounting_documents = relationship(
        "AccountingDocument",
        back_populates="uploaded_by_admin",
        foreign_keys="AccountingDocument.uploaded_by_admin_id",
    )
    created_accounting_share_links = relationship(
        "AccountingShareLink",
        back_populates="created_by_admin",
        foreign_keys="AccountingShareLink.created_by_admin_id",
    )
    notifications = relationship(
        "OrgAdminNotification",
        back_populates="admin_user",
        foreign_keys="OrgAdminNotification.admin_user_id",
        cascade="all, delete-orphan",
    )
    email_campaigns = relationship(
        "EmailCampaign",
        back_populates="created_by_user",
        foreign_keys="EmailCampaign.created_by_user_id",
    )
    email_templates = relationship(
        "EmailTemplate",
        back_populates="created_by_user",
        foreign_keys="EmailTemplate.created_by_user_id",
    )
    whatsapp_automations = relationship(
        "WhatsAppAutomation",
        back_populates="created_by_user",
        foreign_keys="WhatsAppAutomation.created_by_user_id",
    )
    forms = relationship(
        "Form",
        back_populates="created_by_user",
        foreign_keys="Form.created_by_user_id",
    )
    booking_events = relationship(
        "BookingEvent",
        back_populates="created_by_user",
        foreign_keys="BookingEvent.created_by_user_id",
    )
    persistent_sessions = relationship(
        "OrgAdminSession",
        back_populates="admin",
        foreign_keys="OrgAdminSession.admin_id",
        cascade="all, delete-orphan",
    )
    reviewed_form_submissions = relationship(
        "FormSubmission",
        back_populates="reviewed_by_admin",
        foreign_keys="FormSubmission.reviewed_by_admin_id",
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


class AccountingFolder(Base):
    __tablename__ = "accounting_folders"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False, unique=True, index=True)
    year = Column(Integer, nullable=True, index=True)
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    is_default = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    organization = relationship(
        "Organization",
        back_populates="accounting_folders",
        foreign_keys=[org_id],
    )
    documents = relationship(
        "AccountingDocument",
        back_populates="folder",
        foreign_keys="AccountingDocument.folder_id",
    )


class AccountingCategory(Base):
    __tablename__ = "accounting_categories"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    code = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=False)
    is_system = Column(Boolean, nullable=False, default=False, server_default="false")
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    organization = relationship(
        "Organization",
        back_populates="accounting_categories",
        foreign_keys=[org_id],
    )
    documents = relationship(
        "AccountingDocument",
        back_populates="category",
        foreign_keys="AccountingDocument.category_id",
    )


class AccountingDocument(Base):
    __tablename__ = "accounting_documents"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    folder_id = Column(Integer, ForeignKey("accounting_folders.id"), nullable=False, index=True)
    category_id = Column(
        Integer, ForeignKey("accounting_categories.id"), nullable=False, index=True
    )
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    storage_key = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    mime_type = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)
    sha256 = Column(String, nullable=True)
    preview_enabled = Column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    is_share_enabled = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    uploaded_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
    legacy_shared_document_id = Column(
        Integer,
        ForeignKey("organization_shared_documents.id"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    organization = relationship(
        "Organization",
        back_populates="accounting_documents",
        foreign_keys=[org_id],
    )
    folder = relationship(
        "AccountingFolder",
        back_populates="documents",
        foreign_keys=[folder_id],
    )
    category = relationship(
        "AccountingCategory",
        back_populates="documents",
        foreign_keys=[category_id],
    )
    uploaded_by_admin = relationship(
        "AdminUser",
        back_populates="uploaded_accounting_documents",
        foreign_keys=[uploaded_by_admin_id],
    )
    legacy_shared_document = relationship(
        "OrganizationSharedDocument",
        foreign_keys=[legacy_shared_document_id],
    )
    share_links = relationship(
        "AccountingShareLink",
        back_populates="document",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint(
            "legacy_shared_document_id",
            "org_id",
            name="uq_accounting_documents_legacy_shared_org",
        ),
    )


class AccountingShareLink(Base):
    __tablename__ = "accounting_share_links"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(
        Integer, ForeignKey("accounting_documents.id"), nullable=False, index=True
    )
    token = Column(String, nullable=False, unique=True, index=True)
    # New links keep only a verifier at rest. ``token`` remains in place for
    # rolling-deploy and legacy compatibility, but contains the same verifier
    # (never the public bearer) when ``token_version`` is populated.
    token_hash = Column(String(64), nullable=True, unique=True, index=True)
    token_version = Column(Integer, nullable=True)
    expires_at = Column(DateTime, nullable=True, index=True)
    created_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
    revoked_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    document = relationship(
        "AccountingDocument",
        back_populates="share_links",
        foreign_keys=[document_id],
    )
    created_by_admin = relationship(
        "AdminUser",
        back_populates="created_accounting_share_links",
        foreign_keys=[created_by_admin_id],
    )


class OrgAdminNotification(Base):
    __tablename__ = "org_admin_notifications"

    id = Column(Integer, primary_key=True, index=True)
    admin_user_id = Column(Integer, ForeignKey("admin_users.id"), nullable=False, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    type = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    href = Column(String, nullable=False)
    is_read = Column(Boolean, nullable=False, default=False, server_default="false", index=True)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    admin_user = relationship(
        "AdminUser",
        back_populates="notifications",
        foreign_keys=[admin_user_id],
    )
    organization = relationship("Organization", foreign_keys=[org_id])


class MemberNotification(Base):
    """A tenant-scoped, durable notification shown in the member area."""

    __tablename__ = "member_notifications"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(
        Integer,
        ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    org_id = Column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    href = Column(String, nullable=False)
    is_read = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default=sa.false(),
        index=True,
    )
    read_at = Column(DateTime(timezone=True), nullable=True)
    dedupe_key = Column(String(160), nullable=False, unique=True, index=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow_aware,
        server_default=sa.func.now(),
        index=True,
    )

    member = relationship("Member", back_populates="notifications")
    organization = relationship("Organization", back_populates="member_notifications")


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id = Column(Integer, primary_key=True, index=True)
    association_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    is_system = Column(
        Boolean, nullable=False, default=False, server_default="false", index=True
    )
    name = Column(String, nullable=False)
    category = Column(String, nullable=True, index=True)
    template_type = Column(
        String,
        nullable=False,
        default="generic_notice",
        server_default="generic_notice",
        index=True,
    )
    subject = Column(String, nullable=False)
    body_html = Column(Text, nullable=True)
    body_text = Column(Text, nullable=True)
    editor_status = Column(
        String,
        nullable=False,
        default="draft",
        server_default="draft",
        index=True,
    )
    design_json = Column(GENERIC_JSON_TYPE, nullable=True)
    grapesjs_project_json = Column(GENERIC_JSON_TYPE, nullable=True)
    mjml_source = Column(Text, nullable=True)
    compiled_html = Column(Text, nullable=True)
    linked_form_id = Column(Integer, ForeignKey("forms.id"), nullable=True, index=True)
    channel = Column(String, nullable=False, default="email", server_default="email", index=True)
    is_active = Column(
        Boolean, nullable=False, default=True, server_default="true", index=True
    )
    created_by_user_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    organization = relationship(
        "Organization",
        back_populates="email_templates",
        foreign_keys=[association_id],
    )
    created_by_user = relationship(
        "AdminUser",
        back_populates="email_templates",
        foreign_keys=[created_by_user_id],
    )
    linked_form = relationship("Form", foreign_keys=[linked_form_id])
    admin_action_forms = relationship(
        "Form",
        foreign_keys="Form.admin_notification_template_id",
        overlaps="admin_notification_template",
    )
    user_action_forms = relationship(
        "Form",
        foreign_keys="Form.user_confirmation_template_id",
        overlaps="user_confirmation_template",
    )


class EmailCampaign(Base):
    __tablename__ = "email_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    association_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String, nullable=True)
    source_template_id = Column(Integer, ForeignKey("email_templates.id"), nullable=True, index=True)
    # Snapshot of the campaign's communication type.  Keeping it on the
    # campaign (instead of resolving it from the mutable source template at
    # delivery time) makes the promotional/service purpose deterministic for
    # scheduled and already queued messages.
    template_type = Column(
        String,
        nullable=False,
        default="generic_notice",
        server_default="generic_notice",
        index=True,
    )
    subject = Column(String, nullable=False)
    body_html = Column(Text, nullable=True)
    body_text = Column(Text, nullable=True)
    editor_status = Column(
        String,
        nullable=False,
        default="draft",
        server_default="draft",
        index=True,
    )
    design_json = Column(GENERIC_JSON_TYPE, nullable=True)
    grapesjs_project_json = Column(GENERIC_JSON_TYPE, nullable=True)
    mjml_source = Column(Text, nullable=True)
    compiled_html = Column(Text, nullable=True)
    linked_form_id = Column(Integer, ForeignKey("forms.id"), nullable=True, index=True)
    audience_type = Column(String, nullable=False, index=True)
    recipient_mode = Column(
        String, nullable=False, default="all_members", server_default="all_members", index=True
    )
    selected_member_ids_json = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="draft", server_default="draft", index=True)
    created_by_user_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    scheduled_at = Column(DateTime, nullable=True)
    sent_at = Column(DateTime, nullable=True)

    organization = relationship(
        "Organization",
        back_populates="email_campaigns",
        foreign_keys=[association_id],
    )
    created_by_user = relationship(
        "AdminUser",
        back_populates="email_campaigns",
        foreign_keys=[created_by_user_id],
    )
    source_template = relationship("EmailTemplate", foreign_keys=[source_template_id])
    linked_form = relationship("Form", foreign_keys=[linked_form_id])
    recipients = relationship(
        "EmailCampaignRecipient",
        back_populates="campaign",
        cascade="all, delete-orphan",
    )


class EmailCampaignRecipient(Base):
    __tablename__ = "email_campaign_recipients"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("email_campaigns.id"), nullable=False, index=True)
    association_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("members.id"), nullable=True, index=True)
    recipient_email = Column(String, nullable=False, index=True)
    recipient_name = Column(String, nullable=True)
    provider_message_id = Column(Text, nullable=True)
    delivery_status = Column(String, nullable=True, index=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    sent_at = Column(DateTime, nullable=True)

    campaign = relationship(
        "EmailCampaign",
        back_populates="recipients",
        foreign_keys=[campaign_id],
    )
    organization = relationship(
        "Organization",
        back_populates="email_campaign_recipients",
        foreign_keys=[association_id],
    )
    member = relationship("Member", foreign_keys=[user_id])


class EmailBuilderAsset(Base):
    __tablename__ = "email_builder_assets"

    id = Column(Integer, primary_key=True, index=True)
    association_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_by_user_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    file_name = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False, default=0, server_default="0")
    storage_path = Column(Text, nullable=False)
    public_url = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    organization = relationship(
        "Organization",
        back_populates="email_builder_assets",
        foreign_keys=[association_id],
    )
    created_by_user = relationship("AdminUser", foreign_keys=[created_by_user_id])


class WhatsAppAutomation(Base):
    __tablename__ = "whatsapp_automations"

    id = Column(Integer, primary_key=True, index=True)
    association_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    form_id = Column(Integer, ForeignKey("forms.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    source_type = Column(String, nullable=False, default="public_form", server_default="public_form")
    trigger_event = Column(String, nullable=False, default="form_submitted", server_default="form_submitted")
    recipient_type = Column(String, nullable=False, default="submitter", server_default="submitter")
    phone_source = Column(String, nullable=False, default="form_field", server_default="form_field")
    phone_field_key = Column(String, nullable=True)
    custom_phone = Column(String, nullable=True)
    template_name = Column(String, nullable=False)
    template_body = Column(Text, nullable=False)
    is_active = Column(
        Boolean, nullable=False, default=True, server_default="true", index=True
    )
    created_by_user_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    organization = relationship(
        "Organization",
        back_populates="whatsapp_automations",
        foreign_keys=[association_id],
    )
    form = relationship(
        "Form",
        back_populates="whatsapp_automations",
        foreign_keys=[form_id],
    )
    created_by_user = relationship(
        "AdminUser",
        back_populates="whatsapp_automations",
        foreign_keys=[created_by_user_id],
    )


class Form(Base):
    __tablename__ = "forms"

    id = Column(Integer, primary_key=True, index=True)
    association_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    accent_color = Column(String, nullable=True)
    submit_button_text = Column(String, nullable=True)
    show_logo = Column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    cover_image_url = Column(Text, nullable=True)
    page_style = Column(
        String, nullable=False, default="editorial", server_default="editorial"
    )
    public_slug = Column(String, nullable=False, unique=True, index=True)
    is_active = Column(
        Boolean, nullable=False, default=False, server_default="false", index=True
    )
    visibility = Column(
        String, nullable=False, default="public", server_default="public", index=True
    )
    success_message = Column(Text, nullable=True)
    notification_email = Column(String, nullable=True)
    allow_multiple_submissions = Column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    notify_admin_on_submit = Column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    send_user_confirmation = Column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    whatsapp_auto_reply_enabled = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    whatsapp_auto_reply_template = Column(Text, nullable=True)
    whatsapp_confirmation_template = Column(Text, nullable=True)
    whatsapp_rejection_template = Column(Text, nullable=True)
    admin_notification_template_id = Column(
        Integer, ForeignKey("email_templates.id"), nullable=True, index=True
    )
    user_confirmation_template_id = Column(
        Integer, ForeignKey("email_templates.id"), nullable=True, index=True
    )
    create_internal_request = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    create_booking = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    form_type = Column(
        String, nullable=False, default="generic", server_default="generic", index=True
    )
    booking_enabled = Column(
        Boolean, nullable=False, default=False, server_default="false", index=True
    )
    booking_requires_manual_confirmation = Column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    booking_success_message_override = Column(Text, nullable=True)
    booking_notification_enabled = Column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    booking_admin_confirmation_email_enabled = Column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    booking_admin_confirmation_email_subject = Column(String, nullable=True)
    booking_admin_confirmation_email_body = Column(Text, nullable=True)
    booking_auto_assign_enabled = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    booking_field_mapping = Column(GENERIC_JSON_TYPE, nullable=True)
    booking_event_date = Column(Date, nullable=True)
    booking_event_time = Column(String, nullable=True)
    booking_event_details = Column(Text, nullable=True)
    booking_dynamic_events_enabled = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    booking_availability_mode = Column(
        String, nullable=False, default="all", server_default="all"
    )
    booking_event_series_ids = Column(GENERIC_JSON_TYPE, nullable=True)
    font_preset = Column(String, nullable=False, default="classic", server_default="classic")
    survey_post_event_enabled = Column(
        Boolean, nullable=False, default=False, server_default="false", index=True
    )
    survey_post_event_delay_hours = Column(
        Integer, nullable=False, default=2, server_default="2"
    )
    survey_post_event_message_template = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    organization = relationship(
        "Organization",
        back_populates="forms",
        foreign_keys=[association_id],
    )
    created_by_user = relationship(
        "AdminUser",
        back_populates="forms",
        foreign_keys=[created_by_user_id],
    )
    admin_notification_template = relationship(
        "EmailTemplate",
        foreign_keys=[admin_notification_template_id],
        overlaps="admin_action_forms",
    )
    user_confirmation_template = relationship(
        "EmailTemplate",
        foreign_keys=[user_confirmation_template_id],
        overlaps="user_action_forms",
    )
    fields = relationship(
        "FormField",
        back_populates="form",
        cascade="all, delete-orphan",
        order_by="FormField.sort_order.asc(), FormField.id.asc()",
    )
    submissions = relationship(
        "FormSubmission",
        back_populates="form",
        cascade="all, delete-orphan",
        order_by="FormSubmission.submitted_at.desc(), FormSubmission.id.desc()",
    )
    bookings = relationship(
        "Booking",
        back_populates="form",
        cascade="all, delete-orphan",
        order_by="Booking.created_at.desc(), Booking.id.desc()",
    )
    whatsapp_automations = relationship(
        "WhatsAppAutomation",
        back_populates="form",
        foreign_keys="WhatsAppAutomation.form_id",
        cascade="all, delete-orphan",
    )


class FormField(Base):
    __tablename__ = "form_fields"

    id = Column(Integer, primary_key=True, index=True)
    form_id = Column(Integer, ForeignKey("forms.id"), nullable=False, index=True)
    field_key = Column(String, nullable=False)
    field_type = Column(String, nullable=False, index=True)
    label = Column(String, nullable=False)
    placeholder = Column(Text, nullable=True)
    help_text = Column(Text, nullable=True)
    is_required = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    sort_order = Column(Integer, nullable=False, default=0, server_default="0", index=True)
    options_json = Column(GENERIC_JSON_TYPE, nullable=True)

    form = relationship("Form", back_populates="fields", foreign_keys=[form_id])

    __table_args__ = (
        UniqueConstraint("form_id", "field_key", name="uq_form_fields_form_key"),
        Index("ix_form_fields_form_sort", "form_id", "sort_order"),
    )


class FormSubmission(Base):
    __tablename__ = "form_submissions"

    id = Column(Integer, primary_key=True, index=True)
    form_id = Column(Integer, ForeignKey("forms.id"), nullable=False, index=True)
    association_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    submitted_by_user_id = Column(Integer, ForeignKey("members.id"), nullable=True, index=True)
    submitted_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    status = Column(String, nullable=False, default="new", server_default="new", index=True)
    payload_json = Column(GENERIC_JSON_TYPE, nullable=False, default=dict)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True, index=True)
    review_reason = Column(Text, nullable=True)

    form = relationship("Form", back_populates="submissions", foreign_keys=[form_id])
    organization = relationship(
        "Organization",
        back_populates="form_submissions",
        foreign_keys=[association_id],
    )
    member = relationship("Member", back_populates="form_submissions", foreign_keys=[submitted_by_user_id])
    reviewed_by_admin = relationship(
        "AdminUser",
        back_populates="reviewed_form_submissions",
        foreign_keys=[reviewed_by_admin_id],
    )
    bookings = relationship(
        "Booking",
        back_populates="submission",
        foreign_keys="Booking.submission_id",
    )


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    association_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=True, index=True)
    form_id = Column(Integer, ForeignKey("forms.id"), nullable=True, index=True)
    submission_id = Column(Integer, ForeignKey("form_submissions.id"), nullable=True, index=True)
    status = Column(String, nullable=False, default=BookingStatus.NEW.value, server_default=BookingStatus.NEW.value, index=True)
    customer_name = Column(String, nullable=False)
    customer_email = Column(String, nullable=True, index=True)
    customer_phone = Column(String, nullable=True)
    booking_date = Column(Date, nullable=True, index=True)
    booking_time = Column(String, nullable=True, index=True)
    party_size = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=True, index=True)
    table_id = Column(Integer, ForeignKey("room_tables.id"), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    confirmed_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    customer_note = Column(Text, nullable=True)
    customer_note_submitted_at = Column(DateTime, nullable=True)
    customer_note_reviewed_at = Column(DateTime, nullable=True)

    organization = relationship(
        "Organization",
        back_populates="bookings",
        foreign_keys=[association_id],
    )
    member = relationship(
        "Member",
        back_populates="bookings",
        foreign_keys=[member_id],
    )
    form = relationship(
        "Form",
        back_populates="bookings",
        foreign_keys=[form_id],
    )
    submission = relationship(
        "FormSubmission",
        back_populates="bookings",
        foreign_keys=[submission_id],
    )
    room = relationship(
        "Room",
        back_populates="bookings",
        foreign_keys=[room_id],
    )
    table = relationship(
        "RoomTable",
        back_populates="bookings",
        foreign_keys=[table_id],
    )
    events = relationship(
        "BookingEvent",
        back_populates="booking",
        cascade="all, delete-orphan",
        order_by="BookingEvent.created_at.desc(), BookingEvent.id.desc()",
    )
    action_tokens = relationship(
        "BookingActionToken",
        back_populates="booking",
        cascade="all, delete-orphan",
    )


class BookingEvent(Base):
    __tablename__ = "booking_events"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False, index=True)
    event_type = Column(String, nullable=False, index=True)
    payload_json = Column(GENERIC_JSON_TYPE, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    created_by_user_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True, index=True)

    booking = relationship(
        "Booking",
        back_populates="events",
        foreign_keys=[booking_id],
    )
    created_by_user = relationship(
        "AdminUser",
        back_populates="booking_events",
        foreign_keys=[created_by_user_id],
    )


class BookingActionToken(Base):
    __tablename__ = "booking_action_tokens"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False, index=True)
    action = Column(String, nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    used_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    booking = relationship(
        "Booking",
        back_populates="action_tokens",
        foreign_keys=[booking_id],
    )


class BookingEventSeries(Base):
    __tablename__ = "booking_event_series"

    id = Column(Integer, primary_key=True, index=True)
    association_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    recurrence_type = Column(String, nullable=False, default="weekly", server_default="weekly", index=True)
    weekday = Column(Integer, nullable=True, index=True)
    event_date = Column(Date, nullable=True, index=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true", index=True)
    is_default = Column(Boolean, nullable=False, default=False, server_default="false", index=True)
    is_closed = Column(Boolean, nullable=False, default=False, server_default="false", index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship(
        "Organization",
        back_populates="booking_event_series",
        foreign_keys=[association_id],
    )
    time_slots = relationship(
        "BookingEventTimeSlot",
        back_populates="series",
        cascade="all, delete-orphan",
        order_by="BookingEventTimeSlot.sort_order.asc(), BookingEventTimeSlot.id.asc()",
    )

    __table_args__ = (
        Index("ix_booking_event_series_org_active_weekday", "association_id", "is_active", "weekday"),
        Index("ix_booking_event_series_org_active_date", "association_id", "is_active", "event_date"),
    )


class BookingEventTimeSlot(Base):
    __tablename__ = "booking_event_time_slots"

    id = Column(Integer, primary_key=True, index=True)
    series_id = Column(Integer, ForeignKey("booking_event_series.id"), nullable=False, index=True)
    start_time = Column(String, nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true", index=True)
    sort_order = Column(Integer, nullable=False, default=0, server_default="0", index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    series = relationship(
        "BookingEventSeries",
        back_populates="time_slots",
        foreign_keys=[series_id],
    )


class Room(Base):
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, index=True)
    association_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true", index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    organization = relationship(
        "Organization",
        back_populates="rooms",
        foreign_keys=[association_id],
    )
    tables = relationship(
        "RoomTable",
        back_populates="room",
        cascade="all, delete-orphan",
        order_by="RoomTable.name.asc(), RoomTable.id.asc()",
    )
    bookings = relationship(
        "Booking",
        back_populates="room",
        foreign_keys="Booking.room_id",
    )


class RoomTable(Base):
    __tablename__ = "room_tables"

    id = Column(Integer, primary_key=True, index=True)
    association_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    capacity = Column(Integer, nullable=False, default=2, server_default="2")
    shape = Column(String, nullable=False, default="round", server_default="round")
    pos_x = Column(Integer, nullable=False, default=80, server_default="80")
    pos_y = Column(Integer, nullable=False, default=80, server_default="80")
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true", index=True)
    is_out_of_service = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
        index=True,
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    organization = relationship(
        "Organization",
        back_populates="room_tables",
        foreign_keys=[association_id],
    )
    room = relationship(
        "Room",
        back_populates="tables",
        foreign_keys=[room_id],
    )
    bookings = relationship(
        "Booking",
        back_populates="table",
        foreign_keys="Booking.table_id",
    )

    __table_args__ = (
        UniqueConstraint("room_id", "name", name="uq_room_tables_room_name"),
    )


class CardBatch(Base):
    __tablename__ = "card_batches"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"))
    numbering_scope_id = Column(
        Integer, ForeignKey("numbering_scopes.id"), nullable=True, index=True
    )
    year = Column(Integer, nullable=False, default=lambda: datetime.utcnow().year)
    start_no = Column(Integer)
    end_no = Column(Integer)
    next_no = Column(Integer)  # Tracks the next available number
    is_enabled = Column(Boolean, default=True, nullable=False, server_default=sa.true())
    notes = Column(Text, nullable=True)
    released_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="batches")
    numbering_scope = relationship(
        "NumberingScope",
        back_populates="batches",
        foreign_keys=[numbering_scope_id],
    )
    recharge_request = relationship(
        "RechargeRequest",
        back_populates="card_batch",
        uselist=False,
    )


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
    payment_required = Column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    payment_status = Column(
        String,
        nullable=False,
        default=MembershipPaymentStatus.NOT_REQUIRED.value,
        server_default=MembershipPaymentStatus.NOT_REQUIRED.value,
        index=True,
    )
    payment_completed_at = Column(DateTime(timezone=True), nullable=True)
    password_hash = Column(String, nullable=True)
    status = Column(SafeMemberStatusType(), default=MemberStatus.PENDING_DOCS.value)

    card_no = Column(Integer, nullable=True)
    card_year = Column(Integer, nullable=True)
    membership_type = Column(String, nullable=True)
    valid_from = Column(DateTime, nullable=True)
    valid_until = Column(DateTime, nullable=True, index=True)
    membership_fee_snapshot = Column(Numeric(10, 2), nullable=True)
    batch_id = Column(Integer, ForeignKey("card_batches.id"), nullable=True)
    numbering_scope_id = Column(
        Integer, ForeignKey("numbering_scopes.id"), nullable=True, index=True
    )
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
    card_is_paid = Column(Boolean, nullable=False, default=False, server_default="0")
    card_paid_at = Column(DateTime(timezone=True), nullable=True)
    card_payment_status = Column(String, nullable=True)

    accepted_statute_at = Column(DateTime, nullable=True)
    accepted_statute_version = Column(String, nullable=True)

    accepted_privacy_at = Column(DateTime, nullable=True)
    accepted_privacy_version = Column(String, nullable=True)
    # Immutable evidence for the platform notice rendered at acknowledgement.
    # The association-specific version above remains separate because the two
    # controllers/notices can evolve independently.
    accepted_privacy_notice_version = Column(String(length=32), nullable=True)
    accepted_privacy_notice_sha256 = Column(String(length=64), nullable=True)

    # Optional, purpose-specific consent. It is intentionally independent
    # from the mandatory privacy-notice acknowledgement above.
    marketing_email_consent = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default=sa.false(),
        index=True,
    )
    marketing_email_consent_at = Column(DateTime(timezone=True), nullable=True)
    marketing_email_consent_withdrawn_at = Column(DateTime(timezone=True), nullable=True)
    marketing_email_consent_version = Column(String(length=32), nullable=True)

    signup_source = Column(
        String, nullable=True, server_default=SignupSource.ASSONAM_FORM.value
    )
    import_batch_id = Column(
        Integer,
        ForeignKey("member_import_batches.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
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
    numbering_scope = relationship(
        "NumberingScope",
        back_populates="members",
        foreign_keys=[numbering_scope_id],
    )
    documents = relationship("MemberDocument", back_populates="member")
    payments = relationship("MemberPayment", back_populates="member")
    membership_payments = relationship("MembershipPayment", back_populates="member")
    annual_membership_terms = relationship(
        "AnnualMembershipTerm",
        back_populates="member",
        foreign_keys="AnnualMembershipTerm.member_id",
        order_by="AnnualMembershipTerm.membership_year.desc()",
        passive_deletes=True,
    )
    contact_changes = relationship(
        "MemberContactChange",
        back_populates="member",
        foreign_keys="MemberContactChange.member_id",
        passive_deletes=True,
        order_by="MemberContactChange.created_at.desc()",
    )
    notifications = relationship(
        "MemberNotification",
        back_populates="member",
        foreign_keys="MemberNotification.member_id",
        passive_deletes=True,
    )
    tokens = relationship("Token", back_populates="member")
    batch = relationship("CardBatch")
    import_batch = relationship(
        "MemberImportBatch",
        back_populates="members",
        foreign_keys=[import_batch_id],
    )
    form_submissions = relationship(
        "FormSubmission",
        back_populates="member",
        foreign_keys="FormSubmission.submitted_by_user_id",
    )
    bookings = relationship(
        "Booking",
        back_populates="member",
        foreign_keys="Booking.member_id",
    )

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


class AnnualMembershipTerm(Base):
    """Authoritative, non-destructive history for one annual membership card."""

    __tablename__ = "annual_membership_terms"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(
        Integer,
        ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    org_id = Column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    membership_year = Column(Integer, nullable=False, index=True)
    starts_on = Column(Date, nullable=False)
    valid_through = Column(Date, nullable=False, index=True)
    status = Column(
        String,
        nullable=False,
        default=AnnualMembershipTermStatus.ACTIVE.value,
        server_default=AnnualMembershipTermStatus.ACTIVE.value,
        index=True,
    )
    fee_amount = Column(Numeric(10, 2), nullable=True)
    currency = Column(String, nullable=False, default="EUR", server_default="EUR")
    card_no = Column(Integer, nullable=True)
    card_year = Column(Integer, nullable=True)
    batch_id = Column(
        Integer,
        ForeignKey("card_batches.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    numbering_scope_id = Column(
        Integer,
        ForeignKey("numbering_scopes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    issued_at = Column(DateTime(timezone=True), nullable=True)
    activated_at = Column(DateTime(timezone=True), nullable=True)
    deactivated_at = Column(DateTime(timezone=True), nullable=True)
    source = Column(String, nullable=True)
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

    member = relationship("Member", back_populates="annual_membership_terms")
    organization = relationship("Organization", back_populates="annual_membership_terms")
    card_batch = relationship("CardBatch", foreign_keys=[batch_id])
    numbering_scope = relationship("NumberingScope", foreign_keys=[numbering_scope_id])
    membership_payments = relationship(
        "MembershipPayment",
        back_populates="annual_term",
        foreign_keys="MembershipPayment.annual_term_id",
    )

    __table_args__ = (
        UniqueConstraint(
            "member_id",
            "membership_year",
            name="uq_annual_membership_terms_member_year",
        ),
        Index(
            "uq_annual_membership_terms_active_org_year_card",
            "org_id",
            "card_year",
            "card_no",
            unique=True,
            sqlite_where=status.notin_(
                (
                    AnnualMembershipTermStatus.EXPIRED.value,
                    AnnualMembershipTermStatus.CANCELLED.value,
                )
            ),
            postgresql_where=status.notin_(
                (
                    AnnualMembershipTermStatus.EXPIRED.value,
                    AnnualMembershipTermStatus.CANCELLED.value,
                )
            ),
        ),
        Index(
            "ix_annual_membership_terms_org_year_status",
            "org_id",
            "membership_year",
            "status",
        ),
    )


class AnnualCardDeactivationRun(Base):
    """Immutable receipt used to make global annual deactivation idempotent."""

    __tablename__ = "annual_card_deactivation_runs"

    id = Column(Integer, primary_key=True, index=True)
    membership_year = Column(Integer, nullable=False, index=True)
    valid_through = Column(Date, nullable=False)
    preview_hash = Column(String(length=64), nullable=False, unique=True, index=True)
    deactivated_count = Column(Integer, nullable=False, default=0, server_default="0")
    term_ids_json = Column(GENERIC_JSON_TYPE, nullable=False, default=list)
    actor_admin_id = Column(
        Integer,
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    executed_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow_aware,
        server_default=sa.func.now(),
    )

    actor_admin = relationship("AdminUser", foreign_keys=[actor_admin_id])


class MemberContactChange(Base):
    """Short-lived, encrypted verification request for email or phone changes."""

    __tablename__ = "member_contact_changes"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(
        Integer,
        ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    org_id = Column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    field = Column(String(length=16), nullable=False, index=True)
    new_value_encrypted = Column(Text, nullable=False)
    token_hash = Column(String(length=64), nullable=False, unique=True, index=True)
    authorization_token_hash = Column(
        String(length=64), nullable=True, unique=True, index=True
    )
    status = Column(String(length=16), nullable=False, default="pending", server_default="pending", index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    authorized_at = Column(DateTime, nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    requested_ip_hash = Column(String(length=64), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    member = relationship("Member", back_populates="contact_changes")
    organization = relationship("Organization", foreign_keys=[org_id])

    __table_args__ = (
        Index(
            "ix_member_contact_changes_member_field_status",
            "member_id",
            "field",
            "status",
        ),
    )


class MarketingConsentEvent(Base):
    """Append-only, pseudonymized proof of email-marketing preference changes."""

    __tablename__ = "marketing_consent_events"

    id = Column(Integer, primary_key=True, index=True)
    association_id = Column(Integer, nullable=False, index=True)
    subject_ref_hash = Column(String(length=64), nullable=False, index=True)
    email_hash = Column(String(length=64), nullable=False, index=True)
    channel = Column(
        String(length=16), nullable=False, default="email", server_default="email"
    )
    event_action = Column(String(length=16), nullable=False, index=True)
    notice_version = Column(String(length=32), nullable=False)
    source = Column(String(length=64), nullable=False)
    ip_hash = Column(String(length=64), nullable=True)
    user_agent_hash = Column(String(length=64), nullable=True)
    proof_version = Column(
        String(length=32),
        nullable=False,
        default="hmac-sha256-v1",
        server_default="hmac-sha256-v1",
    )
    occurred_at = Column(
        DateTime(timezone=True), nullable=False, default=utcnow_aware, index=True
    )

    __table_args__ = (
        Index(
            "ix_marketing_consent_events_org_action_time",
            "association_id",
            "event_action",
            "occurred_at",
        ),
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


class MemberAttendance(Base):
    __tablename__ = "member_attendances"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    member_id = Column(
        Integer,
        ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    checked_in_by_admin_id = Column(
        Integer,
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    card_no = Column(Integer, nullable=False)
    card_year = Column(Integer, nullable=False)
    attendance_date = Column(Date, nullable=False, index=True)
    membership_type = Column(String, nullable=False)
    source = Column(
        String,
        nullable=False,
        default="qr",
        server_default="qr",
    )
    checked_in_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=sa.func.now(),
        index=True,
    )

    member = relationship("Member")
    organization = relationship("Organization")
    checked_in_by_admin = relationship("AdminUser")

    __table_args__ = (
        UniqueConstraint(
            "org_id",
            "member_id",
            "attendance_date",
            name="uq_member_attendance_org_member_day",
        ),
        Index(
            "ix_member_attendances_org_checked_in",
            "org_id",
            "attendance_date",
            "checked_in_at",
        ),
        Index(
            "ix_member_attendances_org_member_checked_in",
            "org_id",
            "member_id",
            "checked_in_at",
        ),
    )


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


class MembershipPayment(Base):
    __tablename__ = "membership_payments"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    socio_id = Column(Integer, ForeignKey("members.id"), nullable=True, index=True)
    annual_term_id = Column(
        Integer,
        ForeignKey("annual_membership_terms.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    membership_year = Column(Integer, nullable=True, index=True)
    payment_kind = Column(
        String,
        nullable=False,
        default=MembershipPaymentKind.INITIAL.value,
        server_default=MembershipPaymentKind.INITIAL.value,
        index=True,
    )
    application_id = Column(Integer, nullable=True, index=True)
    provider = Column(
        String,
        nullable=False,
        default=OrganizationPaymentProvider.SUMUP.value,
        server_default=OrganizationPaymentProvider.SUMUP.value,
    )
    payment_reason = Column(String, nullable=True)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String, nullable=False, default="EUR", server_default="EUR")
    status = Column(String, nullable=False, index=True)
    source = Column(String, nullable=False, index=True)
    checkout_reference = Column(String, nullable=True, unique=True)
    sumup_checkout_id = Column(String, nullable=True, index=True)
    hosted_checkout_url = Column(Text, nullable=True)
    raw_create_response = Column(GENERIC_JSON_TYPE, nullable=True)
    raw_last_status_response = Column(GENERIC_JSON_TYPE, nullable=True)
    # Capability used by the public checkout-result poller.  Only the keyed
    # hash is persisted; the raw value lives in an HttpOnly, path-scoped
    # browser cookie.
    status_token_hash = Column(String, nullable=True, index=True)
    status_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    manual_marked_paid_by_user_id = Column(
        Integer, ForeignKey("admin_users.id"), nullable=True
    )
    notes = Column(Text, nullable=True)
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

    organization = relationship("Organization", back_populates="membership_payments")
    member = relationship("Member", back_populates="membership_payments")
    annual_term = relationship(
        "AnnualMembershipTerm",
        back_populates="membership_payments",
        foreign_keys=[annual_term_id],
    )
    manual_marked_paid_by = relationship("AdminUser")

    __table_args__ = (
        Index("ix_membership_payments_org_member_status", "org_id", "socio_id", "status"),
        Index(
            "ix_membership_payments_term_status",
            "annual_term_id",
            "status",
        ),
    )


class MemberImportBatch(Base):
    __tablename__ = "member_import_batches"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_admin_id = Column(
        Integer,
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    file_sha256 = Column(String(length=64), nullable=False, index=True)
    delimiter = Column(String(length=1), nullable=False)
    status = Column(String(length=24), nullable=False, default="previewed", server_default="previewed", index=True)
    total_rows = Column(Integer, nullable=False, default=0, server_default="0")
    valid_rows = Column(Integer, nullable=False, default=0, server_default="0")
    error_rows = Column(Integer, nullable=False, default=0, server_default="0")
    imported_rows = Column(Integer, nullable=False, default=0, server_default="0")
    activation_mode = Column(String(length=24), nullable=True)
    commit_policy = Column(String(length=24), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    committed_at = Column(DateTime, nullable=True)
    rolled_back_at = Column(DateTime, nullable=True)

    organization = relationship("Organization", back_populates="member_import_batches")
    created_by_admin = relationship("AdminUser", foreign_keys=[created_by_admin_id])
    rows = relationship(
        "MemberImportRow",
        back_populates="batch",
        passive_deletes=True,
        order_by="MemberImportRow.row_number.asc()",
    )
    members = relationship(
        "Member",
        back_populates="import_batch",
        foreign_keys="Member.import_batch_id",
    )


class MemberImportRow(Base):
    __tablename__ = "member_import_rows"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(
        Integer,
        ForeignKey("member_import_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    row_number = Column(Integer, nullable=False)
    payload_encrypted = Column(Text, nullable=False)
    row_sha256 = Column(String(length=64), nullable=False)
    errors_json = Column(GENERIC_JSON_TYPE, nullable=False, default=list)
    status = Column(String(length=24), nullable=False, default="valid", server_default="valid", index=True)
    member_id = Column(
        Integer,
        ForeignKey("members.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    batch = relationship("MemberImportBatch", back_populates="rows")
    member = relationship("Member", foreign_keys=[member_id])

    __table_args__ = (
        UniqueConstraint("batch_id", "row_number", name="uq_member_import_rows_batch_row"),
    )


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


class OrgAdminSession(Base):
    __tablename__ = "org_admin_sessions"

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_seen_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    user_agent = Column(String(512), nullable=True)
    ip_hash = Column(String(64), nullable=True)
    mfa_verified_at = Column(DateTime, nullable=True, index=True)
    # A dedicated, short-lived first-factor step-up used only while enrolling
    # optional MFA.  Keeping it separate from ``mfa_verified_at`` avoids
    # representing an email verification as a completed second factor.
    mfa_setup_authorized_at = Column(DateTime, nullable=True)

    admin = relationship(
        "AdminUser",
        back_populates="persistent_sessions",
        foreign_keys=[admin_id],
    )


class AdminMfaFactor(Base):
    """Encrypted TOTP factor for a privileged administrator."""

    __tablename__ = "admin_mfa_factors"

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(
        Integer,
        ForeignKey("admin_users.id"),
        nullable=False,
        unique=True,
        index=True,
    )
    factor_type = Column(String, nullable=False, default="totp", server_default="totp")
    status = Column(String, nullable=False, default="pending", server_default="pending", index=True)
    secret_encrypted = Column(Text, nullable=False)
    last_used_timestep = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    activated_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    admin = relationship("AdminUser", foreign_keys=[admin_id])


class AdminRecoveryCode(Base):
    __tablename__ = "admin_recovery_codes"

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=False, index=True)
    code_hash = Column(String(64), nullable=False, index=True)
    used_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    admin = relationship("AdminUser", foreign_keys=[admin_id])

    __table_args__ = (
        UniqueConstraint("admin_id", "code_hash", name="uq_admin_recovery_code_hash"),
    )


class SuperAdminSession(Base):
    __tablename__ = "super_admin_sessions"

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_seen_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    idle_expires_at = Column(DateTime, nullable=False, index=True)
    absolute_expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True, index=True)
    mfa_verified_at = Column(DateTime, nullable=True, index=True)
    user_agent = Column(String(512), nullable=True)
    ip_hash = Column(String(64), nullable=True)

    admin = relationship("AdminUser", foreign_keys=[admin_id])


class AdminAuthChallenge(Base):
    __tablename__ = "admin_auth_challenges"

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    purpose = Column(String, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    attempts = Column(Integer, nullable=False, default=0, server_default="0")
    max_attempts = Column(Integer, nullable=False, default=5, server_default="5")
    consumed_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    admin = relationship("AdminUser", foreign_keys=[admin_id])


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
    # New affiliation links persist only a keyed hash. ``public_token`` stays
    # for backwards compatibility with already-issued plaintext capabilities.
    public_token_hash = Column(String(64), nullable=True, unique=True, index=True)
    public_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    public_token_version = Column(Integer, nullable=True)

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
