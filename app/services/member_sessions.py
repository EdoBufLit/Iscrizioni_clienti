"""Revocable member cookies and one-time authentication proofs.

Credential changes and proof consumption share the member row lock. The
version comparison also protects SQLite and requests authenticated before a
concurrent password reset. Helpers never commit the caller's transaction.
"""

from datetime import datetime

from fastapi import HTTPException, Request
from sqlalchemy import update
from sqlalchemy.orm import Session, object_session

from app.models import Member, MemberAccount, Token, TokenType
from app.services.member_accounts import ensure_member_account, lock_member
from app.utils import generate_token, hash_token


MEMBER_AUTH_VERSION_SESSION_KEY = "member_auth_version"
ACCOUNT_ID_SESSION_KEY = "member_account_id"
ACCOUNT_VERSION_SESSION_KEY = "member_account_auth_version"
MEMBER_AUTH_TOKEN_PURPOSES = (
    TokenType.LOGIN_MAGIC_LINK,
    TokenType.PASSWORD_RESET,
    TokenType.REGISTRATION_CONTINUATION,
)


def clear_member_session(request: Request) -> None:
    request.session.pop("member_id", None)
    request.session.pop(MEMBER_AUTH_VERSION_SESSION_KEY, None)
    request.session.pop(ACCOUNT_ID_SESSION_KEY, None)
    request.session.pop(ACCOUNT_VERSION_SESSION_KEY, None)
    request.session.pop("member_account_scope", None)


def establish_member_session(request: Request, member: Member) -> None:
    db = object_session(member)
    authorized = getattr(member, "_account_auth_proved", True)
    if authorized and db is not None:
        account = ensure_member_account(db, member)
        request.session[ACCOUNT_ID_SESSION_KEY] = account.id
        request.session[ACCOUNT_VERSION_SESSION_KEY] = account.auth_version
        request.session.pop("member_account_scope", None)
    else:
        request.session.pop(ACCOUNT_ID_SESSION_KEY, None)
        request.session.pop(ACCOUNT_VERSION_SESSION_KEY, None)
        request.session["member_account_scope"] = "membership"
    request.session["member_id"] = member.id
    request.session[MEMBER_AUTH_VERSION_SESSION_KEY] = member.auth_version


def resolve_account_session(request: Request, db: Session) -> MemberAccount | None:
    identifier = request.session.get(ACCOUNT_ID_SESSION_KEY)
    version = request.session.get(ACCOUNT_VERSION_SESSION_KEY)
    if type(identifier) is not int or type(version) is not int or version < 1:
        return None
    account = db.query(MemberAccount).filter(MemberAccount.id == identifier).populate_existing().first()
    return account if account is not None and account.auth_version == version else None


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
    account_id = request.session.get(ACCOUNT_ID_SESSION_KEY)
    if account_id is not None:
        account = resolve_account_session(request, db)
        if account is None:
            clear_member_session(request)
            return None
        from app.services.renewals import can_access_member_account
        if member is None or member.account_id != account.id or not can_access_member_account(member):
            # A club can remove its membership without deleting the person's
            # identity or preventing access to their other associations.
            candidates = db.query(Member).filter(Member.account_id == account.id, Member.deleted_at.is_(None)).order_by(Member.id).all()
            member = next((item for item in candidates if can_access_member_account(item)), None)
            if member is None:
                return None
            request.session["member_id"] = member.id
            request.session[MEMBER_AUTH_VERSION_SESSION_KEY] = member.auth_version
            return member
    if member is None or member.auth_version != version:
        clear_member_session(request)
        return None
    if request.session.get("member_account_scope") == "membership":
        member._account_auth_proved = False
    return member


def issue_member_auth_token(
    db: Session,
    *,
    member: Member,
    purpose: TokenType,
    expires_at: datetime,
    recipient_email: str | None = None,
) -> tuple[str, Token]:
    if purpose not in MEMBER_AUTH_TOKEN_PURPOSES:
        raise ValueError("Unsupported member authentication token purpose")
    db.flush()
    # Callers may hold an ORM instance from before a login in another session.
    # Snapshot the persisted ownership/epoch rather than issuing a legacy
    # unscoped proof for an identity which has already been adopted.
    db.refresh(member, ["account_id", "auth_version"])
    raw_token = generate_token()
    account = db.query(MemberAccount).filter(MemberAccount.id == member.account_id).populate_existing().first() if member.account_id is not None else None
    destination = (recipient_email if recipient_email is not None else member.email) or ""
    account_scope = account is not None and bool(account.email) and destination.strip().lower() == account.email.strip().lower()
    token = Token(
        member_id=member.id,
        purpose=purpose,
        token_hash=hash_token(raw_token),
        auth_version=member.auth_version,
        account_id=account.id if account_scope else None,
        account_auth_version=account.auth_version if account_scope else None,
        expires_at=expires_at,
    )
    db.add(token)
    return raw_token, token


def _lock_member(
    db: Session, member_id: int, *, include_deleted: bool = False
) -> Member | None:
    return lock_member(db, member_id, include_deleted=include_deleted)


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
    account = db.get(MemberAccount, member.account_id) if member.account_id is not None else None
    if proof.account_id is not None and (account is None or proof.account_id != account.id or proof.account_auth_version != account.auth_version):
        return None
    # A club contact address may differ from the person's login email. A link
    # sent to that address proves only that association, not every linked club.
    member._account_auth_proved = account is None or proof.account_id == account.id
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
    expected_account_version: int | None = None,
) -> Member:
    """Rotate the credential epoch and revoke all previous bearer proofs."""
    member = _lock_member(db, member_id, include_deleted=password_hash is None)
    if member is None or member.auth_version != expected_version:
        raise HTTPException(status_code=401, detail="Sessione scaduta. Accedi nuovamente.")
    changed_at = now or datetime.utcnow()
    account = db.get(MemberAccount, member.account_id) if member.account_id is not None else None
    if account is not None and password_hash is not None:
        if getattr(member, "_account_auth_proved", True) is False or (expected_account_version is not None and account.auth_version != expected_account_version):
            raise HTTPException(status_code=401, detail="Accedi al tuo account personale per cambiare la password.")
        expected_account = account.auth_version
        changed_account = db.execute(update(MemberAccount).where(MemberAccount.id == account.id, MemberAccount.auth_version == expected_account).values(password_hash=password_hash, auth_version=expected_account + 1).execution_options(synchronize_session=False))
        if changed_account.rowcount != 1:
            raise HTTPException(status_code=401, detail="Sessione scaduta. Accedi nuovamente.")
        member_ids = [identifier for (identifier,) in db.query(Member.id).filter(Member.account_id == account.id).order_by(Member.id).with_for_update().all()]
        db.execute(update(Member).where(Member.account_id == account.id).values(password_hash=password_hash, auth_version=Member.auth_version + 1).execution_options(synchronize_session=False))
        db.execute(update(Token).where(Token.member_id.in_(member_ids), Token.purpose.in_(MEMBER_AUTH_TOKEN_PURPOSES), Token.used_at.is_(None)).values(used_at=changed_at).execution_options(synchronize_session=False))
        db.expire_all()
        _ = member.auth_version
        return member
    changed = db.execute(
        update(Member)
        .where(Member.id == member_id, Member.auth_version == expected_version)
        .values(**({"account_id": None} if password_hash is None else {}), password_hash=password_hash, auth_version=expected_version + 1)
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
    db.expire(member, ["password_hash", "auth_version", "account_id", "account"])
    # Materialize the new epoch before the caller issues its replacement cookie.
    _ = member.auth_version
    return member
