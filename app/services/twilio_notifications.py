from __future__ import annotations

import logging
import os
import re
from typing import TYPE_CHECKING

from app.config import settings

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from app.models import Organization

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
    return bool(settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN)


def _resolve_low_cards_to(org: "Organization") -> str | None:
    return to_whatsapp_address(getattr(org, "whatsapp_e164", None))


def _resolve_low_cards_from() -> str | None:
    return to_whatsapp_address(
        os.getenv("TWILIO_WHATSAPP_FROM") or settings.TWILIO_WHATSAPP_FROM
    )


def _resolve_low_cards_flow_sid() -> str | None:
    return (
        os.getenv("TWILIO_LOW_CARDS_FLOW_SID")
        or os.getenv("TWILIO_STUDIO_FLOW_SID")
        or os.getenv("TWILIO_ALERT_FLOW_SID")
        or settings.TWILIO_LOW_CARDS_FLOW_SID
        or settings.TWILIO_ALERT_FLOW_SID
    )


def execute_low_cards_alert_flow(
    *,
    org: "Organization",
    remaining: int,
) -> str | None:
    client = _get_twilio_client()
    if client is None:
        raise RuntimeError("Twilio client not configured")

    to_whatsapp = _resolve_low_cards_to(org)
    if not to_whatsapp:
        logger.warning(
            "low_cards_alert_missing_whatsapp org_id=%s slug=%s",
            org.id,
            org.slug,
        )
        return None

    flow_sid = _resolve_low_cards_flow_sid()
    if not flow_sid:
        logger.warning(
            "low_cards_alert_send_skipped_missing_env env=%s org_id=%s slug=%s",
            "TWILIO_LOW_CARDS_FLOW_SID|TWILIO_STUDIO_FLOW_SID|TWILIO_ALERT_FLOW_SID",
            org.id,
            org.slug,
        )
        return None

    from_whatsapp = _resolve_low_cards_from()
    if not from_whatsapp:
        logger.warning(
            "low_cards_alert_send_skipped_missing_env env=%s org_id=%s slug=%s",
            "TWILIO_WHATSAPP_FROM",
            org.id,
            org.slug,
        )
        return None

    logger.info(
        "low_cards_alert_execution_start slug=%s to=%s remaining=%s",
        org.slug,
        to_whatsapp,
        remaining,
    )
    try:
        execution = client.studio.v2.flows(flow_sid).executions.create(
            to=to_whatsapp,
            from_=from_whatsapp,
            parameters={
                "to": to_whatsapp,
                "association_name": org.name,
                "remaining": str(remaining),
            },
        )
        execution_sid = str(getattr(execution, "sid", "") or "")
        logger.info(
            "low_cards_alert_execution_created sid=%s org_id=%s slug=%s to=%s",
            execution_sid,
            org.id,
            org.slug,
            to_whatsapp,
        )
        return execution_sid or None
    except Exception:
        logger.exception("low_cards_alert_execution_failed slug=%s", org.slug)
        raise


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
