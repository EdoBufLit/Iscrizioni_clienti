from __future__ import annotations

import logging

import requests

from app.config import settings
from app.log_redaction import hash_identifier, redact_for_log

logger = logging.getLogger(__name__)

_TELEGRAM_API_TIMEOUT_SECONDS = 10


def send_telegram_message(text: str) -> str | None:
    bot_token = (settings.TG_BOT_TOKEN or "").strip()
    chat_id = (settings.TG_CHAT_ID or "").strip()
    message_text = (text or "").strip()

    if not bot_token or not chat_id:
        logger.warning(
            "telegram_notification_skipped missing_env bot_token_configured=%s chat_id_configured=%s",
            bool(bot_token),
            bool(chat_id),
        )
        return None

    if not message_text:
        logger.warning("telegram_notification_skipped empty_text")
        return None

    try:
        response = requests.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={
                "chat_id": chat_id,
                "text": message_text,
            },
            timeout=_TELEGRAM_API_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        logger.error(
            "telegram_notification_request_failed chat_id_hash=%s",
            hash_identifier(chat_id),
        )
        raise

    response_text = response.text.strip()
    if not response.ok:
        logger.error(
            "telegram_notification_http_failed status=%s chat_id_hash=%s body=%s",
            response.status_code,
            hash_identifier(chat_id),
            redact_for_log(response_text),
        )
        response.raise_for_status()

    try:
        payload = response.json()
    except ValueError:
        logger.error(
            "telegram_notification_invalid_json chat_id_hash=%s body=%s",
            hash_identifier(chat_id),
            redact_for_log(response_text),
        )
        raise

    if not payload.get("ok"):
        logger.error(
            "telegram_notification_api_failed chat_id_hash=%s payload=%s",
            hash_identifier(chat_id),
            redact_for_log(payload),
        )
        raise RuntimeError("Telegram API returned ok=false")

    result = payload.get("result") or {}
    message_id = result.get("message_id")
    return str(message_id) if message_id is not None else None
