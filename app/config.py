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
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "")

    GIT_SHA: str = os.getenv("GIT_SHA", "")
    BUILD_TIME: str = os.getenv("BUILD_TIME", "")

    # Super admin bootstrap
    SUPER_ADMIN_EMAIL: str = os.getenv("SUPER_ADMIN_EMAIL", "admin@assonam.it")
    SUPER_ADMIN_PASSWORD: str = os.getenv("SUPER_ADMIN_PASSWORD", "admin")

    # SMTP configuration
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "noreply@assonam.it")
    SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")

    # Email mode: "normal" (SMTP) or "test" (in-memory capture)
    EMAIL_MODE: str = os.getenv("EMAIL_MODE", "normal")

settings = Settings()

import logging
logger = logging.getLogger(__name__)

if settings.SMTP_HOST and not settings.FRONTEND_URL:
    logger.error("FRONTEND_URL is not set! Magic links will fallback to BASE_URL/app but might be incorrect.")
