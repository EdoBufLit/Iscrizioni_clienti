"""Revocable member cookies and one-time authentication proofs.

Credential changes and proof consumption share the member row lock. The
version comparison also protects SQLite and requests authenticated before a
concurrent password reset. Helpers never commit the caller's transaction.
"""

from datetime import datetime

from fastapi import HTTPException, Request
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import Member, Token, TokenType
from app.utils import generate_token, hash_token


MEMBER_AUTH_VERSION_SESSION_KEY = "member_auth_version"
MEMBER_AUTH_TOKEN_PURPOSES = (
    TokenType.LOGIN_MAGIC_LINK,
    TokenType.PASSWORD_RESET,
    TokenType.REGISTRATION_CONTINUATION,
)


def clear_member_session(request: Request) -> None:
    request.session.pop("member_id", None)
    request.session.pop(MEMBER_AUTH_VERSION_SESSION_KEY, None)


def establish_member_session(request: Request, member: Member) -> None:
    request.session["member_id"] = member.id
    request.session[MEMBER_AUTH_VERSION_SESSION_KEY] = member.auth_version


def resolve_member_session(request: Request, db: Session) -> Member | None:
    member_id = request.session.get("member_id")
    version = request.session.get(MEMBER_AUTH_VERSION_SESSION_KEY)
    if type(member_id) is not int or type(version) is not int or version < 1:
        clear_member_session(request)
        return None
    member = (
        db.query(Member)
        .filter(Member.id == member_id, Member.deleted_at.is_(None))
        .populate_existing()
        .first()
    )
    if member is None or member.auth_version != version:
        clear_member_session(request)
        return None
    return member


def issue_member_auth_token(
    db: Session,
    *,
    member: Member,
    purpose: TokenType,
    expires_at: datetime,
) -> tuple[str, Token]:
    if purpose not in MEMBER_AUTH_TOKEN_PURPOSES:
        raise ValueError("Unsupported member authentication token purpose")
    if member.id is None or member.auth_version is None:
        db.flush()
    raw_token = generate_token()
    token = Token(
        member_id=member.id,
        purpose=purpose,
        token_hash=hash_token(raw_token),
        auth_version=member.auth_version,
        expires_at=expires_at,
    )
    db.add(token)
    return raw_token, token


def _lock_member(
    db: Session, member_id: int, *, include_deleted: bool = False
) -> Member | None:
    query = db.query(Member).filter(Member.id == member_id)
    if not include_deleted:
        query = query.filter(Member.deleted_at.is_(None))
    return (
        query
        .populate_existing()
        .with_for_update()
        .first()
    )


def consume_member_auth_token(
    db: Session,
    *,
    raw_token: str,
    purpose: TokenType,
    member_id: int | None = None,
    now: datetime | None = None,
) -> Member | None:
    if purpose not in MEMBER_AUTH_TOKEN_PURPOSES:
        raise ValueError("Unsupported member authentication token purpose")
    checked_at = now or datetime.utcnow()
    token_hash = hash_token(raw_token)
    query = db.query(Token).filter(
        Token.token_hash == token_hash,
        Token.purpose == purpose,
        Token.expires_at > checked_at,
        Token.used_at.is_(None),
        Token.auth_version.isnot(None),
    )
    if member_id is not None:
        query = query.filter(Token.member_id == member_id)
    proof = query.first()
    if proof is None:
        return None
    # Lock the member before the proof, including in every password writer, to
    # avoid a token/member lock inversion between simultaneous reset requests.
    member = _lock_member(db, proof.member_id)
    if member is None or proof.auth_version != member.auth_version:
        return None
    consumed = db.execute(
        update(Token)
        .where(
            Token.id == proof.id,
            Token.purpose == purpose,
            Token.auth_version == member.auth_version,
            Token.used_at.is_(None),
            Token.expires_at > checked_at,
        )
        .values(used_at=checked_at)
        .execution_options(synchronize_session=False)
    )
    return member if consumed.rowcount == 1 else None


def replace_member_password(
    db: Session,
    *,
    member_id: int,
    expected_version: int,
    password_hash: str | None,
    now: datetime | None = None,
) -> Member:
    """Rotate the credential epoch and revoke all previous bearer proofs."""
    member = _lock_member(db, member_id, include_deleted=password_hash is None)
    if member is None or member.auth_version != expected_version:
        raise HTTPException(status_code=401, detail="Sessione scaduta. Accedi nuovamente.")
    changed_at = now or datetime.utcnow()
    changed = db.execute(
        update(Member)
        .where(Member.id == member_id, Member.auth_version == expected_version)
        .values(password_hash=password_hash, auth_version=expected_version + 1)
        .execution_options(synchronize_session=False)
    )
    if changed.rowcount != 1:
        raise HTTPException(status_code=401, detail="Sessione scaduta. Accedi nuovamente.")
    db.execute(
        update(Token)
        .where(
            Token.member_id == member_id,
            Token.purpose.in_(MEMBER_AUTH_TOKEN_PURPOSES),
            Token.used_at.is_(None),
        )
        .values(used_at=changed_at)
        .execution_options(synchronize_session=False)
    )
    db.expire(member, ["password_hash", "auth_version"])
    # Materialize the new epoch before the caller issues its replacement cookie.
    _ = member.auth_version
    return member
