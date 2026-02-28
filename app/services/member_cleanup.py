from __future__ import annotations

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.models import CardMovement, Member, MemberDocument, MemberPayment, OperationLog, Token
from app.services.card_allocation import release_card_number


def _normalize_email(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip().lower()
    return cleaned or None


def _normalize_fiscal_code(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip().upper()
    return cleaned or None


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def purge_deleted_member_identifiers(member: Member) -> bool:
    """Remove reusable identifiers from a soft-deleted member row."""
    changed = False
    fields_to_clear = (
        "email",
        "phone",
        "fiscal_code",
        "birth_date",
        "birth_place",
        "birth_place_code",
        "gender",
        "password_hash",
        "card_no",
        "card_year",
        "batch_id",
        "external_customer_id",
        "signup_ip",
        "signup_user_agent",
    )
    for field_name in fields_to_clear:
        if getattr(member, field_name) is not None:
            setattr(member, field_name, None)
            changed = True
    return changed


def cleanup_deleted_member_traces(
    db: Session,
    *,
    org_id: int | None = None,
    email: str | None = None,
    fiscal_code: str | None = None,
    signup_source: str | None = None,
    external_customer_id: str | None = None,
) -> int:
    """
    Purge stale identifiers from soft-deleted members.

    If no filters are provided, all soft-deleted members are sanitized.
    """
    query = db.query(Member).filter(Member.deleted_at.isnot(None))
    if org_id is not None:
        query = query.filter(Member.org_id == org_id)

    filters = []
    normalized_email = _normalize_email(email)
    if normalized_email:
        filters.append(func.lower(Member.email) == normalized_email)

    normalized_fiscal_code = _normalize_fiscal_code(fiscal_code)
    if normalized_fiscal_code:
        filters.append(func.upper(Member.fiscal_code) == normalized_fiscal_code)

    normalized_signup_source = _normalize_text(signup_source)
    normalized_external_customer_id = _normalize_text(external_customer_id)
    if normalized_signup_source and normalized_external_customer_id:
        filters.append(
            and_(
                Member.signup_source == normalized_signup_source,
                Member.external_customer_id == normalized_external_customer_id,
            )
        )

    if filters:
        query = query.filter(or_(*filters))

    candidates = query.all()
    cleaned = 0
    for member in candidates:
        release_card_number(
            db,
            org_id=member.org_id,
            year=member.card_year,
            card_no=member.card_no,
            batch_id=member.batch_id,
        )
        if purge_deleted_member_identifiers(member):
            cleaned += 1

    if cleaned:
        db.flush()
    return cleaned


def purge_deleted_members_permanently(
    db: Session,
    *,
    org_id: int | None = None,
    email: str | None = None,
    fiscal_code: str | None = None,
    signup_source: str | None = None,
    external_customer_id: str | None = None,
) -> int:
    """
    Hard-delete soft-deleted members and FK-linked rows.

    This is intended to remove residual rows that should not remain visible in DB.
    """
    query = db.query(Member).filter(Member.deleted_at.isnot(None))
    if org_id is not None:
        query = query.filter(Member.org_id == org_id)

    filters = []
    normalized_email = _normalize_email(email)
    if normalized_email:
        filters.append(func.lower(Member.email) == normalized_email)

    normalized_fiscal_code = _normalize_fiscal_code(fiscal_code)
    if normalized_fiscal_code:
        filters.append(func.upper(Member.fiscal_code) == normalized_fiscal_code)

    normalized_signup_source = _normalize_text(signup_source)
    normalized_external_customer_id = _normalize_text(external_customer_id)
    if normalized_signup_source and normalized_external_customer_id:
        filters.append(
            and_(
                Member.signup_source == normalized_signup_source,
                Member.external_customer_id == normalized_external_customer_id,
            )
        )

    if filters:
        query = query.filter(or_(*filters))

    members = query.all()
    if not members:
        return 0

    member_ids = [member.id for member in members]

    db.query(OperationLog).filter(OperationLog.actor_member_id.in_(member_ids)).update(
        {OperationLog.actor_member_id: None},
        synchronize_session=False,
    )
    db.query(CardMovement).filter(CardMovement.member_id.in_(member_ids)).update(
        {CardMovement.member_id: None},
        synchronize_session=False,
    )
    db.query(Token).filter(Token.member_id.in_(member_ids)).delete(synchronize_session=False)
    doc_ids = [
        doc_id
        for (doc_id,) in db.query(MemberDocument.id).filter(MemberDocument.member_id.in_(member_ids)).all()
    ]
    if doc_ids:
        db.query(MemberDocument).filter(MemberDocument.replaces_document_id.in_(doc_ids)).update(
            {MemberDocument.replaces_document_id: None},
            synchronize_session=False,
        )
    db.query(MemberDocument).filter(MemberDocument.member_id.in_(member_ids)).delete(
        synchronize_session=False
    )
    db.query(MemberPayment).filter(MemberPayment.member_id.in_(member_ids)).delete(
        synchronize_session=False
    )
    db.query(Member).filter(Member.id.in_(member_ids)).delete(synchronize_session=False)
    db.flush()
    return len(member_ids)
