from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Enum, UniqueConstraint, Text, JSON, TypeDecorator
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from .db import Base

class MemberStatus(str, enum.Enum):
    PENDING_VERIFICATION = "pending_verification"
    PENDING_DOCS = "pending_docs"
    PENDING_CARDS = "pending_cards"
    ACTIVE = "active"
    REJECTED = "rejected"

class SafeMemberStatusType(TypeDecorator):
    """Stores MemberStatus as plain strings; normalises legacy uppercase values on read."""
    impl = String
    cache_ok = True

    _LEGACY_MAP = {e.name: e.value for e in MemberStatus}   # e.g. "PENDING_DOCS" -> "pending_docs"

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


class DocStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class AdminRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    ORG_ADMIN = "org_admin"

class TokenType(str, enum.Enum):
    SIGNUP_CONTINUE = "signup_continue"
    LOGIN_MAGIC_LINK = "login_magic_link"

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    slug = Column(String, unique=True, index=True)
    statute_version = Column(String)
    statute_pdf_path = Column(String, nullable=True) # Path relative to static or uploads
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
    website = Column(String, nullable=True)
    logo_path = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

    created_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    members = relationship("Member", back_populates="organization")
    batches = relationship("CardBatch", back_populates="organization")
    admins = relationship("AdminUser", back_populates="organization", foreign_keys="AdminUser.org_id")

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

class AdminUser(Base):
    __tablename__ = "admin_users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    role = Column(Enum(AdminRole), default=AdminRole.ORG_ADMIN)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=True) # Null for super_admin
    is_active = Column(Boolean, default=True, nullable=False, server_default="1")
    created_at = Column(DateTime, default=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)

    organization = relationship("Organization", back_populates="admins", foreign_keys=[org_id])

class CardBatch(Base):
    __tablename__ = "card_batches"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"))
    start_no = Column(Integer)
    end_no = Column(Integer)
    next_no = Column(Integer) # Tracks the next available number
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
    password_hash = Column(String, nullable=True)
    status = Column(SafeMemberStatusType(), default=MemberStatus.PENDING_DOCS.value)

    card_no = Column(Integer, nullable=True)
    batch_id = Column(Integer, ForeignKey("card_batches.id"), nullable=True)

    joined_at = Column(DateTime, nullable=True)
    member_type = Column(String, nullable=True)
    internal_notes = Column(Text, nullable=True)
    is_manual = Column(Boolean, default=False, nullable=False, server_default="0")

    accepted_statute_at = Column(DateTime, nullable=True)
    accepted_statute_version = Column(String, nullable=True)

    accepted_privacy_at = Column(DateTime, nullable=True)
    accepted_privacy_version = Column(String, nullable=True)

    signup_ip = Column(String, nullable=True)
    signup_user_agent = Column(String, nullable=True)

    decision_at = Column(DateTime, nullable=True)
    decision_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
    decision_notes = Column(Text, nullable=True)

    deleted_at = Column(DateTime, nullable=True)
    deleted_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)

    organization = relationship("Organization", back_populates="members")
    documents = relationship("MemberDocument", back_populates="member")
    payments = relationship("MemberPayment", back_populates="member")
    tokens = relationship("Token", back_populates="member")
    batch = relationship("CardBatch")

    __table_args__ = (
        UniqueConstraint('org_id', 'card_no', name='uix_org_card'),
    )

class MemberDocument(Base):
    __tablename__ = "member_documents"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id"))
    doc_type = Column(String) # "identity", "fiscal_code"
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
    replaces_document_id = Column(Integer, ForeignKey("member_documents.id"), nullable=True)

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
    tour_key = Column(String, nullable=False)  # "member_dashboard_v1" | "org_admin_dashboard_v1"
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    skipped_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "role", "tour_key", name="uix_user_role_tour"),
    )
