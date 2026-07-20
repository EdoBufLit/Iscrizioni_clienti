"""Fresh first-factor proof for optional Org Admin MFA enrollment."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AdminAuthChallenge, OrgAdminSession


MFA_SETUP_CHALLENGE_TTL = timedelta(minutes=5)
MFA_SETUP_AUTHORIZATION_TTL = timedelta(minutes=5)
MFA_SETUP_RESEND_COOLDOWN = timedelta(seconds=60)
MFA_SETUP_MAX_ATTEMPTS = 5
_MFA_SETUP_PURPOSE_PREFIX = "org_admin_mfa_setup_email:"


def _utcnow() -> datetime:
    return datetime.utcnow()


def _purpose(session_id: int) -> str:
    return f"{_MFA_SETUP_PURPOSE_PREFIX}{session_id}"


def _normalize_code(code: str) -> str:
    return "".join(character for character in (code or "") if character.isdigit())[:6]


def _code_hash(*, admin_id: int, session_id: int, code: str) -> str:
    material = f"org-admin-mfa-setup:{admin_id}:{session_id}:{_normalize_code(code)}"
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        material.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def generate_setup_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def issue_setup_email_challenge(
    db: Session,
    *,
    admin_id: int,
    session_id: int,
    now: datetime | None = None,
) -> tuple[AdminAuthChallenge, str]:
    """Create the newest session-bound code and invalidate older resends."""

    issued_at = now or _utcnow()
    purpose = _purpose(session_id)
    latest = (
        db.query(AdminAuthChallenge)
        .filter(
            AdminAuthChallenge.admin_id == admin_id,
            AdminAuthChallenge.purpose == purpose,
        )
        .order_by(AdminAuthChallenge.created_at.desc(), AdminAuthChallenge.id.desc())
        .first()
    )
    if (
        latest is not None
        and latest.consumed_at is None
        and latest.created_at is not None
        and latest.created_at > issued_at - MFA_SETUP_RESEND_COOLDOWN
    ):
        raise HTTPException(
            status_code=429,
            detail="Attendi un minuto prima di richiedere un nuovo codice",
        )

    (
        db.query(AdminAuthChallenge)
        .filter(
            AdminAuthChallenge.admin_id == admin_id,
            AdminAuthChallenge.purpose == purpose,
            AdminAuthChallenge.consumed_at.is_(None),
        )
        .update(
            {AdminAuthChallenge.consumed_at: issued_at},
            synchronize_session=False,
        )
    )

    # ``token_hash`` is globally unique. A six-digit resend can very rarely
    # repeat the previous value for the same session, so regenerate before
    # flushing instead of surfacing a database constraint error.
    code = ""
    code_hash = ""
    for _attempt in range(10):
        candidate = generate_setup_code()
        candidate_hash = _code_hash(
            admin_id=admin_id,
            session_id=session_id,
            code=candidate,
        )
        collision = (
            db.query(AdminAuthChallenge.id)
            .filter(AdminAuthChallenge.token_hash == candidate_hash)
            .first()
        )
        if collision is None:
            code = candidate
            code_hash = candidate_hash
            break
    if not code:
        raise RuntimeError("Unable to allocate a unique MFA setup challenge")

    challenge = AdminAuthChallenge(
        admin_id=admin_id,
        token_hash=code_hash,
        purpose=purpose,
        expires_at=issued_at + MFA_SETUP_CHALLENGE_TTL,
        attempts=0,
        max_attempts=MFA_SETUP_MAX_ATTEMPTS,
        created_at=issued_at,
    )
    db.add(challenge)
    db.flush()
    return challenge, code


def verify_setup_email_challenge(
    db: Session,
    *,
    admin_id: int,
    session_id: int,
    code: str,
    now: datetime | None = None,
) -> AdminAuthChallenge:
    """Consume the newest valid code for this exact admin and session."""

    checked_at = now or _utcnow()
    challenge = (
        db.query(AdminAuthChallenge)
        .filter(
            AdminAuthChallenge.admin_id == admin_id,
            AdminAuthChallenge.purpose == _purpose(session_id),
        )
        .order_by(AdminAuthChallenge.created_at.desc(), AdminAuthChallenge.id.desc())
        .first()
    )
    if (
        challenge is None
        or challenge.consumed_at is not None
        or challenge.expires_at <= checked_at
    ):
        if challenge is not None and challenge.consumed_at is None:
            challenge.consumed_at = checked_at
            db.commit()
        raise HTTPException(status_code=401, detail="Codice non valido o scaduto")

    if challenge.attempts >= challenge.max_attempts:
        challenge.consumed_at = checked_at
        db.commit()
        raise HTTPException(status_code=429, detail="Troppi tentativi")

    expected_hash = _code_hash(
        admin_id=admin_id,
        session_id=session_id,
        code=code,
    )
    if len(_normalize_code(code)) != 6 or not hmac.compare_digest(
        challenge.token_hash,
        expected_hash,
    ):
        challenge.attempts += 1
        if challenge.attempts >= challenge.max_attempts:
            challenge.consumed_at = checked_at
        db.commit()
        raise HTTPException(status_code=401, detail="Codice non valido o scaduto")

    consumed = (
        db.query(AdminAuthChallenge)
        .filter(
            AdminAuthChallenge.id == challenge.id,
            AdminAuthChallenge.consumed_at.is_(None),
        )
        .update(
            {AdminAuthChallenge.consumed_at: checked_at},
            synchronize_session=False,
        )
    )
    if consumed != 1:
        db.rollback()
        raise HTTPException(status_code=401, detail="Codice non valido o scaduto")
    db.flush()
    return challenge


def has_recent_setup_authorization(
    session: OrgAdminSession,
    *,
    now: datetime | None = None,
) -> bool:
    authorized_at = session.mfa_setup_authorized_at
    if authorized_at is None:
        return False
    return authorized_at > (now or _utcnow()) - MFA_SETUP_AUTHORIZATION_TTL


def require_recent_setup_authorization(session: OrgAdminSession) -> None:
    if not has_recent_setup_authorization(session):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "MFA_SETUP_EMAIL_STEP_UP_REQUIRED",
                "message": "Conferma prima il codice inviato alla tua email",
            },
        )
