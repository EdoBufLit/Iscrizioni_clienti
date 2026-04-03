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
    "CONTACTS_SET",
    "CONTACTS_UPSERT",
    "CONTACTS_UPDATE",
    "CHATS_SET",
    "CHATS_UPSERT",
    "CHATS_UPDATE",
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


@dataclass(frozen=True)
class EvolutionInstanceRecord:
    instance_name: str
    connection_status: str | None
    disconnection_reason_code: int | None
    disconnection_object: str | None
    raw: dict[str, Any]


@dataclass(frozen=True)
class EvolutionContact:
    remote_jid: str
    display_name: str | None
    phone_number: str | None
    profile_pic_url: str | None
    created_at: datetime | None
    updated_at: datetime | None
    raw: dict[str, Any]


@dataclass(frozen=True)
class EvolutionChat:
    remote_jid: str
    display_name: str | None
    updated_at: datetime | None
    last_message_text: str | None
    last_message_at: datetime | None
    raw: dict[str, Any]


@dataclass(frozen=True)
class EvolutionHistoryMessage:
    external_message_id: str | None
    remote_jid: str | None
    created_at: datetime | None
    raw: dict[str, Any]


def build_evolution_instance_name(org_id: int) -> str:
    return f"assonam-org-{int(org_id)}"


def _split_whatsapp_identifier(value: str | None) -> tuple[str | None, str | None]:
    cleaned = str(value or "").strip()
    if not cleaned:
        return None, None
    if "@" not in cleaned:
        return cleaned, None
    local_part, domain = cleaned.split("@", 1)
    return local_part.strip() or None, domain.strip().lower() or None


def is_whatsapp_group_jid(value: str | None) -> bool:
    _local_part, domain = _split_whatsapp_identifier(value)
    return domain == "g.us"


def _extract_phone_digits(value: str | None) -> tuple[str | None, bool]:
    local_part, domain = _split_whatsapp_identifier(value)
    if local_part is None:
        return None, False
    local_value = local_part.split(":", 1)[0].strip()
    digits = "".join(ch for ch in local_value if ch.isdigit())
    return (digits or None), domain is not None


def normalize_phone(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    if not cleaned:
        return None
    digits, is_jid = _extract_phone_digits(cleaned)
    if not digits:
        return None
    if cleaned.startswith("+"):
        return f"+{digits}"
    if cleaned.startswith("00"):
        intl_digits = digits[2:] if digits.startswith("00") else digits
        return f"+{intl_digits}" if intl_digits else None
    if is_jid or (len(digits) >= 11 and digits.startswith("39")):
        return f"+{digits}"
    return f"+39{digits}"


def canonicalize_whatsapp_chat_id(value: str | None) -> str | None:
    cleaned = str(value or "").strip()
    if not cleaned:
        return None
    if is_whatsapp_group_jid(cleaned):
        return cleaned
    normalized_phone = normalize_phone(cleaned)
    if normalized_phone is None:
        return None
    return f"{normalized_phone.lstrip('+')}@s.whatsapp.net"


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


def _extract_error_detail(payload: Any) -> str | None:
    if isinstance(payload, str):
        cleaned = payload.strip()
        return cleaned or None
    if isinstance(payload, list):
        for item in payload:
            detail = _extract_error_detail(item)
            if detail:
                return detail
        return None
    if not isinstance(payload, dict):
        return None

    for key in ("message", "response", "detail", "error"):
        detail = _extract_error_detail(payload.get(key))
        if detail:
            return detail
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


def _parse_instance_record(payload: Any) -> EvolutionInstanceRecord | None:
    if not isinstance(payload, dict):
        return None
    name = payload.get("name")
    if not isinstance(name, str) or not name.strip():
        return None
    reason_code = payload.get("disconnectionReasonCode")
    if not isinstance(reason_code, int):
        reason_code = None
    disconnection_object = payload.get("disconnectionObject")
    if not isinstance(disconnection_object, str):
        disconnection_object = None
    connection_status = payload.get("connectionStatus")
    if not isinstance(connection_status, str):
        connection_status = None
    return EvolutionInstanceRecord(
        instance_name=name.strip(),
        connection_status=connection_status.strip().lower() if connection_status else None,
        disconnection_reason_code=reason_code,
        disconnection_object=disconnection_object,
        raw=payload,
    )


def _instance_requires_recreate(record: EvolutionInstanceRecord | None) -> bool:
    if record is None:
        return False
    if record.disconnection_reason_code != 401:
        return False
    detail = (record.disconnection_object or "").lower()
    return "device_removed" in detail or "conflict" in detail


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


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _parse_timestamp_value(value: Any) -> datetime | None:
    parsed = _parse_datetime(value)
    if parsed is not None:
        return parsed
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.isdigit():
            value = int(stripped)
    if isinstance(value, (int, float)):
        timestamp = float(value)
        if timestamp > 10_000_000_000:
            timestamp = timestamp / 1000.0
        return datetime.utcfromtimestamp(timestamp)
    return None


def _parse_contact(payload: Any) -> EvolutionContact | None:
    if not isinstance(payload, dict):
        return None
    remote_jid = payload.get("remoteJid")
    if not isinstance(remote_jid, str) or not remote_jid.strip():
        return None
    display_name = None
    for candidate in (payload.get("pushName"), payload.get("profileName"), payload.get("name")):
        if isinstance(candidate, str) and candidate.strip():
            display_name = candidate.strip()
            break
    profile_pic_url = payload.get("profilePicUrl")
    if not isinstance(profile_pic_url, str) or not profile_pic_url.strip():
        profile_pic_url = None
    return EvolutionContact(
        remote_jid=canonicalize_whatsapp_chat_id(remote_jid) or remote_jid.strip(),
        display_name=display_name,
        phone_number=normalize_phone(remote_jid),
        profile_pic_url=profile_pic_url,
        created_at=_parse_datetime(payload.get("createdAt")),
        updated_at=_parse_datetime(payload.get("updatedAt")),
        raw=payload,
    )


def _extract_text_preview(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    for candidate in (payload.get("text"), payload.get("body")):
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    message = payload.get("message")
    if isinstance(message, dict):
        conversation = message.get("conversation")
        if isinstance(conversation, str) and conversation.strip():
            return conversation.strip()
        extended = message.get("extendedTextMessage")
        if isinstance(extended, dict):
            text_value = extended.get("text")
            if isinstance(text_value, str) and text_value.strip():
                return text_value.strip()
    return None


def _parse_chat(payload: Any) -> EvolutionChat | None:
    if not isinstance(payload, dict):
        return None
    remote_jid = payload.get("remoteJid")
    if not isinstance(remote_jid, str) or not remote_jid.strip():
        return None
    display_name = None
    for candidate in (payload.get("pushName"), payload.get("profileName"), payload.get("name")):
        if isinstance(candidate, str) and candidate.strip():
            display_name = candidate.strip()
            break
    last_message = payload.get("lastMessage")
    if not isinstance(last_message, dict):
        last_message = {}
    updated_at = _parse_timestamp_value(payload.get("updatedAt")) or _parse_timestamp_value(payload.get("windowStart"))
    last_message_at = _parse_timestamp_value(last_message.get("messageTimestamp")) or updated_at
    return EvolutionChat(
        remote_jid=canonicalize_whatsapp_chat_id(remote_jid) or remote_jid.strip(),
        display_name=display_name,
        updated_at=updated_at,
        last_message_text=_extract_text_preview(last_message),
        last_message_at=last_message_at,
        raw=payload,
    )


def _parse_history_message(payload: Any) -> EvolutionHistoryMessage | None:
    if not isinstance(payload, dict):
        return None
    key = payload.get("key")
    remote_jid = key.get("remoteJid") if isinstance(key, dict) else None
    if not isinstance(remote_jid, str) or not remote_jid.strip():
        remote_jid = None
    return EvolutionHistoryMessage(
        external_message_id=_extract_message_id(payload),
        remote_jid=(
            canonicalize_whatsapp_chat_id(remote_jid) or remote_jid.strip()
            if isinstance(remote_jid, str) and remote_jid.strip()
            else None
        ),
        created_at=_parse_timestamp_value(payload.get("messageTimestamp")),
        raw=payload,
    )


def parse_connection_snapshot(payload: Any) -> EvolutionConnectionSnapshot:
    raw = payload if isinstance(payload, dict) else {}
    instance = raw.get("instance") if isinstance(raw.get("instance"), dict) else {}
    qrcode = _normalize_qr_payload(
        raw.get("qrcode")
        or instance.get("qrcode")
        or {
            "base64": raw.get("base64"),
            "code": raw.get("code"),
            "pairingCode": raw.get("pairingCode"),
        }
    )
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
    if not raw_state and "count" in raw:
        raw_state = "connecting"
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
            "qrcode": False,
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
            record = self.fetch_instance(instance_name)
            if _instance_requires_recreate(record):
                self.delete_instance(instance_name)
                payload = self._request(
                    "POST",
                    f"{EVOLUTION_INSTANCE_PREFIX}/create",
                    json=body,
                )
            else:
                self.set_webhook(instance_name)
                self.ensure_runtime_settings(instance_name)
                return {"instance": {"instanceName": instance_name}}
        self.set_webhook(instance_name)
        self.ensure_runtime_settings(instance_name)
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
        self.ensure_runtime_settings(instance_name)
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

    def delete_instance(self, instance_name: str) -> dict[str, Any]:
        return self._request(
            "DELETE",
            f"{EVOLUTION_INSTANCE_PREFIX}/delete/{instance_name}",
        )

    def fetch_instance(self, instance_name: str) -> EvolutionInstanceRecord | None:
        payload = self._request(
            "GET",
            f"{EVOLUTION_INSTANCE_PREFIX}/fetchInstances",
        )
        for item in payload.get("instances", []) if isinstance(payload, dict) else []:
            record = _parse_instance_record(item)
            if record and record.instance_name == instance_name:
                return record
        if isinstance(payload, list):
            for item in payload:
                record = _parse_instance_record(item)
                if record and record.instance_name == instance_name:
                    return record
        return None

    def get_settings(self, instance_name: str) -> dict[str, Any]:
        payload = self._request(
            "GET",
            f"/settings/find/{instance_name}",
        )
        return payload if isinstance(payload, dict) else {}

    def ensure_runtime_settings(self, instance_name: str) -> dict[str, Any]:
        current = self.get_settings(instance_name)
        desired = {
            "rejectCall": bool(current.get("rejectCall", False)),
            "msgCall": current.get("msgCall") if isinstance(current.get("msgCall"), str) else "",
            "groupsIgnore": bool(current.get("groupsIgnore", False)),
            "alwaysOnline": bool(current.get("alwaysOnline", False)),
            "readMessages": bool(current.get("readMessages", False)),
            "readStatus": bool(current.get("readStatus", False)),
            "syncFullHistory": True,
            "wavoipToken": current.get("wavoipToken") if isinstance(current.get("wavoipToken"), str) else "",
        }
        if all(current.get(key) == value for key, value in desired.items()):
            return {"settings": {"instanceName": instance_name, "settings": desired}}
        return self._request(
            "POST",
            f"/settings/set/{instance_name}",
            json=desired,
        )

    def list_contacts(
        self,
        instance_name: str,
        *,
        page: int = 1,
        limit: int = 250,
        max_pages: int = 20,
    ) -> list[EvolutionContact]:
        contacts: list[EvolutionContact] = []
        seen_remote_jids: set[str] = set()
        current_page = max(1, int(page))
        page_limit = max(1, int(limit))
        for _ in range(max(1, int(max_pages))):
            payload = self._request(
                "POST",
                f"/chat/findContacts/{instance_name}",
                json={"page": current_page, "limit": page_limit},
            )
            items = payload if isinstance(payload, list) else []
            if not items:
                break
            page_added = 0
            for item in items:
                contact = _parse_contact(item)
                if contact is None or contact.remote_jid in seen_remote_jids:
                    continue
                seen_remote_jids.add(contact.remote_jid)
                contacts.append(contact)
                page_added += 1
            if len(items) < page_limit or page_added == 0:
                break
            current_page += 1
        contacts.sort(
            key=lambda contact: (
                contact.updated_at or contact.created_at or datetime.min,
                (contact.display_name or contact.phone_number or contact.remote_jid).lower(),
            ),
            reverse=True,
        )
        return contacts

    def list_chats(
        self,
        instance_name: str,
        *,
        page: int = 1,
        limit: int = 100,
        max_pages: int = 5,
    ) -> list[EvolutionChat]:
        chats: list[EvolutionChat] = []
        seen_remote_jids: set[str] = set()
        current_page = max(1, int(page))
        page_limit = max(1, int(limit))
        for _ in range(max(1, int(max_pages))):
            payload = self._request(
                "POST",
                f"/chat/findChats/{instance_name}",
                json={"page": current_page, "offset": page_limit},
            )
            items = payload if isinstance(payload, list) else []
            if not items:
                break
            page_added = 0
            for item in items:
                chat = _parse_chat(item)
                if chat is None or chat.remote_jid in seen_remote_jids:
                    continue
                seen_remote_jids.add(chat.remote_jid)
                chats.append(chat)
                page_added += 1
            if len(items) < page_limit or page_added == 0:
                break
            current_page += 1
        chats.sort(
            key=lambda chat: (
                chat.last_message_at or chat.updated_at or datetime.min,
                (chat.display_name or chat.remote_jid).lower(),
            ),
            reverse=True,
        )
        return chats

    def list_messages(
        self,
        instance_name: str,
        *,
        remote_jid: str,
        page: int = 1,
        limit: int = 100,
        max_pages: int = 5,
    ) -> list[EvolutionHistoryMessage]:
        messages: list[EvolutionHistoryMessage] = []
        seen_keys: set[str] = set()
        current_page = max(1, int(page))
        page_limit = max(1, int(limit))
        for _ in range(max(1, int(max_pages))):
            payload = self._request(
                "POST",
                f"/chat/findMessages/{instance_name}",
                json={
                    "where": {"key": {"remoteJid": remote_jid}},
                    "page": current_page,
                    "offset": page_limit,
                },
            )
            records: list[Any] = []
            if isinstance(payload, dict):
                messages_payload = payload.get("messages")
                if isinstance(messages_payload, dict):
                    maybe_records = messages_payload.get("records")
                    if isinstance(maybe_records, list):
                        records = maybe_records
            if not records:
                break
            page_added = 0
            for record in records:
                message = _parse_history_message(record)
                if message is None:
                    continue
                dedupe_key = message.external_message_id or repr(message.raw)
                if dedupe_key in seen_keys:
                    continue
                seen_keys.add(dedupe_key)
                messages.append(message)
                page_added += 1
            if len(records) < page_limit or page_added == 0:
                break
            current_page += 1
        messages.sort(key=lambda message: message.created_at or datetime.min)
        return messages

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
    ) -> Any:
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
            detail = _extract_error_detail(parsed)
            message = detail or f"Evolution API error ({response.status_code})"
            raise EvolutionApiError(message)
        if not isinstance(parsed, (dict, list)):
            logger.warning("evolution_api_unexpected_payload path=%s type=%s", path, type(parsed).__name__)
            return {}
        return parsed
