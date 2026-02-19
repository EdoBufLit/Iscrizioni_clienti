import hashlib
import logging
import os
import secrets
import smtplib
import uuid
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Tuple, List, Optional
from fastapi import UploadFile, HTTPException
from .config import settings

logger = logging.getLogger(__name__)

# Global list for email capture in tests
_captured_emails = []

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
    sub_directory: str = ""
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
        raise HTTPException(status_code=400, detail="File extension does not match MIME type.")

    # Generate unique filename: <uuid>_<sanitized_filename>
    # Sanitize: simple alphanumeric + dot/dash/underscore
    safe_filename = "".join(c for c in upload_file.filename if c.isalnum() or c in "._-")
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
            if upload_file.content_type == "application/pdf" and not chunk.startswith(b"%PDF-"):
                raise HTTPException(status_code=400, detail="Invalid PDF file.")
            elif upload_file.content_type == "image/jpeg" and not chunk.startswith(b"\xff\xd8\xff"):
                raise HTTPException(status_code=400, detail="Invalid JPEG file.")
            elif upload_file.content_type == "image/png" and not chunk.startswith(b"\x89PNG\r\n\x1a\n"):
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


def send_email_html(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
    inline_images: Optional[List[dict]] = None,
) -> bool:
    """
    Send a multipart/alternative email (plain text + HTML).
    Returns True on success, False on failure.
    """
    return _send_email_internal(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        inline_images=inline_images,
    )


def send_email(to_email: str, subject: str, body: str, html_body: Optional[str] = None) -> bool:
    """
    Send an email via SMTP if configured, otherwise fall back to simulation.
    Returns True on success, False on failure.
    """
    return _send_email_internal(
        to_email=to_email,
        subject=subject,
        text_body=body,
        html_body=html_body,
    )


def _send_email_internal(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
    inline_images: Optional[List[dict]] = None,
) -> bool:
    logger.info("send_email: to=%s, subject=%s", to_email, subject)

    if settings.EMAIL_MODE == "test":
        logger.info("send_email: Capturing email in test mode")
        _captured_emails.append({
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
        })
        return True

    if settings.SMTP_HOST and settings.SMTP_USER:
        if not settings.SMTP_PASSWORD:
            logger.error("send_email: SMTP_HOST/USER set but SMTP_PASSWORD is empty. Email NOT sent.")
            return False

        try:
            has_inline_images = bool(inline_images)
            if has_inline_images:
                msg = MIMEMultipart("related")
                alt = MIMEMultipart("alternative")
                alt.attach(MIMEText(text_body, "plain", "utf-8"))
                if html_body:
                    alt.attach(MIMEText(html_body, "html", "utf-8"))
                msg.attach(alt)
            else:
                msg = MIMEMultipart("alternative")
                msg.attach(MIMEText(text_body, "plain", "utf-8"))
                if html_body:
                    msg.attach(MIMEText(html_body, "html", "utf-8"))

            msg["From"] = settings.SMTP_FROM
            msg["To"] = to_email
            msg["Subject"] = subject

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
                    msg.attach(image_part)

            if settings.SMTP_USE_TLS:
                server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
                server.ehlo()
                server.starttls()
            else:
                server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
                server.ehlo()

            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM, [to_email], msg.as_string())
            server.quit()
            logger.info("send_email: SMTP delivery OK to=%s", to_email)
            return True
        except Exception:
            logger.exception("send_email: SMTP delivery FAILED to=%s", to_email)
            return False
    else:
        logger.info("send_email: SMTP not configured, using simulation")
        _send_email_simulation(to_email, subject, text_body, html_body)
        return True


def _send_email_simulation(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
):
    """Log email to file for development/testing."""
    log_line = f"To: {to_email}\nSubject: {subject}\nBody: {text_body}\n"
    if html_body:
        log_line += f"HTML:\n{html_body}\n"
    log_line += f"{'-'*40}\n"
    logger.info("EMAIL [simulation] to=%s subject=%s", to_email, subject)
    try:
        with open("email_log.txt", "a") as f:
            f.write(log_line)
    except OSError:
        pass
