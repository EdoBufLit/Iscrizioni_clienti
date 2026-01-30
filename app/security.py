from passlib.context import CryptContext

# bcrypt has 72-byte input limit; bcrypt_sha256 avoids this and is more robust in containers.
pwd_context = CryptContext(schemes=["bcrypt_sha256"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)
