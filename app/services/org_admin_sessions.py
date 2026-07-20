from dataclasses import dataclass
from datetime import datetime, timedelta

from fastapi import Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.log_redaction import hash_identifier
from app.models import AdminRole, AdminUser, OrgAdminSession
from app.utils import generate_token, hash_token

ORG_ADMIN_SESSION_COOKIE = "org_admin_session"
SESSION_TOUCH_INTERVAL = timedelta(minutes=5)


@dataclass(frozen=True)
class AuthenticatedOrgAdmin:
    admin: AdminUser
    session: OrgAdminSession


def _cookie_secure() -> bool:
    return settings.BASE_URL.startswith("https")


def _session_max_age_seconds() -> int:
    return max(1, int(settings.ORG_ADMIN_SESSION_DAYS)) * 24 * 60 * 60


def create_org_admin_persistent_session(
    db: Session,
    admin: AdminUser,
    request: Request | None = None,
    *,
    mfa_verified: bool = False,
) -> tuple[OrgAdminSession, str]:
    now = datetime.utcnow()
    raw_token = generate_token()
    session = OrgAdminSession(
        admin_id=admin.id,
        token_hash=hash_token(raw_token),
        expires_at=now + timedelta(days=max(1, int(settings.ORG_ADMIN_SESSION_DAYS))),
        created_at=now,
        last_seen_at=now,
        user_agent=((request.headers.get("user-agent") or "")[:512] or None)
        if request is not None
        else None,
        ip_hash=hash_identifier(
            request.client.host if request is not None and request.client else "unknown"
        )
        if request is not None
        else None,
        mfa_verified_at=now if mfa_verified else None,
    )
    db.add(session)
    return session, raw_token


def set_org_admin_session_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        ORG_ADMIN_SESSION_COOKIE,
        raw_token,
        max_age=_session_max_age_seconds(),
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        path="/",
    )


def clear_org_admin_session_cookie(response: Response) -> None:
    response.delete_cookie(
        ORG_ADMIN_SESSION_COOKIE,
        path="/",
        secure=_cookie_secure(),
        httponly=True,
        samesite="lax",
    )


def revoke_current_org_admin_persistent_session(
    request: Request, db: Session
) -> OrgAdminSession | None:
    raw_token = request.cookies.get(ORG_ADMIN_SESSION_COOKIE)
    if not raw_token:
        return None

    session = (
        db.query(OrgAdminSession)
        .filter(
            OrgAdminSession.token_hash == hash_token(raw_token),
            OrgAdminSession.revoked_at.is_(None),
        )
        .first()
    )
    if not session:
        return None

    session.revoked_at = datetime.utcnow()
    return session


def get_current_org_admin_from_request(
    request: Request, db: Session
) -> AdminUser | None:
    authenticated = resolve_org_admin_session(request, db)
    return authenticated.admin if authenticated is not None else None


def resolve_org_admin_session(
    request: Request,
    db: Session,
    *,
    touch: bool = True,
) -> AuthenticatedOrgAdmin | None:
    """Resolve the persistent cookie against the database on every request.

    The signed Starlette session remains populated for backwards-compatible UI
    behaviour, but is deliberately never an authorization shortcut: revocation
    and account changes take effect immediately.
    """
    raw_token = request.cookies.get(ORG_ADMIN_SESSION_COOKIE)
    if not raw_token:
        return None

    now = datetime.utcnow()
    session = (
        db.query(OrgAdminSession)
        .join(AdminUser, AdminUser.id == OrgAdminSession.admin_id)
        .filter(
            OrgAdminSession.token_hash == hash_token(raw_token),
            OrgAdminSession.expires_at > now,
            OrgAdminSession.revoked_at.is_(None),
            AdminUser.role == AdminRole.ORG_ADMIN,
            AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None),
        )
        .first()
    )
    if not session or not session.admin:
        request.session.pop("org_admin_id", None)
        return None

    request.session["org_admin_id"] = session.admin.id
    if touch and (
        session.last_seen_at is None
        or session.last_seen_at <= now - SESSION_TOUCH_INTERVAL
    ):
        session.last_seen_at = now
        db.commit()
    return AuthenticatedOrgAdmin(admin=session.admin, session=session)


def serialize_org_admin_session(
    session: OrgAdminSession,
    *,
    current_id: int,
) -> dict[str, object]:
    return {
        "id": session.id,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "last_seen_at": session.last_seen_at.isoformat()
        if session.last_seen_at
        else None,
        "expires_at": session.expires_at.isoformat(),
        "user_agent": session.user_agent,
        "ip_hash": session.ip_hash,
        "mfa_verified": session.mfa_verified_at is not None,
        "current": session.id == current_id,
    }
