import hashlib
import os
import shutil
import secrets
import uuid
from typing import Tuple, List
from fastapi import UploadFile, HTTPException
from .config import settings

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
        "application/pdf": [".pdf"]
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

def send_email_simulation(to_email: str, subject: str, body: str):
    """
    Simulates sending an email by printing to stdout and logging to a file.
    """
    print("="*60)
    print(f"EMAIL SIMULATION to {to_email}")
    print(f"Subject: {subject}")
    print("-" * 20)
    print(body)
    print("="*60)

    # Also append to a log file for retrieval during verification
    with open("email_log.txt", "a") as f:
        f.write(f"To: {to_email}\nSubject: {subject}\nBody: {body}\n{'-'*20}\n")
