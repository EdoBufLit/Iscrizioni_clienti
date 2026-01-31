import hashlib
import logging
import os
import secrets
import smtplib
import uuid
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Tuple, List
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
    allowed_types: List[str] = ["image/jpeg", "image/png", "application/pdf"]
) -> Tuple[str, int, str]:
    """
    Saves an uploaded file to the upload directory with hardening.
    Returns: (relative_path, size_bytes, sha256_hash)
    Raises: HTTPException if validation fails.
    """
    if not os.path.exists(settings.UPLOAD_DIR):
        os.makedirs(settings.UPLOAD_DIR)

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

    # Generate unique filename
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)

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
    rel_path = unique_filename

    return rel_path, size_bytes, sha256_hash.hexdigest()


def send_email(to_email: str, subject: str, body: str) -> bool:
    """
    Send an email via SMTP if configured, otherwise fall back to simulation.
    Returns True on success, False on failure.
    """
    logger.info("send_email: to=%s, subject=%s", to_email, subject)

    if settings.EMAIL_MODE == "test":
        logger.info("send_email: Capturing email in test mode")
        _captured_emails.append({
            "to": to_email,
            "subject": subject,
            "body": body
        })
        return True

    if settings.SMTP_HOST and settings.SMTP_USER:
        if not settings.SMTP_PASSWORD:
            logger.error("send_email: SMTP_HOST/USER set but SMTP_PASSWORD is empty. Email NOT sent.")
            return False

        try:
            msg = MIMEMultipart("alternative")
            msg["From"] = settings.SMTP_FROM
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain", "utf-8"))

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
        _send_email_simulation(to_email, subject, body)
        return True


def _send_email_simulation(to_email: str, subject: str, body: str):
    """Log email to file for development/testing."""
    log_line = f"To: {to_email}\nSubject: {subject}\nBody: {body}\n{'-'*40}\n"
    logger.info("EMAIL [simulation] to=%s subject=%s", to_email, subject)
    try:
        with open("email_log.txt", "a") as f:
            f.write(log_line)
    except OSError:
        pass
