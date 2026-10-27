"""One authorized filter/order definition for the member list and bulk selection."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import case, or_
from sqlalchemy.orm import Session

from app.models import DocStatus, Member, MemberDocument, MemberStatus
from app.services.member_activity import member_active_filters, member_expired_filters


def build_org_member_query(
    db: Session,
    *,
    org_id: int,
    status: str | None = None,
    access: str | None = None,
    source: str | None = None,
    docs: str | None = None,
    order: str | None = None,
    now: datetime | None = None,
):
    current_time = now or datetime.utcnow()
    status_filter = (status or "").strip().lower()
    query = db.query(Member).filter(Member.org_id == org_id)
    if status_filter == "deleted":
        query = query.filter(Member.deleted_at.isnot(None))
    elif status_filter != "all":
        query = query.filter(Member.deleted_at.is_(None))
    if status_filter in {"", "active", "pending"}:
        query = query.filter(Member.status.notin_([MemberStatus.REJECTED, MemberStatus.EXPIRED]))
    if status_filter == "active":
        query = query.filter(*member_active_filters(now=current_time))
    elif status_filter == "pending":
        query = query.filter(Member.status.in_([MemberStatus.PENDING_VERIFICATION, MemberStatus.PENDING_DOCS, MemberStatus.PENDING_CARDS]))
    elif status_filter in {"suspended", "rejected"}:
        query = query.filter(Member.status == MemberStatus.REJECTED)
    elif status_filter == "expired":
        query = query.filter(*member_expired_filters(now=current_time))
    elif status_filter and status_filter != "all":
        query = query.filter(Member.status == status)
    if access == "with":
        query = query.filter(Member.password_hash.isnot(None))
    elif access == "without":
        query = query.filter(Member.password_hash.is_(None))
    if source == "manual":
        query = query.filter(Member.is_manual.is_(True))
    elif source == "online":
        query = query.filter(or_(Member.is_manual.is_(False), Member.is_manual.is_(None)))
    pending_statuses = [DocStatus.PENDING.value, DocStatus.UPLOADED.value]
    documents = db.query(MemberDocument.id).filter(MemberDocument.member_id == Member.id)
    if docs == "pending":
        query = query.filter(documents.filter(MemberDocument.status.in_(pending_statuses)).exists())
    elif docs == "rejected":
        query = query.filter(documents.filter(MemberDocument.status == DocStatus.REJECTED.value).exists())
    elif docs == "approved":
        query = query.filter(
            documents.exists(),
            ~documents.filter(MemberDocument.status.in_(pending_statuses + [DocStatus.REJECTED.value])).exists(),
        )
    status_rank = case(
        (Member.status == MemberStatus.ACTIVE, 1),
        (Member.status == MemberStatus.PENDING_VERIFICATION, 2),
        (Member.status == MemberStatus.PENDING_DOCS, 3),
        (Member.status == MemberStatus.PENDING_CARDS, 4),
        (Member.status == MemberStatus.REJECTED, 5),
        else_=9,
    )
    order_key = (order or "joined_at_desc").lower()
    if order_key == "joined_at_asc":
        query = query.order_by(Member.joined_at.is_(None), Member.joined_at.asc())
    elif order_key == "last_name_asc":
        query = query.order_by(Member.last_name.asc(), Member.first_name.asc())
    elif order_key == "last_name_desc":
        query = query.order_by(Member.last_name.desc(), Member.first_name.desc())
    elif order_key == "status_asc":
        query = query.order_by(status_rank.asc(), Member.last_name.asc())
    elif order_key == "status_desc":
        query = query.order_by(status_rank.desc(), Member.last_name.asc())
    else:
        query = query.order_by(Member.joined_at.is_(None), Member.joined_at.desc())
    return query.order_by(Member.id.asc())
