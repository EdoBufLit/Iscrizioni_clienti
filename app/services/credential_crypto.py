from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException

from app.config import settings


def derive_fernet_key(raw_secret: str) -> bytes:
    digest = hashlib.sha256(raw_secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def get_credentials_fernet(*, config_detail: str) -> Fernet:
    raw_secret = (settings.SUMUP_CREDENTIALS_ENCRYPTION_KEY or "").strip()
    if not raw_secret:
        raise HTTPException(status_code=503, detail=config_detail)
    return Fernet(derive_fernet_key(raw_secret))


def encrypt_secret(
    raw_value: str,
    *,
    empty_detail: str,
    config_detail: str,
) -> str:
    normalized = (raw_value or "").strip()
    if not normalized:
        raise HTTPException(status_code=400, detail=empty_detail)
    return get_credentials_fernet(config_detail=config_detail).encrypt(
        normalized.encode("utf-8")
    ).decode("utf-8")


def decrypt_secret(
    encrypted_value: str | None,
    *,
    missing_detail: str,
    invalid_detail: str,
    config_detail: str,
) -> str:
    normalized = (encrypted_value or "").strip()
    if not normalized:
        raise HTTPException(status_code=400, detail=missing_detail)
    try:
        return get_credentials_fernet(config_detail=config_detail).decrypt(
            normalized.encode("utf-8")
        ).decode("utf-8")
    except InvalidToken as exc:
        raise HTTPException(status_code=500, detail=invalid_detail) from exc
