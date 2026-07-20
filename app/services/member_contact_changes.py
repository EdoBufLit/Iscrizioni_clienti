from __future__ import annotations

import base64
import hashlib
import re
from datetime import datetime, timedelta

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Member, MemberContactChange
from app.utils import generate_token, hash_token


CONTACT_CHANGE_TTL = timedelta(hours=24)
CONTACT_CHANGE_FIELDS = {"email", "phone"}


def _cipher() -> Fernet:
    digest = hashlib.sha256(
        f"member-contact-change:{settings.SECRET_KEY}".encode("utf-8")
    ).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_contact_value(value: str) -> str:
    return _cipher().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_contact_value(value: str) -> str:
    try:
        return _cipher().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeError, ValueError) as exc:
        raise ValueError("La richiesta di modifica non è più valida") from exc


def normalize_email(value: str) -> str:
    return (value or "").strip().lower()


def normalize_phone(value: str) -> str:
    raw = (value or "").strip()
    prefix = "+" if raw.startswith("+") else ""
    digits = re.sub(r"\D+", "", raw)
    if not 7 <= len(digits) <= 15:
        raise ValueError("Inserisci un numero di telefono valido")
    return f"{prefix}{digits}"


def normalize_contact_value(field: str, value: str) -> str:
    if field == "email":
        normalized = normalize_email(value)
        if not normalized:
            raise ValueError("Inserisci un indirizzo email valido")
        return normalized
    if field == "phone":
        return normalize_phone(value)
    raise ValueError("Campo contatto non valido")


def mask_contact_value(field: str, value: str) -> str:
    if field == "email":
        local, separator, domain = value.partition("@")
        if not separator:
            return "***"
        visible = local[:1]
        return f"{visible}{'*' * max(3, len(local) - 1)}@{domain}"
    digits = re.sub(r"\D+", "", value)
    return f"***{digits[-4:]}" if digits else "***"


def expire_stale_requests(db: Session, *, member_id: int | None = None) -> int:
    query = db.query(MemberContactChange).filter(
        MemberContactChange.status == "pending",
        MemberContactChange.expires_at <= datetime.utcnow(),
    )
    if member_id is not None:
        query = query.filter(MemberContactChange.member_id == member_id)
    return query.update({MemberContactChange.status: "expired"}, synchronize_session=False)


def email_in_use_for_membership(
    db: Session,
    *,
    member: Member,
    normalized_email: str,
) -> bool:
    """Mirror the member uniqueness boundary: organization + card year + email."""
    query = db.query(Member.id).filter(
        Member.id != member.id,
        Member.org_id == member.org_id,
        Member.deleted_at.is_(None),
        func.lower(func.trim(Member.email)) == normalized_email,
    )
    if member.card_year is None:
        query = query.filter(Member.card_year.is_(None))
    else:
        query = query.filter(Member.card_year == member.card_year)
    return query.first() is not None


def create_contact_change(
    db: Session,
    *,
    member: Member,
    field: str,
    new_value: str,
    requested_ip_hash: str | None,
) -> tuple[MemberContactChange, str, str, str | None]:
    normalized = normalize_contact_value(field, new_value)
    current_raw = (getattr(member, field) or "").strip()
    try:
        current = normalize_contact_value(field, current_raw) if current_raw else ""
    except ValueError:
        # I profili storici possono contenere telefoni in un formato non piu valido.
        # Questo non deve impedire al socio di sostituirli con un valore verificabile.
        current = current_raw
    if normalized == current:
        raise ValueError("Il nuovo contatto coincide con quello attuale")
    if field == "email":
        if email_in_use_for_membership(
            db,
            member=member,
            normalized_email=normalized,
        ):
            raise ValueError("Questo indirizzo email è già associato a un account")

    now = datetime.utcnow()
    expire_stale_requests(db, member_id=member.id)
    db.query(MemberContactChange).filter(
        MemberContactChange.member_id == member.id,
        MemberContactChange.field == field,
        MemberContactChange.status == "pending",
    ).update(
        {
            MemberContactChange.status: "cancelled",
            MemberContactChange.cancelled_at: now,
            MemberContactChange.new_value_encrypted: encrypt_contact_value(""),
            MemberContactChange.authorization_token_hash: None,
        },
        synchronize_session=False,
    )

    raw_token = generate_token()
    raw_authorization_token = generate_token() if field == "email" else None
    request = MemberContactChange(
        member_id=member.id,
        org_id=member.org_id,
        field=field,
        new_value_encrypted=encrypt_contact_value(normalized),
        token_hash=hash_token(raw_token),
        authorization_token_hash=(
            hash_token(raw_authorization_token) if raw_authorization_token else None
        ),
        status="pending",
        expires_at=now + CONTACT_CHANGE_TTL,
        requested_ip_hash=requested_ip_hash,
    )
    db.add(request)
    db.flush()
    return request, raw_token, normalized, raw_authorization_token


def rotate_contact_change_token(
    request: MemberContactChange,
) -> tuple[str, str | None]:
    raw_token = generate_token()
    raw_authorization_token = generate_token() if request.field == "email" else None
    request.token_hash = hash_token(raw_token)
    request.authorization_token_hash = (
        hash_token(raw_authorization_token) if raw_authorization_token else None
    )
    request.authorized_at = None
    request.expires_at = datetime.utcnow() + CONTACT_CHANGE_TTL
    request.status = "pending"
    request.updated_at = datetime.utcnow()
    return raw_token, raw_authorization_token


def serialize_contact_change(request: MemberContactChange) -> dict:
    try:
        masked = mask_contact_value(
            request.field,
            decrypt_contact_value(request.new_value_encrypted),
        )
    except ValueError:
        masked = "***"
    return {
        "id": request.id,
        "field": request.field,
        "masked_new_value": masked,
        "status": request.status,
        "expires_at": request.expires_at.isoformat() if request.expires_at else None,
        "created_at": request.created_at.isoformat() if request.created_at else None,
        "confirmed_at": request.confirmed_at.isoformat() if request.confirmed_at else None,
        "authorized_at": request.authorized_at.isoformat() if request.authorized_at else None,
    }
