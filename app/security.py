import hashlib
from passlib.context import CryptContext

# bcrypt has 72-byte input limit; bcrypt_sha256 avoids this and is more robust in containers.
pwd_context = CryptContext(schemes=["bcrypt_sha256"], deprecated="auto")

def _bcrypt_safe(password: str) -> str:
    # bcrypt max 72 bytes → pre-hash always
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def get_password_hash(password: str) -> str:
    return pwd_context.hash(_bcrypt_safe(password))

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(_bcrypt_safe(plain_password), hashed_password)
