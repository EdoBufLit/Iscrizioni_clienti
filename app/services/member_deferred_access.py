"""Queue a single card/access email after an approved member becomes active."""
from __future__ import annotations

import logging
from fastapi import Request
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Member
from app.services.member_activity import is_member_active

logger = logging.getLogger(__name__)


def queue_activation_email(db: Session, member: Member, *, request: Request | None = None,
                           dedupe_key: str | None = None) -> str | None:
    if not member.email or not is_member_active(member):
        return None
    from app.services.member_card_delivery import _enqueue_member_card_ready_email
    backend = (settings.BASE_URL or (str(request.base_url) if request else "")).rstrip("/")
    frontend = (settings.FRONTEND_URL or backend).rstrip("/")
    if not backend:
        logger.warning("Member activation email postponed: no configured public URL member_id=%s", member.id)
        return None
    outbox_id = _enqueue_member_card_ready_email(
        db=db, member=member, org=member.organization,
        backend_base_url=backend, frontend_base_url=frontend,
        dedupe_key=dedupe_key,
        header_subtitle="La tua iscrizione è attiva e la tessera socio è disponibile.",
    )
    if outbox_id:
        member.access_email_requested = False
    return outbox_id


def queue_deferred_access(db: Session, member: Member, *, request: Request | None = None) -> str | None:
    if not member.access_email_requested:
        return None
    # The same key is used by the normal card-ready hook: an activation with
    # approved documents still sends only one complete card/access message.
    return queue_activation_email(db, member, request=request)
