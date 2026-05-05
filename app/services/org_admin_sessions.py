from datetime import datetime, timedelta

from fastapi import Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AdminRole, AdminUser, OrgAdminSession
from app.utils import generate_token, hash_token

ORG_ADMIN_SESSION_COOKIE = "org_admin_session"


def _cookie_secure() -> bool:
    return settings.BASE_URL.startswith("https")


def _session_max_age_seconds() -> int:
    return max(1, int(settings.ORG_ADMIN_SESSION_DAYS)) * 24 * 60 * 60


def create_org_admin_persistent_session(
    db: Session, admin: AdminUser
) -> tuple[OrgAdminSession, str]:
    raw_token = generate_token()
    session = OrgAdminSession(
        admin_id=admin.id,
        token_hash=hash_token(raw_token),
        expires_at=datetime.utcnow()
        + timedelta(days=max(1, int(settings.ORG_ADMIN_SESSION_DAYS))),
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
        samesite="strict",
        path="/",
    )


def clear_org_admin_session_cookie(response: Response) -> None:
    response.delete_cookie(
        ORG_ADMIN_SESSION_COOKIE,
        path="/",
        secure=_cookie_secure(),
        httponly=True,
        samesite="strict",
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
    admin = _get_session_org_admin(request, db)
    if admin:
        return admin

    raw_token = request.cookies.get(ORG_ADMIN_SESSION_COOKIE)
    if not raw_token:
        return None

    session = (
        db.query(OrgAdminSession)
        .join(AdminUser, AdminUser.id == OrgAdminSession.admin_id)
        .filter(
            OrgAdminSession.token_hash == hash_token(raw_token),
            OrgAdminSession.expires_at > datetime.utcnow(),
            OrgAdminSession.revoked_at.is_(None),
            AdminUser.role == AdminRole.ORG_ADMIN,
            AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None),
        )
        .first()
    )
    if not session or not session.admin:
        return None

    request.session["org_admin_id"] = session.admin.id
    return session.admin


def _get_session_org_admin(request: Request, db: Session) -> AdminUser | None:
    admin_id = request.session.get("org_admin_id")
    if not admin_id:
        return None
    admin = (
        db.query(AdminUser)
        .filter(
            AdminUser.id == admin_id,
            AdminUser.role == AdminRole.ORG_ADMIN,
            AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None),
        )
        .first()
    )
    if not admin:
        request.session.pop("org_admin_id", None)
        return None
    return admin
