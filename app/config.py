import os

class Settings:
    PROJECT_NAME: str = "Association Self-Serve"
    PROJECT_VERSION: str = "1.0.0"

    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", os.path.join(BASE_DIR, "data", "uploads"))

    # In production, this should be secret and loaded from env
    SECRET_KEY: str = os.getenv("SECRET_KEY", "supersecretkey")
    ALGORITHM: str = "HS256"

    LOGIN_TOKEN_EXPIRE_MINUTES: int = 15
    JOIN_TOKEN_EXPIRE_MINUTES: int = 120

    BASE_URL: str = os.getenv("BASE_URL", "http://localhost:8000")

settings = Settings()
