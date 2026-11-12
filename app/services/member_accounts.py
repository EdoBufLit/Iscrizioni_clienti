"""Personal identities and explicit association-membership ownership.

No function in this module groups people by email, name, or fiscal code.
Callers own the transaction. Account locks precede membership locks.
"""

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import Member, MemberAccount, Token, TokenType
from app.security import verify_password


AUTH_PURPOSES = (TokenType.LOGIN_MAGIC_LINK, TokenType.PASSWORD_RESET, TokenType.REGISTRATION_CONTINUATION)


def _sqlite_writer_lock(db: Session) -> None:
    # SQLite ignores FOR UPDATE. Use the same process-safe writer lock as the
    # existing member operations before inspecting ownership or credentials.
    if db.get_bind().dialect.name == "sqlite":
        from app.services.member_bulk import acquire_sqlite_member_action_lock
        acquire_sqlite_member_action_lock(db)


def lock_account(db: Session, account_id: int) -> MemberAccount | None:
    _sqlite_writer_lock(db)
    return db.query(MemberAccount).filter(MemberAccount.id == account_id).populate_existing().with_for_update().first()


def lock_member(db: Session, member_id: int, *, include_deleted: bool = False) -> Member | None:
    """Lock the identity before a membership, checking concurrent relinking."""
    _sqlite_writer_lock(db)
    account_id = db.query(Member.account_id).filter(Member.id == member_id).scalar()
    if account_id is not None:
        lock_account(db, account_id)
    query = db.query(Member).filter(Member.id == member_id)
    if not include_deleted:
        query = query.filter(Member.deleted_at.is_(None))
    member = query.populate_existing().with_for_update().first()
    if member is not None and member.account_id != account_id:
        raise HTTPException(status_code=409, detail="L'account è cambiato. Riprova l'operazione.")
    return member


def ensure_member_account(db: Session, member: Member) -> MemberAccount:
    """Adopt exactly one already-proven legacy membership, never its email peers."""
    if member.account_id is not None:
        account = db.get(MemberAccount, member.account_id)
        if account is None:
            raise HTTPException(status_code=401, detail="Account non disponibile.")
        return account
    expected_version = member.auth_version
    locked = lock_member(db, member.id)
    if locked is None or locked.auth_version != expected_version:
        raise HTTPException(status_code=401, detail="Sessione scaduta. Accedi nuovamente.")
    if locked.account_id is not None:
        return db.get(MemberAccount, locked.account_id)
    account = MemberAccount(email=(locked.email or "").strip().lower() or None, password_hash=locked.password_hash, preferred_member_id=locked.id)
    db.add(account)
    db.flush()
    locked.account_id = account.id
    db.flush()
    return account


def member_password_hash(member: Member) -> str | None:
    """A linked membership's legacy hash is never an authentication fallback."""
    if member.account_id is not None:
        return member.account.password_hash if member.account is not None else None
    return member.password_hash


def member_login_email(member: Member) -> str | None:
    if member.account_id is not None:
        return member.account.email if member.account is not None else None
    return member.email


def verify_member_password(member: Member, password: str) -> bool:
    encoded = member_password_hash(member)
    if not encoded or not password:
        return False
    try:
        return verify_password(password, encoded)
    except (TypeError, ValueError):
        return False


def link_member_to_account(db: Session, *, account: MemberAccount, member: Member, password: str | None = None,
        trusted: bool = False, expected_account_version: int | None = None) -> Member:
    """Attach one proven membership; trusted=True is for audited operator scripts.

    Existing multi-membership identities cannot be split through this endpoint.
    A singleton legacy identity may be retired after its credential is proved.
    """
    account_id, member_id, old_account_id = account.id, member.id, member.account_id
    expected = account.auth_version if expected_account_version is None else expected_account_version
    for identifier in sorted({value for value in (account_id, old_account_id) if value is not None}):
        lock_account(db, identifier)
    account = db.get(MemberAccount, account_id)
    if account is None or account.auth_version != expected:
        raise HTTPException(status_code=401, detail="Sessione scaduta. Accedi nuovamente.")
    target = db.query(Member).filter(Member.id == member_id, Member.deleted_at.is_(None)).populate_existing().with_for_update().first()
    if target is None or target.account_id != old_account_id:
        raise HTTPException(status_code=409, detail="L'iscrizione è cambiata. Riprova.")
    if target.account_id == account_id:
        return target
    if not trusted and not verify_member_password(target, password or ""):
        raise HTTPException(status_code=400, detail="Non è stato possibile verificare la tessera con i dati indicati.")
    if old_account_id is not None:
        count = db.query(Member.id).filter(Member.account_id == old_account_id, Member.deleted_at.is_(None)).count()
        if count > 1:
            raise HTTPException(status_code=409, detail="La tessera appartiene a un altro account con più iscrizioni. Contatta l'assistenza.")
        previous = db.get(MemberAccount, old_account_id)
        # Revoke every old cookie for this retired singleton identity.
        previous.auth_version += 1
        previous.password_hash = None
    target.account_id = account_id
    target.password_hash = account.password_hash
    target.auth_version += 1
    db.execute(update(Token).where(Token.member_id == target.id, Token.purpose.in_(AUTH_PURPOSES), Token.used_at.is_(None)).values(used_at=datetime.utcnow()))
    db.flush()
    source_ids = [identifier for (identifier,) in db.query(Member.id).filter(Member.account_id == account_id).order_by(Member.id).with_for_update().all()]
    account.auth_version += 1
    db.execute(update(Member).where(Member.id.in_(source_ids)).values(auth_version=Member.auth_version + 1).execution_options(synchronize_session=False))
    db.execute(update(Token).where(Token.member_id.in_(source_ids), Token.purpose.in_(AUTH_PURPOSES), Token.used_at.is_(None)).values(used_at=datetime.utcnow()).execution_options(synchronize_session=False))
    db.flush()
    db.expire_all()
    db.expire(target, ["account"])
    return target
