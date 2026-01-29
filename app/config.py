import os

class Settings:
    PROJECT_NAME: str = "Association Self-Serve"
    PROJECT_VERSION: str = "1.0.0"

    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    UPLOAD_DIR: str = os.path.join(BASE_DIR, "data", "uploads")

    # In production, this should be secret and loaded from env
    SECRET_KEY: str = "supersecretkey"
    ALGORITHM: str = "HS256"

    TOKEN_EXPIRE_MINUTES: int = 15

settings = Settings()
