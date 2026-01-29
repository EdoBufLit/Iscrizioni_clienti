import hashlib
import os
import shutil
import secrets
import uuid
from typing import Tuple
from fastapi import UploadFile
from .config import settings

def generate_token() -> str:
    """Generates a secure random token."""
    return secrets.token_urlsafe(32)

def compute_sha256(file_path: str) -> str:
    """Computes SHA256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

async def save_upload_file(upload_file: UploadFile) -> Tuple[str, int, str]:
    """
    Saves an uploaded file to the upload directory.
    Returns: (relative_path, size_bytes, sha256_hash)
    """
    if not os.path.exists(settings.UPLOAD_DIR):
        os.makedirs(settings.UPLOAD_DIR)

    # Generate a unique filename to avoid collisions
    file_ext = os.path.splitext(upload_file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)

    # Write file to disk
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)

    # Compute metadata
    size_bytes = os.path.getsize(file_path)
    sha256 = compute_sha256(file_path)

    # Return relative path from upload dir
    rel_path = unique_filename

    return rel_path, size_bytes, sha256

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
