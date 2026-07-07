from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import hashlib
import hmac
import logging
from typing import Any, Protocol

import requests
from fastapi import HTTPException

from app.config import settings
from app.models import WhatsAppConnection
from app.services.credential_crypto import decrypt_secret, encrypt_secret
from app.services.whatsapp_evolution import (
    EvolutionApiError,
    EvolutionConnectionSnapshot,
    EvolutionLiteClient,
    EvolutionSendTextResult,
    build_evolution_instance_name,
    normalize_phone,
)

logger = logging.getLogger(__name__)

WHATSAPP_PROVIDER_EVOLUTION = "evolution"
WHATSAPP_PROVIDER_GREEN_API = "green_api"
SUPPORTED_WHATSAPP_PROVIDERS = {WHATSAPP_PROVIDER_EVOLUTION, WHATSAPP_PROVIDER_GREEN_API}


class WhatsAppProviderError(RuntimeError):
    def __init__(self, message: str, *, retryable: bool = True) -> None:
        super().__init__(message)
        self.retryable = retryable


@dataclass(frozen=True)
class WhatsAppSendTextResult:
    external_message_id: str | None
    status: str
    raw: dict[str, Any]


class WhatsAppProvider(Protocol):
    provider_name: str

    def connect(self, connection: WhatsAppConnection) -> EvolutionConnectionSnapshot:
        ...

    def get_state(self, connection: WhatsAppConnection) -> EvolutionConnectionSnapshot:
        ...

    def get_qr(self, connection: WhatsAppConnection) -> EvolutionConnectionSnapshot:
        ...

    def logout(self, connection: WhatsAppConnection) -> dict[str, Any]:
        ...

    def delete_instance(self, connection: WhatsAppConnection) -> dict[str, Any]:
        ...

    def send_text(
        self,
        connection: WhatsAppConnection,
        *,
        number: str,
        text: str,
    ) -> WhatsAppSendTextResult | EvolutionSendTextResult:
        ...


def whatsapp_feature_enabled() -> bool:
    return bool(settings.ENABLE_WHATSAPP or settings.ENABLE_WHATSAPP_EVOLUTION)


def normalize_provider_name(value: str | None) -> str:
    normalized = str(value or "").strip().lower().replace("-", "_")
    if normalized in {"green", "greenapi", "green_api"}:
        return WHATSAPP_PROVIDER_GREEN_API
    if normalized in {"evolution", "evolution_api"}:
        return WHATSAPP_PROVIDER_EVOLUTION
    return WHATSAPP_PROVIDER_GREEN_API if normalized == "" else normalized


def default_whatsapp_provider_name() -> str:
    provider = normalize_provider_name(settings.WHATSAPP_PROVIDER)
    if provider in SUPPORTED_WHATSAPP_PROVIDERS:
        if (
            provider == WHATSAPP_PROVIDER_GREEN_API
            and settings.ENABLE_WHATSAPP_EVOLUTION
            and not getattr(settings, "WHATSAPP_PROVIDER_EXPLICIT", False)
        ):
            return WHATSAPP_PROVIDER_EVOLUTION
        return provider
    return WHATSAPP_PROVIDER_EVOLUTION if settings.ENABLE_WHATSAPP_EVOLUTION else WHATSAPP_PROVIDER_GREEN_API


def provider_name_for_connection(connection: WhatsAppConnection | None) -> str:
    if connection is None:
        return default_whatsapp_provider_name()
    raw_provider = getattr(connection, "provider", None)
    if raw_provider is None or not str(raw_provider).strip():
        return WHATSAPP_PROVIDER_EVOLUTION
    provider = normalize_provider_name(raw_provider)
    if provider in SUPPORTED_WHATSAPP_PROVIDERS:
        return provider
    return default_whatsapp_provider_name()


def get_provider_for_connection(connection: WhatsAppConnection) -> WhatsAppProvider:
    provider = provider_name_for_connection(connection)
    if provider == WHATSAPP_PROVIDER_GREEN_API:
        return GreenApiProvider()
    if provider == WHATSAPP_PROVIDER_EVOLUTION:
        return EvolutionProviderAdapter()
    raise WhatsAppProviderError(f"Provider WhatsApp non supportato: {provider}", retryable=False)


def encrypt_green_api_token(raw_token: str) -> str:
    return encrypt_secret(
        raw_token,
        empty_detail="Token Green API obbligatorio.",
        config_detail="Configurazione cifratura credenziali Green API non disponibile.",
    )


def decrypt_green_api_token(encrypted_token: str | None) -> str:
    return decrypt_secret(
        encrypted_token,
        missing_detail="Token Green API non configurato.",
        invalid_detail="Token Green API non decifrabile. Riconfigurare il token.",
        config_detail="Configurazione cifratura credenziali Green API non disponibile.",
    )


def hash_webhook_secret(secret: str | None) -> str | None:
    normalized = (secret or "").strip()
    if not normalized:
        return None
    return hashlib.sha256(f"{normalized}{settings.SECRET_KEY}".encode("utf-8")).hexdigest()


def verify_webhook_secret(secret: str | None, stored_hash: str | None) -> bool:
    normalized_hash = (stored_hash or "").strip()
    if not normalized_hash:
        return True
    candidate_hash = hash_webhook_secret(secret)
    if not candidate_hash:
        return False
    return hmac.compare_digest(candidate_hash, normalized_hash)


class EvolutionProviderAdapter:
    provider_name = WHATSAPP_PROVIDER_EVOLUTION

    def __init__(self, client: EvolutionLiteClient | None = None) -> None:
        self.client = client or EvolutionLiteClient()

    def connect(self, connection: WhatsAppConnection) -> EvolutionConnectionSnapshot:
        try:
            self.client.ensure_instance(org_id=connection.org_id)
            return self.client.connect(connection.instance_name)
        except EvolutionApiError as exc:
            raise WhatsAppProviderError(str(exc), retryable=True) from exc

    def get_state(self, connection: WhatsAppConnection) -> EvolutionConnectionSnapshot:
        try:
            return self.client.get_connection_state(connection.instance_name)
        except EvolutionApiError as exc:
            raise WhatsAppProviderError(str(exc), retryable=True) from exc

    def get_qr(self, connection: WhatsAppConnection) -> EvolutionConnectionSnapshot:
        try:
            return self.client.get_qr(connection.instance_name)
        except EvolutionApiError as exc:
            raise WhatsAppProviderError(str(exc), retryable=True) from exc

    def logout(self, connection: WhatsAppConnection) -> dict[str, Any]:
        try:
            return self.client.logout(connection.instance_name)
        except EvolutionApiError as exc:
            raise WhatsAppProviderError(str(exc), retryable=True) from exc

    def delete_instance(self, connection: WhatsAppConnection) -> dict[str, Any]:
        try:
            return self.client.delete_instance(connection.instance_name)
        except EvolutionApiError as exc:
            raise WhatsAppProviderError(str(exc), retryable=True) from exc

    def send_text(
        self,
        connection: WhatsAppConnection,
        *,
        number: str,
        text: str,
    ) -> EvolutionSendTextResult:
        try:
            return self.client.send_text(connection.instance_name, number=number, text=text)
        except EvolutionApiError as exc:
            raise WhatsAppProviderError(str(exc), retryable=True) from exc


class GreenApiProvider:
    provider_name = WHATSAPP_PROVIDER_GREEN_API

    def __init__(self, *, timeout_seconds: int = 20) -> None:
        self.timeout_seconds = timeout_seconds

    def connect(self, connection: WhatsAppConnection) -> EvolutionConnectionSnapshot:
        return self.get_qr(connection)

    def get_state(self, connection: WhatsAppConnection) -> EvolutionConnectionSnapshot:
        payload = self._request(connection, "GET", "getStateInstance")
        state = str(payload.get("stateInstance") or "").strip()
        return self._snapshot_from_state(state, raw=payload)

    def get_qr(self, connection: WhatsAppConnection) -> EvolutionConnectionSnapshot:
        payload = self._request(connection, "GET", "qr")
        response_type = str(payload.get("type") or "").strip()
        message = str(payload.get("message") or "").strip()
        if response_type == "alreadyLogged":
            return self._snapshot_from_state("authorized", raw=payload)
        if response_type == "qrCode" and message:
            qr_code = message if message.startswith("data:") else f"data:image/png;base64,{message}"
            return EvolutionConnectionSnapshot(
                raw_state="notAuthorized",
                status="qr_required",
                qr_code=qr_code,
                phone_number=None,
                profile_name=None,
                last_error=None,
                connected_at=None,
                raw=payload,
            )
        last_error = message or "QR Green API non disponibile."
        return EvolutionConnectionSnapshot(
            raw_state=response_type or "error",
            status="error",
            qr_code=None,
            phone_number=None,
            profile_name=None,
            last_error=last_error,
            connected_at=None,
            raw=payload,
        )

    def logout(self, connection: WhatsAppConnection) -> dict[str, Any]:
        payload = self._request(connection, "GET", "logout")
        return payload if isinstance(payload, dict) else {"ok": True}

    def delete_instance(self, connection: WhatsAppConnection) -> dict[str, Any]:
        self.logout(connection)
        return {"ok": True, "provider": self.provider_name, "remote_delete_supported": False}

    def send_text(
        self,
        connection: WhatsAppConnection,
        *,
        number: str,
        text: str,
    ) -> WhatsAppSendTextResult:
        chat_id = green_chat_id_for_number(number)
        if not chat_id:
            raise WhatsAppProviderError("Numero WhatsApp non valido.", retryable=False)
        payload = self._request(
            connection,
            "POST",
            "sendMessage",
            json={"chatId": chat_id, "message": text},
        )
        external_message_id = None
        for key in ("idMessage", "id", "messageId"):
            value = payload.get(key) if isinstance(payload, dict) else None
            if isinstance(value, str) and value.strip():
                external_message_id = value.strip()
                break
        return WhatsAppSendTextResult(
            external_message_id=external_message_id,
            status="sent",
            raw=payload if isinstance(payload, dict) else {},
        )

    def _snapshot_from_state(self, state: str, *, raw: dict[str, Any]) -> EvolutionConnectionSnapshot:
        normalized = state.strip()
        status = green_state_to_status(normalized)
        return EvolutionConnectionSnapshot(
            raw_state=normalized,
            status=status,
            qr_code=None,
            phone_number=_extract_green_phone(raw),
            profile_name=_extract_green_profile_name(raw),
            last_error=None if status != "error" else f"Stato Green API: {normalized or 'unknown'}",
            connected_at=datetime.utcnow() if status == "connected" else None,
            raw=raw,
        )

    def _request(
        self,
        connection: WhatsAppConnection,
        method: str,
        action: str,
        *,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        instance_id = str(getattr(connection, "provider_instance_id", "") or "").strip()
        if not instance_id:
            raise WhatsAppProviderError("ID istanza Green API non configurato.", retryable=False)
        token = decrypt_green_api_token(getattr(connection, "provider_token_encrypted", None))
        api_url = (
            str(getattr(connection, "provider_api_url", "") or "").strip()
            or settings.GREEN_API_BASE_URL
            or "https://api.green-api.com"
        ).rstrip("/")
        url = f"{api_url}/waInstance{instance_id}/{action}/{token}"
        try:
            response = requests.request(
                method=method.upper(),
                url=url,
                json=json,
                headers={"Content-Type": "application/json"},
                timeout=self.timeout_seconds,
            )
        except requests.RequestException as exc:
            raise WhatsAppProviderError("Green API non raggiungibile.", retryable=True) from exc

        try:
            payload = response.json()
        except ValueError:
            payload = {}

        if response.ok:
            return payload if isinstance(payload, dict) else {}

        detail = _provider_error_detail(payload) or response.text[:500] or response.reason or "Errore Green API"
        retryable = response.status_code in {408, 429} or response.status_code >= 500
        raise WhatsAppProviderError(
            f"Green API {response.status_code}: {detail}",
            retryable=retryable,
        )


def green_state_to_status(raw_state: str | None) -> str:
    state = (raw_state or "").strip().lower()
    if state == "authorized":
        return "connected"
    if state == "notauthorized":
        return "qr_required"
    if state in {"starting", "sleepmode"}:
        return "not_connected"
    if state in {"blocked", "yellowcard", "suspended"}:
        return "error"
    return "not_connected"


def green_chat_id_for_number(value: str | None) -> str | None:
    cleaned = str(value or "").strip()
    if cleaned.endswith("@g.us"):
        return cleaned
    if cleaned.endswith("@c.us"):
        return cleaned
    normalized_phone = normalize_phone(cleaned)
    if not normalized_phone:
        return None
    return f"{normalized_phone.lstrip('+')}@c.us"


def ensure_connection_provider_defaults(connection: WhatsAppConnection) -> None:
    provider = provider_name_for_connection(connection)
    connection.provider = provider
    if not connection.instance_name:
        connection.instance_name = build_evolution_instance_name(connection.org_id)
    if provider == WHATSAPP_PROVIDER_GREEN_API and not connection.provider_api_url:
        connection.provider_api_url = settings.GREEN_API_BASE_URL


def _provider_error_detail(payload: object) -> str | None:
    if isinstance(payload, dict):
        for key in ("message", "error", "detail", "description"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def _extract_green_phone(payload: dict[str, Any]) -> str | None:
    for key in ("phone", "wid", "sender", "chatId"):
        normalized = normalize_phone(payload.get(key) if isinstance(payload.get(key), str) else None)
        if normalized:
            return normalized
    return None


def _extract_green_profile_name(payload: dict[str, Any]) -> str | None:
    for key in ("profileName", "name", "pushName"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def raise_provider_http_error(exc: WhatsAppProviderError) -> None:
    status_code = 503 if exc.retryable else 400
    raise HTTPException(status_code=status_code, detail=str(exc)) from exc
