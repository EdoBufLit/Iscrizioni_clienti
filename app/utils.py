import hashlib
import logging
import os
import secrets
import smtplib
import socket
import uuid
import base64
from email import encoders
from email.mime.base import MIMEBase
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import make_msgid
from typing import List, Optional, Tuple

import requests
from fastapi import HTTPException, UploadFile

from .config import settings
from .services.email_sender import (
    EmailSenderSelection,
    resolve_email_sender,
    serialize_association_sender,
)

logger = logging.getLogger(__name__)
_MAILTRAP_SEND_API_URL = "https://send.api.mailtrap.io/api/send"
_CLOUDFLARE_EMAIL_SEND_PATH = "/accounts/{account_id}/email/sending/send"

# Global list for email capture in tests
_captured_emails = []


def _smtp_uses_implicit_tls(port: int) -> bool:
    return int(port) == 465


class EmailDeliveryError(Exception):
    """Base class for SMTP delivery errors."""


class RetryableEmailDeliveryError(EmailDeliveryError):
    """Temporary SMTP error, should be retried."""


class PermanentEmailDeliveryError(EmailDeliveryError):
    """Permanent SMTP error, should not be retried aggressively."""


def get_captured_emails() -> List[dict]:
    """Return the list of captured emails (for testing)."""
    return _captured_emails


def clear_captured_emails():
    """Clear the captured emails list."""
    global _captured_emails
    _captured_emails = []


def generate_token() -> str:
    """Generates a secure random token."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Hashes a token using SHA256 and the secret key."""
    return hashlib.sha256(f"{token}{settings.SECRET_KEY}".encode()).hexdigest()


def compute_sha256(file_path: str) -> str:
    """Computes SHA256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


async def save_upload_file(
    upload_file: UploadFile,
    max_size: int = 10 * 1024 * 1024,
    allowed_types: List[str] = ["image/jpeg", "image/png", "application/pdf"],
    sub_directory: str = "",
) -> Tuple[str, int, str]:
    """
    Saves an uploaded file to the upload directory with hardening.
    Returns: (relative_path, size_bytes, sha256_hash)
    Raises: HTTPException if validation fails.
    """
    target_dir = os.path.join(settings.UPLOAD_DIR, sub_directory)
    if not os.path.exists(target_dir):
        os.makedirs(target_dir)

    # 1. Validate Extension and MIME
    if upload_file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type.")

    file_ext = os.path.splitext(upload_file.filename)[1].lower()
    valid_exts = {
        "image/jpeg": [".jpg", ".jpeg"],
        "image/png": [".png"],
        "application/pdf": [".pdf"],
        "image/svg+xml": [".svg"],
    }

    if file_ext not in valid_exts.get(upload_file.content_type, []):
        raise HTTPException(
            status_code=400, detail="File extension does not match MIME type."
        )

    # Generate unique filename: <uuid>_<sanitized_filename>
    # Sanitize: simple alphanumeric + dot/dash/underscore
    safe_filename = "".join(
        c for c in upload_file.filename if c.isalnum() or c in "._-"
    )
    unique_filename = f"{uuid.uuid4()}_{safe_filename}"
    file_path = os.path.join(target_dir, unique_filename)

    # 2. Read, Validate Magic Bytes, Check Size, Write, Hash
    sha256_hash = hashlib.sha256()
    size_bytes = 0

    try:
        with open(file_path, "wb") as buffer:
            # Read first chunk for magic bytes
            chunk = await upload_file.read(4096)
            if not chunk:
                raise HTTPException(status_code=400, detail="Empty file.")

            # Validate Magic Bytes
            if (
                upload_file.content_type == "application/pdf"
                and not chunk.startswith(b"%PDF-")
            ):
                raise HTTPException(status_code=400, detail="Invalid PDF file.")
            elif (
                upload_file.content_type == "image/jpeg"
                and not chunk.startswith(b"\xff\xd8\xff")
            ):
                raise HTTPException(status_code=400, detail="Invalid JPEG file.")
            elif (
                upload_file.content_type == "image/png"
                and not chunk.startswith(b"\x89PNG\r\n\x1a\n")
            ):
                raise HTTPException(status_code=400, detail="Invalid PNG file.")
            elif upload_file.content_type == "image/svg+xml":
                s_chunk = chunk.strip()
                if not (s_chunk.startswith(b"<svg") or s_chunk.startswith(b"<?xml")):
                    raise HTTPException(status_code=400, detail="Invalid SVG file.")

            # Write first chunk
            buffer.write(chunk)
            sha256_hash.update(chunk)
            size_bytes += len(chunk)

            # Read rest
            while True:
                chunk = await upload_file.read(4096)
                if not chunk:
                    break

                size_bytes += len(chunk)
                if size_bytes > max_size:
                    raise HTTPException(status_code=400, detail="File too large.")

                buffer.write(chunk)
                sha256_hash.update(chunk)

    except Exception as e:
        # Cleanup if partial write or error
        if os.path.exists(file_path):
            os.remove(file_path)
        raise e

    # Return relative path from upload dir
    rel_path = os.path.join(sub_directory, unique_filename)

    return rel_path, size_bytes, sha256_hash.hexdigest()


def _sanitize_header_value(value: str) -> str:
    cleaned = (value or "").replace("\r", " ").replace("\n", " ").strip()
    if not cleaned:
        raise ValueError("Email header value is empty after sanitization.")
    return cleaned


def _build_message(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
    inline_images: Optional[List[dict]] = None,
    attachments: Optional[List[dict]] = None,
    from_header: str,
    reply_to: Optional[str] = None,
) -> tuple[object, str]:
    safe_to = _sanitize_header_value(to_email)
    safe_subject = _sanitize_header_value(subject)
    safe_from = _sanitize_header_value(from_header)

    has_inline_images = bool(inline_images)
    has_attachments = bool(attachments)
    if has_attachments:
        msg = MIMEMultipart("mixed")
        body_root = MIMEMultipart("related") if has_inline_images else MIMEMultipart("alternative")
        msg.attach(body_root)
    elif has_inline_images:
        msg = MIMEMultipart("related")
        body_root = msg
    else:
        msg = MIMEMultipart("alternative")
        body_root = msg

    if has_inline_images:
        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(text_body, "plain", "utf-8"))
        if html_body:
            alt.attach(MIMEText(html_body, "html", "utf-8"))
        body_root.attach(alt)
    else:
        body_root.attach(MIMEText(text_body, "plain", "utf-8"))
        if html_body:
            body_root.attach(MIMEText(html_body, "html", "utf-8"))

    provider_message_id = make_msgid()
    msg["From"] = safe_from
    msg["To"] = safe_to
    msg["Subject"] = safe_subject
    msg["Message-ID"] = provider_message_id
    if reply_to:
        msg["Reply-To"] = _sanitize_header_value(reply_to)

    if has_inline_images:
        for image in inline_images or []:
            cid = str(image.get("cid") or "").strip()
            data = image.get("data") or b""
            content_type = str(image.get("content_type") or "image/png").strip().lower()
            filename = str(image.get("filename") or f"{cid or 'inline'}.png")
            if not cid or not isinstance(data, (bytes, bytearray)) or not data:
                continue
            if "/" not in content_type:
                continue
            maintype, subtype = content_type.split("/", 1)
            if maintype != "image":
                continue

            image_part = MIMEImage(bytes(data), _subtype=subtype)
            image_part.add_header("Content-ID", f"<{cid}>")
            image_part.add_header("Content-Disposition", "inline", filename=filename)
            body_root.attach(image_part)

    for attachment in attachments or []:
        data = attachment.get("data") or b""
        if not isinstance(data, (bytes, bytearray)) or not data:
            continue
        content_type = str(
            attachment.get("content_type") or "application/octet-stream"
        ).strip().lower()
        filename = str(attachment.get("filename") or "attachment.bin").strip() or "attachment.bin"
        if "/" in content_type:
            maintype, subtype = content_type.split("/", 1)
        else:
            maintype, subtype = "application", "octet-stream"
        part = MIMEBase(maintype, subtype)
        part.set_payload(bytes(data))
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", "attachment", filename=filename)
        msg.attach(part)

    return msg, provider_message_id


def _smtp_error_text(code: int | None, message: object) -> str:
    parts = []
    if code is not None:
        parts.append(f"SMTP {code}")
    if isinstance(message, bytes):
        text = message.decode("utf-8", errors="replace")
    else:
        text = str(message or "").strip()
    if text:
        parts.append(text)
    return " - ".join(parts) if parts else "SMTP delivery failed"


def _is_retryable_smtp_code(code: int | None, message: str) -> bool:
    if code is None:
        message_lower = message.lower()
        return "429" in message_lower or "rate limit" in message_lower
    if 400 <= code < 500:
        return True
    message_lower = message.lower()
    return "429" in message_lower or "rate limit" in message_lower


def _raise_classified_smtp_error(code: int | None, message: object):
    error_text = _smtp_error_text(code, message)
    if _is_retryable_smtp_code(code, error_text):
        raise RetryableEmailDeliveryError(error_text)
    if code is not None and code >= 500:
        raise PermanentEmailDeliveryError(error_text)
    raise RetryableEmailDeliveryError(error_text)


def _capture_email_for_tests(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None,
    inline_images: list[dict] | None,
    attachments: list[dict] | None,
    sender_selection: EmailSenderSelection,
    provider_message_id: str,
    transport: str,
) -> None:
    _captured_emails.append(
        {
            "to": to_email,
            "subject": subject,
            "body": text_body,
            "text_body": text_body,
            "html_body": html_body,
            "inline_images": [
                {
                    "cid": str(item.get("cid") or ""),
                    "content_type": str(item.get("content_type") or ""),
                    "size": len(item.get("data") or b""),
                }
                for item in (inline_images or [])
            ],
            "attachments": [
                {
                    "filename": str(item.get("filename") or ""),
                    "content_type": str(item.get("content_type") or ""),
                    "size": len(item.get("data") or b""),
                }
                for item in (attachments or [])
            ],
            "from_name": sender_selection.from_name,
            "from_email": sender_selection.from_email,
            "from_header": sender_selection.from_header,
            "reply_to": sender_selection.reply_to,
            "selected_mode": sender_selection.selected_mode,
            "fallback_used": sender_selection.fallback_used,
            "provider_message_id": provider_message_id,
            "transport": transport,
        }
    )


def _provider_body_text(response: requests.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        payload = None
    if isinstance(payload, dict):
        for key in ("message", "error", "errors", "detail"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
            if isinstance(value, list) and value:
                first = value[0]
                if isinstance(first, str) and first.strip():
                    return first.strip()
                if isinstance(first, dict):
                    for nested_key in ("message", "error", "detail"):
                        nested_value = first.get(nested_key)
                        if isinstance(nested_value, str) and nested_value.strip():
                            return nested_value.strip()
    text = (response.text or "").strip()
    return text[:1000]


def _extract_provider_message_id(payload: object, fallback: str) -> str:
    if isinstance(payload, dict):
        result = payload.get("result")
        if isinstance(result, dict):
            nested = _extract_provider_message_id(result, "")
            if nested:
                return nested
        for key in ("message_id", "id"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        message_ids = payload.get("message_ids")
        if isinstance(message_ids, list) and message_ids:
            first = message_ids[0]
            if isinstance(first, str) and first.strip():
                return first.strip()
            if isinstance(first, dict):
                for key in ("id", "message_id"):
                    value = first.get(key)
                    if isinstance(value, str) and value.strip():
                        return value.strip()
    return fallback


def _build_mailtrap_attachments(
    inline_images: list[dict] | None,
    file_attachments: list[dict] | None = None,
) -> list[dict]:
    built_attachments: list[dict] = []
    for item in inline_images or []:
        data = item.get("data")
        if not isinstance(data, (bytes, bytearray)) or not data:
            continue
        content_type = str(item.get("content_type") or "application/octet-stream").strip()
        filename = str(item.get("filename") or "attachment.bin").strip() or "attachment.bin"
        attachment: dict[str, object] = {
            "content": base64.b64encode(bytes(data)).decode("ascii"),
            "filename": filename,
            "type": content_type,
        }
        cid = str(item.get("cid") or "").strip()
        if cid:
            attachment["disposition"] = "inline"
            attachment["content_id"] = cid
        built_attachments.append(attachment)
    for item in file_attachments or []:
        data = item.get("data")
        if not isinstance(data, (bytes, bytearray)) or not data:
            continue
        built_attachments.append(
            {
                "content": base64.b64encode(bytes(data)).decode("ascii"),
                "filename": str(item.get("filename") or "attachment.bin").strip()
                or "attachment.bin",
                "type": str(
                    item.get("content_type") or "application/octet-stream"
                ).strip(),
                "disposition": "attachment",
            }
        )
    return built_attachments


def _build_cloudflare_attachments(
    inline_images: list[dict] | None,
    file_attachments: list[dict] | None = None,
) -> list[dict]:
    return _build_mailtrap_attachments(inline_images, file_attachments)


def _cloudflare_api_token() -> str:
    return (settings.CLOUDFLARE_EMAIL_API_TOKEN or settings.SMTP_PASSWORD or "").strip()


def _cloudflare_send_url() -> str:
    account_id = (settings.CLOUDFLARE_ACCOUNT_ID or "").strip()
    base_url = (settings.CLOUDFLARE_EMAIL_API_BASE_URL or "https://api.cloudflare.com/client/v4").rstrip("/")
    return f"{base_url}{_CLOUDFLARE_EMAIL_SEND_PATH.format(account_id=account_id)}"


def _cloudflare_provider_message_id(
    *,
    idempotency_key: str | None,
    fallback: str,
    payload: object,
) -> str:
    extracted = _extract_provider_message_id(payload, "")
    if extracted:
        return extracted
    normalized_key = (idempotency_key or "").strip()
    if normalized_key:
        return f"cloudflare:{normalized_key}"
    return fallback


def send_email_via_cloudflare_rest(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
    inline_images: Optional[List[dict]] = None,
    attachments: Optional[List[dict]] = None,
    mode: str = "system",
    association: object | None = None,
    reply_to: Optional[str] = None,
    sender_selection: EmailSenderSelection | None = None,
    association_snapshot: dict[str, object] | None = None,
    idempotency_key: str | None = None,
) -> str:
    association_snapshot = (
        association_snapshot
        if association_snapshot is not None
        else serialize_association_sender(association)
    )
    sender_selection = sender_selection or resolve_email_sender(
        mode=mode,
        association=association,
        reply_to=reply_to,
    )
    _log_transport_selection(
        transport="cloudflare_rest",
        sender_selection=sender_selection,
        association_snapshot=association_snapshot,
    )
    provider_message_id = make_msgid()
    normalized_idempotency_key = (idempotency_key or provider_message_id).strip()

    if settings.EMAIL_MODE == "test":
        _capture_email_for_tests(
            to_email=to_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            inline_images=inline_images or None,
            attachments=attachments or None,
            sender_selection=sender_selection,
            provider_message_id=_cloudflare_provider_message_id(
                idempotency_key=normalized_idempotency_key,
                fallback=provider_message_id,
                payload={},
            ),
            transport="cloudflare_rest",
        )
        return _cloudflare_provider_message_id(
            idempotency_key=normalized_idempotency_key,
            fallback=provider_message_id,
            payload={},
        )

    missing = []
    if not (settings.CLOUDFLARE_ACCOUNT_ID or "").strip():
        missing.append("CLOUDFLARE_ACCOUNT_ID")
    if not _cloudflare_api_token():
        missing.append("CLOUDFLARE_EMAIL_API_TOKEN/SMTP_PASSWORD")
    if missing:
        raise PermanentEmailDeliveryError(
            f"Cloudflare Email REST configuration incomplete: missing {', '.join(missing)}"
        )

    payload: dict[str, object] = {
        "to": _sanitize_header_value(to_email),
        "from": sender_selection.from_email,
        "subject": _sanitize_header_value(subject),
        "text": text_body,
        "headers": {
            "X-ASSONAM-Outbox-ID": normalized_idempotency_key,
        },
    }
    if sender_selection.reply_to:
        payload["reply_to"] = sender_selection.reply_to
    if html_body:
        payload["html"] = html_body
    cloudflare_attachments = _build_cloudflare_attachments(
        inline_images or None,
        attachments or None,
    )
    if cloudflare_attachments:
        payload["attachments"] = cloudflare_attachments

    request_headers = {
        "Authorization": f"Bearer {_cloudflare_api_token()}",
        "Content-Type": "application/json",
        "Idempotency-Key": normalized_idempotency_key,
    }

    try:
        response = requests.post(
            _cloudflare_send_url(),
            headers=request_headers,
            json=payload,
            timeout=20,
        )
    except (requests.Timeout, requests.ConnectionError) as exc:
        logger.warning(
            "cloudflare_email_rest_call_finished result=retryable_failed status=network_error error=%s",
            exc,
        )
        raise RetryableEmailDeliveryError(
            f"Cloudflare Email REST temporaneamente non raggiungibile: {exc}"
        ) from exc
    except requests.RequestException as exc:
        logger.warning(
            "cloudflare_email_rest_call_finished result=retryable_failed status=request_exception error=%s",
            exc,
        )
        raise RetryableEmailDeliveryError(str(exc) or exc.__class__.__name__) from exc

    provider_error_body = _provider_body_text(response)
    logger.info(
        "cloudflare_email_rest_response_status status=%s ok=%s provider_error_body=%s",
        response.status_code,
        response.ok,
        provider_error_body or "",
    )

    try:
        response_payload = response.json()
    except ValueError:
        response_payload = None

    if response.ok:
        result = response_payload.get("result") if isinstance(response_payload, dict) else None
        permanent_bounces = []
        if isinstance(result, dict) and isinstance(result.get("permanent_bounces"), list):
            permanent_bounces = result["permanent_bounces"]
        if permanent_bounces:
            raise PermanentEmailDeliveryError(
                f"Cloudflare Email REST permanent bounce: {', '.join(map(str, permanent_bounces))}"
            )
        return _cloudflare_provider_message_id(
            idempotency_key=normalized_idempotency_key,
            fallback=provider_message_id,
            payload=response_payload,
        )

    error_text = (
        f"Cloudflare Email REST {response.status_code}: "
        f"{provider_error_body or response.reason or 'Errore provider senza dettaglio.'}"
    )
    if _is_retryable_http_status(response.status_code):
        raise RetryableEmailDeliveryError(error_text)
    raise PermanentEmailDeliveryError(error_text)


def _is_retryable_http_status(status_code: int) -> bool:
    return status_code in {408, 429} or status_code >= 500


def _log_transport_selection(
    *,
    transport: str,
    sender_selection: EmailSenderSelection,
    association_snapshot: dict[str, object] | None,
) -> None:
    communications_enabled = (
        association_snapshot.get("communications_enabled")
        if association_snapshot is not None
        else None
    )
    mail_from_domain_present = bool((settings.MAIL_FROM_DOMAIN or "").strip())
    logger.info(
        "email_transport_selected transport=%s requested_mode=%s selected_mode=%s communications_enabled=%s mail_from_domain_present=%s from_name=%s from_email=%s from_header=%s reply_to=%s fallback_used=%s",
        transport,
        sender_selection.requested_mode,
        sender_selection.selected_mode,
        communications_enabled,
        mail_from_domain_present,
        sender_selection.from_name or "",
        sender_selection.from_email,
        sender_selection.from_header,
        sender_selection.reply_to or "",
        sender_selection.fallback_used,
    )


def send_association_email_via_mailtrap_api(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
    inline_images: Optional[List[dict]] = None,
    attachments: Optional[List[dict]] = None,
    sender_selection: EmailSenderSelection,
) -> str:
    provider_message_id = make_msgid()
    logger.info(
        "association_mailtrap_api_call_started to=%s subject=%s from_email=%s from_header=%s",
        to_email,
        subject,
        sender_selection.from_email,
        sender_selection.from_header,
    )

    if settings.EMAIL_MODE == "test":
        _capture_email_for_tests(
            to_email=to_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            inline_images=inline_images or None,
            attachments=attachments or None,
            sender_selection=sender_selection,
            provider_message_id=provider_message_id,
            transport="mailtrap_api",
        )
        logger.info(
            "association_mailtrap_api_call_finished result=test_captured provider_message_id=%s",
            provider_message_id,
        )
        return provider_message_id

    api_token = (settings.ASSOCIATION_MAIL_API_TOKEN or "").strip()
    if not api_token:
        logger.error(
            "association_mailtrap_api_call_finished result=permanent_failed error=missing ASSOCIATION_MAIL_API_TOKEN"
        )
        raise PermanentEmailDeliveryError(
            "Association mail transport non configurato: manca ASSOCIATION_MAIL_API_TOKEN."
        )

    payload: dict[str, object] = {
        "from": {
            "email": sender_selection.from_email,
            "name": sender_selection.from_name or "",
        },
        "to": [{"email": _sanitize_header_value(to_email)}],
        "subject": _sanitize_header_value(subject),
        "text": text_body,
    }
    if html_body:
        payload["html"] = html_body
    if sender_selection.reply_to:
        payload["reply_to"] = {"email": sender_selection.reply_to}
    mailtrap_attachments = _build_mailtrap_attachments(
        inline_images or None,
        attachments or None,
    )
    if mailtrap_attachments:
        payload["attachments"] = mailtrap_attachments

    try:
        response = requests.post(
            _MAILTRAP_SEND_API_URL,
            headers={
                "Authorization": f"Bearer {api_token}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=20,
        )
    except (requests.Timeout, requests.ConnectionError) as exc:
        logger.warning(
            "association_mailtrap_api_call_finished result=retryable_failed status=network_error error=%s",
            exc,
        )
        raise RetryableEmailDeliveryError(
            f"Mailtrap API temporaneamente non raggiungibile: {exc}"
        ) from exc
    except requests.RequestException as exc:
        logger.warning(
            "association_mailtrap_api_call_finished result=retryable_failed status=request_exception error=%s",
            exc,
        )
        raise RetryableEmailDeliveryError(str(exc) or exc.__class__.__name__) from exc

    provider_error_body = _provider_body_text(response)
    logger.info(
        "association_mailtrap_api_response_status status=%s ok=%s provider_error_body=%s",
        response.status_code,
        response.ok,
        provider_error_body or "",
    )

    if response.ok:
        try:
            response_payload = response.json()
        except ValueError:
            response_payload = None
        resolved_message_id = _extract_provider_message_id(response_payload, provider_message_id)
        logger.info(
            "association_mailtrap_api_call_finished result=sent provider_message_id=%s",
            resolved_message_id,
        )
        return resolved_message_id

    error_text = (
        f"Mailtrap API {response.status_code}: "
        f"{provider_error_body or response.reason or 'Errore provider senza dettaglio.'}"
    )
    if _is_retryable_http_status(response.status_code):
        logger.warning(
            "association_mailtrap_api_call_finished result=retryable_failed status=%s error=%s",
            response.status_code,
            error_text,
        )
        raise RetryableEmailDeliveryError(error_text)

    logger.error(
        "association_mailtrap_api_call_finished result=permanent_failed status=%s error=%s",
        response.status_code,
        error_text,
    )
    raise PermanentEmailDeliveryError(error_text)


def send_email_via_smtp_low_level(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
    inline_images: Optional[List[dict]] = None,
    attachments: Optional[List[dict]] = None,
    mode: str = "system",
    association: object | None = None,
    reply_to: Optional[str] = None,
    sender_selection: EmailSenderSelection | None = None,
    association_snapshot: dict[str, object] | None = None,
) -> str:
    association_snapshot = (
        association_snapshot
        if association_snapshot is not None
        else serialize_association_sender(association)
    )
    sender_selection = sender_selection or resolve_email_sender(
        mode=mode,
        association=association,
        reply_to=reply_to,
    )
    _log_transport_selection(
        transport="smtp",
        sender_selection=sender_selection,
        association_snapshot=association_snapshot,
    )
    logger.info(
        "smtp_send_start to=%s subject=%s selected_mode=%s envelope_from=%s",
        to_email,
        subject,
        sender_selection.selected_mode,
        sender_selection.from_email,
    )

    msg, provider_message_id = _build_message(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        inline_images=inline_images,
        attachments=attachments,
        from_header=sender_selection.from_header,
        reply_to=sender_selection.reply_to,
    )

    if settings.EMAIL_MODE == "test":
        _capture_email_for_tests(
            to_email=to_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            inline_images=inline_images or None,
            attachments=attachments or None,
            sender_selection=sender_selection,
            provider_message_id=provider_message_id,
            transport="smtp",
        )
        logger.info("smtp_send_captured provider_message_id=%s", provider_message_id)
        return provider_message_id

    missing = []
    if not settings.SMTP_HOST:
        missing.append("SMTP_HOST")
    if not settings.SMTP_USER:
        missing.append("SMTP_USER")
    if not settings.SMTP_PASSWORD:
        missing.append("SMTP_PASSWORD")
    if missing:
        raise RetryableEmailDeliveryError(
            f"SMTP configuration incomplete: missing {', '.join(missing)}"
        )

    try:
        uses_implicit_tls = _smtp_uses_implicit_tls(settings.SMTP_PORT)
        smtp_client = smtplib.SMTP_SSL if uses_implicit_tls else smtplib.SMTP
        with smtp_client(
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            timeout=15,
        ) as server:
            server.ehlo()
            if settings.SMTP_USE_TLS and not uses_implicit_tls:
                server.starttls()
                server.ehlo()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(
                sender_selection.from_email,
                [_sanitize_header_value(to_email)],
                msg.as_string(),
            )
        logger.info(
            "smtp_send_ok to=%s provider_message_id=%s",
            to_email,
            provider_message_id,
        )
        return provider_message_id
    except smtplib.SMTPRecipientsRefused as exc:
        recipient_errors = []
        for recipient, detail in (exc.recipients or {}).items():
            code = None
            message = detail
            if isinstance(detail, tuple) and detail:
                code = int(detail[0]) if detail[0] is not None else None
                message = detail[1] if len(detail) > 1 else detail[0]
            recipient_errors.append((recipient, code, message))
        if recipient_errors:
            codes = [code for _, code, _ in recipient_errors if code is not None]
            message = "; ".join(
                f"{recipient}: {_smtp_error_text(code, detail)}"
                for recipient, code, detail in recipient_errors
            )
            if codes and all(not _is_retryable_smtp_code(code, message) for code in codes):
                raise PermanentEmailDeliveryError(message) from exc
            raise RetryableEmailDeliveryError(message) from exc
        raise RetryableEmailDeliveryError("SMTP recipients refused") from exc
    except (
        socket.timeout,
        TimeoutError,
        smtplib.SMTPServerDisconnected,
        smtplib.SMTPConnectError,
        smtplib.SMTPDataError,
        smtplib.SMTPHeloError,
        OSError,
    ) as exc:
        message = str(exc) or exc.__class__.__name__
        if "429" in message or "rate limit" in message.lower():
            raise RetryableEmailDeliveryError(message) from exc
        raise RetryableEmailDeliveryError(message) from exc
    except smtplib.SMTPAuthenticationError as exc:
        _raise_classified_smtp_error(int(getattr(exc, "smtp_code", 535)), exc.smtp_error)
    except smtplib.SMTPResponseException as exc:
        _raise_classified_smtp_error(int(exc.smtp_code), exc.smtp_error)
    except ValueError as exc:
        raise PermanentEmailDeliveryError(str(exc)) from exc
    except Exception as exc:
        logger.exception("smtp_send_unexpected_failure to=%s", to_email)
        raise RetryableEmailDeliveryError(str(exc) or exc.__class__.__name__) from exc


def send_email_via_transport_low_level(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
    inline_images: Optional[List[dict]] = None,
    attachments: Optional[List[dict]] = None,
    mode: str = "system",
    association: object | None = None,
    reply_to: Optional[str] = None,
    idempotency_key: Optional[str] = None,
) -> str:
    association_snapshot = serialize_association_sender(association)
    sender_selection = resolve_email_sender(
        mode=mode,
        association=association,
        reply_to=reply_to,
    )
    configured_transport = (settings.EMAIL_TRANSPORT or "auto").strip().lower()
    cloudflare_configured = bool(
        (settings.CLOUDFLARE_ACCOUNT_ID or "").strip()
        and _cloudflare_api_token()
    )
    if configured_transport in {"cloudflare", "cloudflare_rest"}:
        selected_transport = "cloudflare_rest"
    elif configured_transport == "smtp":
        selected_transport = "smtp"
    elif configured_transport == "mailtrap_api":
        selected_transport = (
            "mailtrap_api"
            if sender_selection.selected_mode == "association" and not sender_selection.fallback_used
            else "smtp"
        )
    elif cloudflare_configured:
        selected_transport = "cloudflare_rest"
    else:
        selected_transport = (
            "mailtrap_api"
            if sender_selection.selected_mode == "association" and not sender_selection.fallback_used
            else "smtp"
        )
    _log_transport_selection(
        transport=selected_transport,
        sender_selection=sender_selection,
        association_snapshot=association_snapshot,
    )
    if selected_transport == "cloudflare_rest":
        return send_email_via_cloudflare_rest(
            to_email=to_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            inline_images=inline_images,
            attachments=attachments,
            mode=mode,
            association=association,
            reply_to=reply_to,
            sender_selection=sender_selection,
            association_snapshot=association_snapshot,
            idempotency_key=idempotency_key,
        )
    if selected_transport == "mailtrap_api":
        return send_association_email_via_mailtrap_api(
            to_email=to_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            inline_images=inline_images,
            attachments=attachments,
            sender_selection=sender_selection,
        )
    return send_email_via_smtp_low_level(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        inline_images=inline_images,
        attachments=attachments,
        mode=mode,
        association=association,
        reply_to=reply_to,
        sender_selection=sender_selection,
        association_snapshot=association_snapshot,
    )


def send_email_html(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
    inline_images: Optional[List[dict]] = None,
    attachments: Optional[List[dict]] = None,
    mode: str = "system",
    association: object | None = None,
    reply_to: Optional[str] = None,
) -> bool:
    """
    Send a multipart/alternative email (plain text + HTML).
    Returns True on success, False on failure.
    """
    try:
        send_email_via_transport_low_level(
            to_email=to_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            inline_images=inline_images,
            attachments=attachments,
            mode=mode,
            association=association,
            reply_to=reply_to,
        )
        return True
    except EmailDeliveryError as exc:
        logger.warning(
            "send_email_html_failed to=%s subject=%s error=%s",
            to_email,
            subject,
            exc,
        )
        return False
    except Exception:
        logger.exception(
            "send_email_html_unexpected_failure to=%s subject=%s",
            to_email,
            subject,
        )
        return False


def send_email(
    to_email: str,
    subject: str,
    body: str,
    html_body: Optional[str] = None,
    mode: str = "system",
    association: object | None = None,
    reply_to: Optional[str] = None,
) -> bool:
    """
    Send an email and return True on success, False on failure.
    """
    try:
        send_email_via_transport_low_level(
            to_email=to_email,
            subject=subject,
            text_body=body,
            html_body=html_body,
            mode=mode,
            association=association,
            reply_to=reply_to,
        )
        return True
    except EmailDeliveryError as exc:
        logger.warning(
            "send_email_failed to=%s subject=%s error=%s",
            to_email,
            subject,
            exc,
        )
        return False
    except Exception:
        logger.exception(
            "send_email_unexpected_failure to=%s subject=%s",
            to_email,
            subject,
        )
        return False
