from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import logging
from typing import Any

import requests

from app.config import settings

logger = logging.getLogger(__name__)

EVOLUTION_INSTANCE_PREFIX = "/instance"
EVOLUTION_MESSAGE_PREFIX = "/message"
EVOLUTION_WEBHOOK_PREFIX = "/webhook"

EVOLUTION_WEBHOOK_EVENTS = [
    "QRCODE_UPDATED",
    "CONNECTION_UPDATE",
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "SEND_MESSAGE",
]
EVOLUTION_INTERNAL_WEBHOOK_URL = "http://web:8000/api/internal/whatsapp/evolution"


class EvolutionApiError(RuntimeError):
    pass


@dataclass(frozen=True)
class EvolutionConnectionSnapshot:
    raw_state: str
    status: str
    qr_code: str | None
    phone_number: str | None
    profile_name: str | None
    last_error: str | None
    connected_at: datetime | None
    raw: dict[str, Any]


@dataclass(frozen=True)
class EvolutionSendTextResult:
    external_message_id: str | None
    status: str
    raw: dict[str, Any]


def build_evolution_instance_name(org_id: int) -> str:
    return f"assonam-org-{int(org_id)}"


def normalize_phone(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    if not cleaned:
        return None
    if "@" in cleaned:
        cleaned = cleaned.split("@", 1)[0]
    digits = "".join(ch for ch in cleaned if ch.isdigit())
    if not digits:
        return None
    return f"+{digits}"


def resolve_connection_status(
    raw_state: str | None,
    *,
    has_qr: bool,
    last_error: str | None = None,
) -> str:
    state = (raw_state or "").strip().lower()
    if state == "open":
        return "connected"
    if state in {"connecting", "pairing"}:
        return "qr_required"
    if state in {"close", "closed", "logout"}:
        return "qr_required" if has_qr else "not_connected"
    if last_error:
        return "error"
    return "qr_required" if has_qr else "not_connected"


def _normalize_qr_payload(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, dict):
        base64_value = value.get("base64")
        if isinstance(base64_value, str) and base64_value.strip():
            return base64_value.strip()
        code_value = value.get("code")
        if isinstance(code_value, str) and code_value.strip():
            return code_value.strip()
        pairing_code = value.get("pairingCode")
        if isinstance(pairing_code, str) and pairing_code.strip():
            return pairing_code.strip()
        return None
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None
    return None


def _extract_message_id(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    key = payload.get("key")
    if isinstance(key, dict):
        key_id = key.get("id")
        if isinstance(key_id, str) and key_id.strip():
            return key_id.strip()
    for candidate in (
        payload.get("id"),
        payload.get("messageId"),
        payload.get("message_id"),
        payload.get("keyId"),
    ):
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    data = payload.get("data")
    if isinstance(data, dict):
        return _extract_message_id(data)
    return None


def _extract_profile_name(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    for candidate in (
        payload.get("profileName"),
        payload.get("profile_name"),
        payload.get("pushName"),
        payload.get("name"),
    ):
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    instance = payload.get("instance")
    if isinstance(instance, dict):
        return _extract_profile_name(instance)
    return None


def _extract_phone_number(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    for candidate in (
        payload.get("number"),
        payload.get("ownerJid"),
        payload.get("wuid"),
        payload.get("phone"),
        payload.get("remoteJid"),
    ):
        normalized = normalize_phone(candidate if isinstance(candidate, str) else None)
        if normalized:
            return normalized
    instance = payload.get("instance")
    if isinstance(instance, dict):
        return _extract_phone_number(instance)
    return None


def parse_connection_snapshot(payload: Any) -> EvolutionConnectionSnapshot:
    raw = payload if isinstance(payload, dict) else {}
    instance = raw.get("instance") if isinstance(raw.get("instance"), dict) else {}
    qrcode = _normalize_qr_payload(raw.get("qrcode") or instance.get("qrcode"))
    raw_state = ""
    for candidate in (
        instance.get("state"),
        instance.get("status"),
        raw.get("state"),
        raw.get("status"),
        raw.get("message"),
    ):
        if isinstance(candidate, str) and candidate.strip():
            raw_state = candidate.strip()
            break
    last_error = None
    error_value = raw.get("error")
    if isinstance(error_value, str) and error_value.strip():
        last_error = error_value.strip()
    elif raw.get("error") is True and isinstance(raw.get("message"), str):
        last_error = raw["message"].strip() or None
    profile_name = _extract_profile_name(raw) or _extract_profile_name(instance)
    phone_number = _extract_phone_number(raw) or _extract_phone_number(instance)
    status = resolve_connection_status(raw_state, has_qr=bool(qrcode), last_error=last_error)
    connected_at = datetime.utcnow() if status == "connected" else None
    return EvolutionConnectionSnapshot(
        raw_state=raw_state.lower(),
        status=status,
        qr_code=qrcode,
        phone_number=phone_number,
        profile_name=profile_name,
        last_error=last_error,
        connected_at=connected_at,
        raw=raw,
    )


class EvolutionLiteClient:
    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout_seconds: int = 15,
    ) -> None:
        self.base_url = (base_url or settings.EVOLUTION_API_BASE_URL or "").rstrip("/")
        self.api_key = (api_key or settings.EVOLUTION_API_KEY or "").strip()
        self.timeout_seconds = timeout_seconds

    def ensure_instance(self, *, org_id: int) -> dict[str, Any]:
        instance_name = build_evolution_instance_name(org_id)
        body = {
            "instanceName": instance_name,
            "qrcode": True,
            "integration": "WHATSAPP-BAILEYS",
            "webhook": {
                "enabled": True,
                "url": EVOLUTION_INTERNAL_WEBHOOK_URL,
                "headers": {"X-Evolution-ApiKey": self.api_key},
                "events": EVOLUTION_WEBHOOK_EVENTS,
                "byEvents": False,
                "base64": False,
            },
        }
        try:
            payload = self._request(
                "POST",
                f"{EVOLUTION_INSTANCE_PREFIX}/create",
                json=body,
            )
        except EvolutionApiError as exc:
            if "already" not in str(exc).lower() and "exist" not in str(exc).lower():
                raise
            self.set_webhook(instance_name)
            return {"instance": {"instanceName": instance_name}}
        self.set_webhook(instance_name)
        return payload

    def set_webhook(self, instance_name: str) -> dict[str, Any]:
        body = {
            "webhook": {
                "enabled": True,
                "url": EVOLUTION_INTERNAL_WEBHOOK_URL,
                "headers": {"X-Evolution-ApiKey": self.api_key},
                "events": EVOLUTION_WEBHOOK_EVENTS,
                "byEvents": False,
                "base64": False,
            }
        }
        return self._request(
            "POST",
            f"{EVOLUTION_WEBHOOK_PREFIX}/set/{instance_name}",
            json=body,
        )

    def connect(self, instance_name: str) -> EvolutionConnectionSnapshot:
        payload = self._request(
            "GET",
            f"{EVOLUTION_INSTANCE_PREFIX}/connect/{instance_name}",
        )
        return parse_connection_snapshot(payload)

    def get_connection_state(self, instance_name: str) -> EvolutionConnectionSnapshot:
        payload = self._request(
            "GET",
            f"{EVOLUTION_INSTANCE_PREFIX}/connectionState/{instance_name}",
        )
        return parse_connection_snapshot(payload)

    def get_qr(self, instance_name: str) -> EvolutionConnectionSnapshot:
        payload = self._request(
            "GET",
            f"{EVOLUTION_INSTANCE_PREFIX}/connect/{instance_name}",
        )
        return parse_connection_snapshot(payload)

    def logout(self, instance_name: str) -> dict[str, Any]:
        return self._request(
            "DELETE",
            f"{EVOLUTION_INSTANCE_PREFIX}/logout/{instance_name}",
        )

    def send_text(self, instance_name: str, *, number: str, text: str) -> EvolutionSendTextResult:
        payload = self._request(
            "POST",
            f"{EVOLUTION_MESSAGE_PREFIX}/sendText/{instance_name}",
            json={"number": normalize_phone(number) or number, "text": text},
        )
        external_message_id = _extract_message_id(payload)
        status = "sent"
        if isinstance(payload.get("status"), str) and payload["status"].strip():
            status = payload["status"].strip().lower()
        return EvolutionSendTextResult(
            external_message_id=external_message_id,
            status=status,
            raw=payload,
        )

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self.base_url:
            raise EvolutionApiError("EVOLUTION_API_BASE_URL non configurato.")
        if not self.api_key:
            raise EvolutionApiError("EVOLUTION_API_KEY non configurata.")

        url = f"{self.base_url}{path}"
        try:
            response = requests.request(
                method=method.upper(),
                url=url,
                json=json,
                headers={
                    "Content-Type": "application/json",
                    "apikey": self.api_key,
                },
                timeout=self.timeout_seconds,
            )
        except requests.RequestException as exc:
            raise EvolutionApiError("Evolution API non raggiungibile.") from exc

        try:
            parsed = response.json()
        except ValueError:
            parsed = {}
        if not response.ok:
            detail = None
            if isinstance(parsed, dict):
                detail = parsed.get("message") or parsed.get("error") or parsed.get("response")
            message = str(detail).strip() if detail else f"Evolution API error ({response.status_code})"
            raise EvolutionApiError(message)
        if not isinstance(parsed, dict):
            logger.warning("evolution_api_unexpected_payload path=%s type=%s", path, type(parsed).__name__)
            return {}
        return parsed
