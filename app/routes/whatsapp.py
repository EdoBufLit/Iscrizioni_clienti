from __future__ import annotations

import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, ValidationError, model_validator
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.log_redaction import hash_identifier, redact_url
from app.services.whatsapp_bot import handle_whatsapp_bot_message

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])
logger = logging.getLogger(__name__)


class WhatsAppWebhook(BaseModel):
    model_config = ConfigDict(extra="allow")

    from_: str | None = None
    body: str | None = None
    to: str | None = None
    message_sid: str | None = None
    wa_id: str | None = None
    profile_name: str | None = None
    num_media: int | None = None
    sms_sid: str | None = None
    sms_status: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _normalize_keys(cls, value):
        if not isinstance(value, dict):
            return value
        copied = dict(value)
        key_map = {
            "from": "from_",
            "from_": "from_",
            "body": "body",
            "to": "to",
            "messagesid": "message_sid",
            "waid": "wa_id",
            "profilename": "profile_name",
            "nummedia": "num_media",
            "smssid": "sms_sid",
            "smsstatus": "sms_status",
        }
        for raw_key, raw_value in value.items():
            normalized_key = key_map.get(str(raw_key).lower())
            if normalized_key:
                copied[normalized_key] = raw_value
        for address_key in ("from_", "to"):
            if address_key in copied and isinstance(copied[address_key], str):
                copied[address_key] = re.sub(
                    r"^(whatsapp:)\s+(\d)",
                    r"\1+\2",
                    copied[address_key].strip(),
                    flags=re.IGNORECASE,
                )
        return copied


async def _read_webhook_payload(request: Request) -> dict[str, object]:
    content_type = (request.headers.get("content-type") or "").lower()
    if "application/json" in content_type:
        payload = await request.json()
        return payload if isinstance(payload, dict) else {}

    form = await request.form()
    data: dict[str, object] = {}
    for key, value in form.multi_items():
        data[str(key)] = value if isinstance(value, str) else str(value)
    return data


def _resolve_webhook_url(request: Request) -> str:
    url = request.url
    proto = (request.headers.get("x-forwarded-proto") or url.scheme or "https").split(
        ",", 1
    )[0].strip()
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or url.netloc).split(
        ",", 1
    )[0].strip()
    path = url.path or ""
    query = f"?{url.query}" if url.query else ""
    return f"{proto}://{host}{path}{query}"


async def _validate_twilio_signature(
    request: Request,
    payload_data: dict[str, object],
) -> None:
    auth_token = (settings.TWILIO_AUTH_TOKEN or "").strip()
    if not auth_token:
        return

    signature = (request.headers.get("x-twilio-signature") or "").strip()
    if not signature:
        raise HTTPException(status_code=403, detail="Missing Twilio signature")

    try:
        from twilio.request_validator import RequestValidator
    except Exception as exc:
        logger.exception("twilio_signature_validator_unavailable")
        raise HTTPException(
            status_code=503,
            detail="Twilio signature validator unavailable",
        ) from exc

    content_type = (request.headers.get("content-type") or "").lower()
    validator = RequestValidator(auth_token)
    url = _resolve_webhook_url(request)
    if "application/json" in content_type:
        params: object = (await request.body()).decode("utf-8", errors="replace")
    else:
        params = {str(key): str(value) for key, value in payload_data.items()}

    if not validator.validate(url, params, signature):
        logger.warning("whatsapp_webhook_invalid_signature url=%s", redact_url(url))
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")


@router.post("/bot")
async def whatsapp_bot(
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        payload_data = await _read_webhook_payload(request)
        await _validate_twilio_signature(request, payload_data)
        payload = WhatsAppWebhook.model_validate(payload_data)
    except HTTPException:
        raise
    except (ValidationError, ValueError, TypeError):
        logger.warning(
            "whatsapp_webhook_parse_failed content_type=%s",
            request.headers.get("content-type"),
        )
        return {"ok": False}

    logger.info(
        "whatsapp_webhook_received sender_hash=%s recipient_hash=%s message_sid_hash=%s body_present=%s body_chars=%s",
        hash_identifier(payload.from_),
        hash_identifier(payload.to),
        hash_identifier(payload.message_sid),
        bool(payload.body),
        len(payload.body or ""),
    )

    if not payload.from_ or not payload.body:
        logger.warning(
            "whatsapp_webhook_missing_required_fields has_sender=%s has_recipient=%s has_message_sid=%s",
            bool(payload.from_),
            bool(payload.to),
            bool(payload.message_sid),
        )
        return {"ok": False}

    try:
        reply = handle_whatsapp_bot_message(
            db,
            wa_from=payload.from_,
            body=payload.body,
            profile_name=payload.profile_name,
        )
    except Exception as exc:
        logger.error(
            "whatsapp_webhook_handler_failed sender_hash=%s recipient_hash=%s message_sid_hash=%s error_type=%s",
            hash_identifier(payload.from_),
            hash_identifier(payload.to),
            hash_identifier(payload.message_sid),
            type(exc).__name__,
        )
        return {"ok": False}

    return {"reply": reply}
