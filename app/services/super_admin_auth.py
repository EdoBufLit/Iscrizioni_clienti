from __future__ import annotations

import base64
import hashlib
import hmac
import io
import secrets
import struct
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from urllib.parse import quote

import qrcode
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, Request, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.log_redaction import hash_identifier
from app.models import (
    AdminAuthChallenge,
    AdminMfaFactor,
    AdminRecoveryCode,
    AdminRole,
    AdminUser,
    SuperAdminSession,
)
from app.services.credential_crypto import derive_fernet_key
from app.utils import generate_token, hash_token


SUPER_ADMIN_SESSION_COOKIE = "super_admin_session"
CHALLENGE_TTL = timedelta(minutes=5)
SESSION_TOUCH_INTERVAL = timedelta(minutes=5)
TOTP_INTERVAL_SECONDS = 30
TOTP_DIGITS = 6


@dataclass(frozen=True)
class AuthenticatedSuperAdmin:
    admin: AdminUser
    session: SuperAdminSession


def _utcnow() -> datetime:
    return datetime.utcnow()


def _mfa_fernet() -> Fernet:
    raw_key = (settings.MFA_ENCRYPTION_KEY or "").strip()
    if not raw_key:
        raise HTTPException(
            status_code=503,
            detail="MFA encryption is not configured",
        )
    return Fernet(derive_fernet_key(raw_key))


def encrypt_totp_secret(secret: str) -> str:
    return _mfa_fernet().encrypt(secret.encode("ascii")).decode("ascii")


def decrypt_totp_secret(encrypted_secret: str) -> str:
    try:
        return _mfa_fernet().decrypt(encrypted_secret.encode("ascii")).decode("ascii")
    except InvalidToken as exc:
        raise HTTPException(status_code=500, detail="MFA factor cannot be decrypted") from exc


def generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _totp_at_timestep(secret: str, timestep: int) -> str:
    padding = "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode((secret + padding).upper(), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", timestep), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(binary % (10**TOTP_DIGITS)).zfill(TOTP_DIGITS)


def find_valid_totp_timestep(
    secret: str,
    code: str,
    *,
    unix_time: float | None = None,
    window: int = 1,
) -> int | None:
    normalized = (code or "").strip().replace(" ", "")
    if len(normalized) != TOTP_DIGITS or not normalized.isdigit():
        return None
    current = int((time.time() if unix_time is None else unix_time) // TOTP_INTERVAL_SECONDS)
    for delta in range(-window, window + 1):
        candidate_step = current + delta
        if hmac.compare_digest(_totp_at_timestep(secret, candidate_step), normalized):
            return candidate_step
    return None


def build_provisioning_uri(admin_email: str, secret: str) -> str:
    issuer = "ASSONAM"
    label = quote(f"{issuer}:{admin_email}", safe="")
    return (
        f"otpauth://totp/{label}?secret={quote(secret, safe='')}"
        f"&issuer={quote(issuer, safe='')}&algorithm=SHA1&digits=6&period=30"
    )


def provisioning_qr_data_uri(provisioning_uri: str) -> str:
    image = qrcode.make(provisioning_uri)
    output = io.BytesIO()
    image.save(output, format="PNG")
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def ensure_pending_totp_factor(db: Session, admin: AdminUser) -> tuple[AdminMfaFactor, str]:
    factor = (
        db.query(AdminMfaFactor)
        .filter(AdminMfaFactor.admin_id == admin.id)
        .first()
    )
    if factor is not None and factor.status == "active":
        return factor, decrypt_totp_secret(factor.secret_encrypted)

    if factor is None:
        secret = generate_totp_secret()
        factor = AdminMfaFactor(
            admin_id=admin.id,
            factor_type="totp",
            status="pending",
            secret_encrypted=encrypt_totp_secret(secret),
        )
        db.add(factor)
        db.flush()
        return factor, secret

    try:
        secret = decrypt_totp_secret(factor.secret_encrypted)
    except HTTPException:
        secret = generate_totp_secret()
        factor.secret_encrypted = encrypt_totp_secret(secret)
        factor.last_used_timestep = None
    factor.status = "pending"
    factor.activated_at = None
    factor.updated_at = _utcnow()
    db.flush()
    return factor, secret


def active_totp_factor(db: Session, admin_id: int) -> AdminMfaFactor | None:
    return (
        db.query(AdminMfaFactor)
        .filter(
            AdminMfaFactor.admin_id == admin_id,
            AdminMfaFactor.status == "active",
        )
        .first()
    )


def issue_auth_challenge(db: Session, admin_id: int, purpose: str) -> str:
    now = _utcnow()
    (
        db.query(AdminAuthChallenge)
        .filter(
            AdminAuthChallenge.admin_id == admin_id,
            AdminAuthChallenge.purpose == purpose,
            AdminAuthChallenge.consumed_at.is_(None),
        )
        .update({AdminAuthChallenge.consumed_at: now}, synchronize_session=False)
    )
    raw_token = generate_token()
    db.add(
        AdminAuthChallenge(
            admin_id=admin_id,
            token_hash=hash_token(raw_token),
            purpose=purpose,
            expires_at=now + CHALLENGE_TTL,
            attempts=0,
            max_attempts=5,
        )
    )
    db.flush()
    return raw_token


def load_auth_challenge(
    db: Session,
    raw_token: str,
    *,
    purposes: set[str],
) -> AdminAuthChallenge:
    now = _utcnow()
    challenge = (
        db.query(AdminAuthChallenge)
        .filter(
            AdminAuthChallenge.token_hash == hash_token((raw_token or "").strip()),
            AdminAuthChallenge.purpose.in_(purposes),
            AdminAuthChallenge.consumed_at.is_(None),
        )
        .first()
    )
    if challenge is None or challenge.expires_at <= now:
        raise HTTPException(status_code=401, detail="Authentication challenge expired")
    if challenge.attempts >= challenge.max_attempts:
        challenge.consumed_at = now
        db.commit()
        raise HTTPException(status_code=429, detail="Too many authentication attempts")
    return challenge


def record_challenge_failure(db: Session, challenge: AdminAuthChallenge) -> None:
    challenge.attempts += 1
    if challenge.attempts >= challenge.max_attempts:
        challenge.consumed_at = _utcnow()
    db.commit()


def verify_factor_code(
    db: Session,
    factor: AdminMfaFactor,
    code: str,
    *,
    allow_pending: bool = False,
) -> bool:
    if factor.status != "active" and not (allow_pending and factor.status == "pending"):
        return False
    secret = decrypt_totp_secret(factor.secret_encrypted)
    timestep = find_valid_totp_timestep(secret, code)
    if timestep is None:
        return False

    updated = (
        db.query(AdminMfaFactor)
        .filter(
            AdminMfaFactor.id == factor.id,
            or_(
                AdminMfaFactor.last_used_timestep.is_(None),
                AdminMfaFactor.last_used_timestep < timestep,
            ),
        )
        .update(
            {
                AdminMfaFactor.last_used_timestep: timestep,
                AdminMfaFactor.updated_at: _utcnow(),
            },
            synchronize_session=False,
        )
    )
    db.flush()
    return updated == 1


def _normalize_recovery_code(code: str) -> str:
    return "".join(character for character in (code or "").upper() if character.isalnum())


def _hash_recovery_code(code: str) -> str:
    normalized = _normalize_recovery_code(code)
    return hashlib.sha256(f"{normalized}|{settings.SECRET_KEY}".encode("utf-8")).hexdigest()


def generate_recovery_codes(db: Session, admin_id: int, *, count: int = 10) -> list[str]:
    now = _utcnow()
    (
        db.query(AdminRecoveryCode)
        .filter(
            AdminRecoveryCode.admin_id == admin_id,
            AdminRecoveryCode.used_at.is_(None),
        )
        .update({AdminRecoveryCode.used_at: now}, synchronize_session=False)
    )
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    raw_codes: list[str] = []
    for _ in range(count):
        normalized = "".join(secrets.choice(alphabet) for _ in range(12))
        display = f"{normalized[:4]}-{normalized[4:8]}-{normalized[8:]}"
        raw_codes.append(display)
        db.add(
            AdminRecoveryCode(
                admin_id=admin_id,
                code_hash=_hash_recovery_code(display),
            )
        )
    db.flush()
    return raw_codes


def consume_recovery_code(db: Session, admin_id: int, code: str) -> bool:
    code_hash = _hash_recovery_code(code)
    updated = (
        db.query(AdminRecoveryCode)
        .filter(
            AdminRecoveryCode.admin_id == admin_id,
            AdminRecoveryCode.code_hash == code_hash,
            AdminRecoveryCode.used_at.is_(None),
        )
        .update({AdminRecoveryCode.used_at: _utcnow()}, synchronize_session=False)
    )
    db.flush()
    return updated == 1


def count_remaining_recovery_codes(db: Session, admin_id: int) -> int:
    return (
        db.query(AdminRecoveryCode)
        .filter(
            AdminRecoveryCode.admin_id == admin_id,
            AdminRecoveryCode.used_at.is_(None),
        )
        .count()
    )


def create_super_admin_session(
    db: Session,
    admin: AdminUser,
    request: Request,
    *,
    mfa_verified: bool,
) -> tuple[SuperAdminSession, str]:
    now = _utcnow()
    raw_token = generate_token()
    absolute_expires_at = now + timedelta(
        hours=max(1, settings.SUPER_ADMIN_SESSION_ABSOLUTE_HOURS)
    )
    idle_expires_at = min(
        now + timedelta(minutes=max(1, settings.SUPER_ADMIN_SESSION_IDLE_MINUTES)),
        absolute_expires_at,
    )
    session = SuperAdminSession(
        admin_id=admin.id,
        token_hash=hash_token(raw_token),
        created_at=now,
        last_seen_at=now,
        idle_expires_at=idle_expires_at,
        absolute_expires_at=absolute_expires_at,
        mfa_verified_at=now if mfa_verified else None,
        user_agent=(request.headers.get("user-agent") or "")[:512] or None,
        ip_hash=hash_identifier(request.client.host if request.client else "unknown"),
    )
    db.add(session)
    db.flush()
    return session, raw_token


def set_super_admin_session_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        SUPER_ADMIN_SESSION_COOKIE,
        raw_token,
        max_age=max(1, settings.SUPER_ADMIN_SESSION_ABSOLUTE_HOURS) * 3600,
        httponly=True,
        secure=settings.IS_DEPLOYED_ENV,
        samesite="strict",
        path="/",
    )


def clear_super_admin_session_cookie(response: Response) -> None:
    response.delete_cookie(
        SUPER_ADMIN_SESSION_COOKIE,
        httponly=True,
        secure=settings.IS_DEPLOYED_ENV,
        samesite="strict",
        path="/",
    )


def resolve_super_admin_session(
    request: Request,
    db: Session,
    *,
    touch: bool = True,
) -> AuthenticatedSuperAdmin:
    raw_token = (request.cookies.get(SUPER_ADMIN_SESSION_COOKIE) or "").strip()
    if not raw_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    now = _utcnow()
    session = (
        db.query(SuperAdminSession)
        .filter(
            SuperAdminSession.token_hash == hash_token(raw_token),
            SuperAdminSession.revoked_at.is_(None),
        )
        .first()
    )
    if session is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if session.idle_expires_at <= now or session.absolute_expires_at <= now:
        session.revoked_at = now
        db.commit()
        raise HTTPException(status_code=401, detail="Session expired")

    admin = (
        db.query(AdminUser)
        .filter(
            AdminUser.id == session.admin_id,
            AdminUser.role == AdminRole.SUPER_ADMIN,
            AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None),
        )
        .first()
    )
    if admin is None:
        session.revoked_at = now
        db.commit()
        raise HTTPException(status_code=403, detail="Forbidden")

    if touch and session.last_seen_at <= now - SESSION_TOUCH_INTERVAL:
        session.last_seen_at = now
        session.idle_expires_at = min(
            now + timedelta(minutes=max(1, settings.SUPER_ADMIN_SESSION_IDLE_MINUTES)),
            session.absolute_expires_at,
        )
        db.commit()

    return AuthenticatedSuperAdmin(admin=admin, session=session)


def require_recent_step_up(request: Request, db: Session) -> AuthenticatedSuperAdmin:
    authenticated = resolve_super_admin_session(request, db)
    if not settings.SUPER_ADMIN_MFA_REQUIRED:
        return authenticated
    verified_at = authenticated.session.mfa_verified_at
    if verified_at is None or verified_at < _utcnow() - timedelta(
        minutes=max(1, settings.SUPER_ADMIN_STEP_UP_MINUTES)
    ):
        raise HTTPException(status_code=403, detail="Recent MFA verification required")
    return authenticated


def revoke_session_by_cookie(request: Request, db: Session) -> None:
    raw_token = (request.cookies.get(SUPER_ADMIN_SESSION_COOKIE) or "").strip()
    if not raw_token:
        return
    (
        db.query(SuperAdminSession)
        .filter(
            SuperAdminSession.token_hash == hash_token(raw_token),
            SuperAdminSession.revoked_at.is_(None),
        )
        .update({SuperAdminSession.revoked_at: _utcnow()}, synchronize_session=False)
    )
    db.commit()


def serialize_session(session: SuperAdminSession, *, current_id: int) -> dict[str, object]:
    return {
        "id": session.id,
        "created_at": session.created_at.isoformat(),
        "last_seen_at": session.last_seen_at.isoformat(),
        "absolute_expires_at": session.absolute_expires_at.isoformat(),
        "user_agent": session.user_agent,
        "ip_hash": session.ip_hash,
        "current": session.id == current_id,
    }
