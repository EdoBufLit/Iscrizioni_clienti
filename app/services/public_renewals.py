"""Public wizard entry to an existing account's annual renewal.

An email address identifies a recipient, never authorizes changes to their
profile. All issuance goes through the same renewal service as the member area.
"""

from datetime import datetime, timedelta
from urllib.parse import quote, urlencode

from fastapi import HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import audit
from app.config import settings
from app.models import Member, MemberStatus, MembershipType, Organization, Token, TokenType
from app.services.member_accounts import verify_member_password
from app.services.annual_memberships import as_rome_datetime
from app.services.card_allocation import lock_card_allocation
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.member_access_email import build_member_access_email_html
from app.services.email_sender import build_sender_payload
from app.services.member_sessions import (
    consume_member_auth_token,
    establish_member_session,
    issue_member_auth_token,
    resolve_member_session,
)
from app.utils import hash_token
from app.services.member_activity import is_member_active
from app.services.renewal_availability import require_renewals_open
from app.services.renewals import can_access_member_account, request_renewal, serialize_annual_term


def is_annual_cardholder(member: Member | None) -> bool:
    membership_type = getattr(member, "membership_type", None)
    if isinstance(membership_type, MembershipType):
        membership_type = membership_type.value
    return bool(
        member is not None
        and can_access_member_account(member)
        and (membership_type or MembershipType.ANNUAL.value) == MembershipType.ANNUAL.value
        and member.card_no is not None
        and member.card_year is not None
    )


def find_annual_cardholder(db: Session, *, org_id: int, email: str) -> Member | None:
    candidates = (
        db.query(Member)
        .filter(
            Member.org_id == org_id,
            func.lower(Member.email) == email.strip().lower(),
            Member.deleted_at.is_(None),
            Member.status.in_([MemberStatus.ACTIVE, MemberStatus.EXPIRED]),
        )
        .order_by(Member.id.desc())
        .all()
    )
    return next((member for member in candidates if is_annual_cardholder(member)), None)


def guard_existing_cardholder_signup_type(db: Session, *, org_id: int, email: str, membership_type: str) -> None:
    """Existing cardholders buy other card types in their authenticated area."""
    candidates = db.query(Member).filter(
        Member.org_id == org_id,
        func.lower(Member.email) == email.strip().lower(),
        Member.deleted_at.is_(None),
        Member.status.in_([MemberStatus.ACTIVE, MemberStatus.EXPIRED]),
        Member.card_no.isnot(None),
        Member.card_year.isnot(None),
    ).all()
    for member in candidates:
        if can_access_member_account(member) and (
            membership_type != MembershipType.ANNUAL.value or not is_annual_cardholder(member)
        ):
            raise HTTPException(
                status_code=409,
                detail="Sei già socio di questa associazione. Rinnova o acquista una tessera dalla tua area riservata, senza creare una nuova iscrizione.",
            )


def queue_public_renewal_link(db: Session, *, member: Member) -> None:
    """Keep rapid retries and requests from different IPs from spamming a member."""
    require_renewals_open()
    member = db.query(Member).filter(Member.id == member.id).populate_existing().with_for_update().one_or_none()
    if not is_annual_cardholder(member):
        return
    now = datetime.utcnow()
    recent_proof = (
        db.query(Token.id)
        .filter(
            Token.member_id == member.id,
            Token.purpose == TokenType.LOGIN_MAGIC_LINK,
            Token.auth_version == member.auth_version,
            Token.created_at > now - timedelta(minutes=1),
            Token.expires_at > now,
            Token.used_at.is_(None),
        )
        .first()
    )
    if recent_proof:
        return
    token, _proof = issue_member_auth_token(
        db,
        member=member,
        purpose=TokenType.LOGIN_MAGIC_LINK,
        expires_at=now + timedelta(minutes=settings.LOGIN_TOKEN_EXPIRE_MINUTES),
    )
    slug = quote(member.organization.slug, safe="")
    # A top-level server redirect establishes the cookie before the SPA starts
    # concurrent authentication requests. Fetching a redirect inside AuthVerify
    # can race older responses that still carry a pre-login signed session.
    base = settings.BASE_URL.rstrip("/")
    link = f"{base}/api/join/{slug}/renewal/verify?{urlencode({'token': token})}"
    enqueue_email(
        db,
        email_type="member_magic_link",
        to_email=member.email,
        subject=f"Rinnova la tua tessera - {member.organization.name}",
        payload=build_email_payload(
            text_body=(
                f"Per rinnovare la tessera di {member.organization.name}, accedi con questo link sicuro:\n{link}\n\n"
                f"Il link scade tra {settings.LOGIN_TOKEN_EXPIRE_MINUTES} minuti. "
                "La tua anagrafica e il tuo account saranno conservati. "
                "Il rinnovo richiederà la tua conferma e seguirà le condizioni dell'associazione."
            ),
            html_body=build_member_access_email_html(member, link, purpose="renewal"),
            sender=build_sender_payload(mode="association", association=member.organization),
            meta={"member_id": member.id, "token_purpose": TokenType.LOGIN_MAGIC_LINK.value},
        ),
        priority=1,
    )


def consume_public_renewal_proof(db: Session, *, org: Organization, raw_token: str) -> Member | None:
    require_renewals_open()
    # Resolve tenant scope before consuming a proof. A URL edited to another
    # association must neither authenticate nor invalidate the original link.
    scoped_proof = (
        db.query(Token.member_id)
        .join(Member, Member.id == Token.member_id)
        .filter(
            Token.token_hash == hash_token(raw_token),
            Token.purpose == TokenType.LOGIN_MAGIC_LINK,
            Token.used_at.is_(None),
            Token.expires_at > datetime.utcnow(),
            Member.org_id == org.id,
            Member.deleted_at.is_(None),
        )
        .first()
    )
    if scoped_proof is None:
        return None
    member = consume_member_auth_token(
        db,
        raw_token=raw_token,
        purpose=TokenType.LOGIN_MAGIC_LINK,
        member_id=scoped_proof.member_id,
    )
    if not is_annual_cardholder(member) or member.org_id != org.id:
        return None
    return member


def require_public_renewal_member(request: Request, db: Session, *, org: Organization) -> Member:
    member = resolve_member_session(request, db)
    if not is_annual_cardholder(member) or member.org_id != org.id:
        raise HTTPException(status_code=401, detail="Accedi al tuo account per questa associazione.")
    return member


def submit_existing_cardholder_renewal(
    db: Session,
    *,
    request: Request,
    org: Organization,
    email: str,
    password: str | None,
) -> dict | None:
    """Intercept full signup before it can treat an old cardholder as a draft."""
    candidate = find_annual_cardholder(db, org_id=org.id, email=email)
    if candidate is None or is_member_active(candidate, now=datetime.utcnow()):
        return None
    require_renewals_open()
    # Match renewal's lock order before refreshing credentials or card pointers.
    lock_card_allocation(db, org.id, as_rome_datetime().year)
    candidate = (
        db.query(Member).filter(Member.id == candidate.id).populate_existing().with_for_update().one_or_none()
    )
    if not is_annual_cardholder(candidate):
        raise HTTPException(status_code=409, detail="Lo stato dell'iscrizione è cambiato. Ricarica la pagina.")
    session_member = resolve_member_session(request, db)
    verified = session_member is not None and session_member.id == candidate.id
    if not verified and password:
        verified = verify_member_password(candidate, password)
    if not verified:
        queue_public_renewal_link(db, member=candidate)
        db.commit()
        return {"status": "renewal_verification_required", "email_status": "queued"}
    result = request_renewal(db, member=candidate)
    payload = {
        "status": "renewal_requested",
        "id": candidate.id,
        "ok": True,
        "action": result.action,
        "checkout_required": result.checkout_required,
        "term": serialize_annual_term(db, result.term),
    }
    audit.log_operation(
        db,
        action="membership.renewal_requested",
        entity_type="annual_membership_term",
        entity_id=result.term.id,
        actor_member_id=candidate.id,
        actor_role="member",
        metadata={"org_id": org.id, "membership_year": result.term.membership_year, "source": "public_wizard"},
    )
    establish_member_session(request, candidate)
    db.commit()
    return payload
