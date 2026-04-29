import hashlib
from dataclasses import dataclass
from datetime import datetime

from fastapi import Depends, Header, HTTPException, Request
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import IntegrationApiKey

# bcrypt has 72-byte input limit; bcrypt_sha256 avoids this and is more robust in containers.
pwd_context = CryptContext(schemes=["bcrypt_sha256"], deprecated="auto")

MIN_MEMBER_PASSWORD_LENGTH = 8
INTEGRATION_API_KEY_HEADER = "X-ASSONAM-API-KEY"


@dataclass(frozen=True)
class IntegrationContext:
    key_id: int
    org_id: int
    scopes: list[str]


def _bcrypt_safe(password: str) -> str:
    # bcrypt max 72 bytes -> pre-hash always
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def get_password_hash(password: str) -> str:
    return pwd_context.hash(_bcrypt_safe(password))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(_bcrypt_safe(plain_password), hashed_password)


def hash_api_key(raw_key: str) -> str:
    normalized = (raw_key or "").strip()
    if not normalized:
        return ""
    return hashlib.sha256(f"{normalized}{settings.SECRET_KEY}".encode("utf-8")).hexdigest()


def _normalize_scopes(raw_scopes: object) -> set[str]:
    if not isinstance(raw_scopes, list):
        return set()
    return {str(scope).strip() for scope in raw_scopes if str(scope).strip()}


def _has_required_scope(api_key: IntegrationApiKey, required_scope: str) -> bool:
    normalized_scopes = _normalize_scopes(api_key.scopes or [])
    return required_scope in normalized_scopes


def require_integration_key(scope: str):
    def dependency(
        request: Request,
        db: Session = Depends(get_db),
        x_assonam_api_key: str | None = Header(default=None, alias=INTEGRATION_API_KEY_HEADER),
    ) -> IntegrationContext:
        if not x_assonam_api_key:
            raise HTTPException(status_code=401, detail="Missing integration API key")

        key_hash = hash_api_key(x_assonam_api_key)
        if not key_hash:
            raise HTTPException(status_code=401, detail="Invalid integration API key")

        api_key = (
            db.query(IntegrationApiKey)
            .filter(
                IntegrationApiKey.key_hash == key_hash,
                IntegrationApiKey.is_active.is_(True),
            )
            .first()
        )
        if not api_key:
            raise HTTPException(status_code=401, detail="Invalid integration API key")

        if not _has_required_scope(api_key, scope):
            raise HTTPException(status_code=403, detail="Integration API key scope not allowed")

        api_key.last_used_at = datetime.utcnow()
        api_key.last_used_user_agent = request.headers.get("user-agent")
        api_key.last_used_ip = request.client.host if request.client else None
        db.commit()

        return IntegrationContext(
            key_id=api_key.id,
            org_id=api_key.org_id,
            scopes=sorted(_normalize_scopes(api_key.scopes or [])),
        )

    return dependency
