from __future__ import annotations

import logging
import re

from app.config import settings

logger = logging.getLogger(__name__)

try:
    from twilio.rest import Client as TwilioClient
except Exception:  # pragma: no cover - dependency missing only outside configured envs
    TwilioClient = None


def normalize_e164_phone(raw_value: str | None) -> str | None:
    value = (raw_value or "").strip()
    if not value:
        return None
    if value.lower().startswith("whatsapp:"):
        value = value.split(":", 1)[1].strip()

    compact = re.sub(r"[^\d+]", "", value)
    if compact.startswith("00"):
        compact = f"+{compact[2:]}"
    if not compact.startswith("+"):
        return None

    digits = compact[1:]
    if not digits.isdigit():
        return None
    if len(digits) < 8 or len(digits) > 15:
        return None
    return f"+{digits}"


def to_whatsapp_address(raw_value: str | None) -> str | None:
    normalized = normalize_e164_phone(raw_value)
    if not normalized:
        return None
    return f"whatsapp:{normalized}"


def _get_twilio_client():
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        return None
    if TwilioClient is None:
        logger.warning("twilio_sdk_unavailable")
        return None
    return TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)


def twilio_alerts_are_configured() -> bool:
    return bool(
        settings.TWILIO_ACCOUNT_SID
        and settings.TWILIO_AUTH_TOKEN
        and settings.TWILIO_ALERT_FLOW_SID
    )


def execute_low_cards_alert_flow(
    *,
    to: str,
    association_name: str | None,
    remaining: str | int,
) -> str:
    client = _get_twilio_client()
    if client is None:
        raise RuntimeError("Twilio client not configured")
    if not settings.TWILIO_ALERT_FLOW_SID:
        raise RuntimeError("Twilio alert flow env not configured")

    whatsapp_to = to_whatsapp_address(to)
    if not whatsapp_to:
        raise ValueError(f"Invalid WhatsApp destination for alert flow: {to}")

    safe_association_name = (association_name or "").strip() or "Associazione"
    safe_remaining = str(remaining).strip() if remaining is not None else "0"
    if not safe_remaining:
        safe_remaining = "0"

    execution = (
        client.studio.v2.flows(settings.TWILIO_ALERT_FLOW_SID)
        .executions.create(
            parameters={
                "to": whatsapp_to,
                "association_name": safe_association_name,
                "remaining": safe_remaining,
            },
        )
    )
    return str(getattr(execution, "sid", "") or "")


def send_admin_sms_notification(message: str) -> str | None:
    if not settings.ADMIN_PHONE_E164 or not settings.TWILIO_SMS_FROM:
        logger.warning("admin_sms_notification_skipped missing_env")
        return None

    client = _get_twilio_client()
    if client is None:
        logger.warning("admin_sms_notification_skipped missing_twilio_client")
        return None

    to_phone = normalize_e164_phone(settings.ADMIN_PHONE_E164)
    from_phone = normalize_e164_phone(settings.TWILIO_SMS_FROM)
    if not to_phone or not from_phone:
        logger.warning("admin_sms_notification_skipped invalid_phone_format")
        return None

    sms = client.messages.create(
        to=to_phone,
        from_=from_phone,
        body=message.strip(),
    )
    return str(getattr(sms, "sid", "") or "")
