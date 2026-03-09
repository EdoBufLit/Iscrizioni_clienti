import logging
import os
from urllib.parse import urlparse


def _env_bool(name: str, *, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("true", "1", "yes", "on")


def _env_optional(name: str) -> str | None:
    raw = os.getenv(name)
    if raw is None:
        return None
    normalized = raw.strip()
    return normalized or None


def _url_hostname(raw_url: str | None) -> str:
    value = (raw_url or "").strip()
    if not value:
        return ""
    parsed = urlparse(value)
    return (parsed.hostname or "").strip().lower()


def _is_local_hostname(hostname: str) -> bool:
    return hostname in {"", "localhost", "127.0.0.1", "::1"}


def is_stripe_configured(
    *,
    secret_key: str | None,
    webhook_secret: str | None,
    price_id: str | None,
    publishable_key: str | None = None,
    require_publishable_key: bool = False,
) -> bool:
    if not secret_key or not webhook_secret or not price_id:
        return False
    if require_publishable_key and not publishable_key:
        return False
    return True


def _missing_stripe_env_vars(
    *,
    secret_key: str | None,
    webhook_secret: str | None,
    price_id: str | None,
    publishable_key: str | None,
    require_publishable_key: bool,
) -> list[str]:
    missing: list[str] = []
    if not secret_key:
        missing.append("STRIPE_SECRET_KEY")
    if not webhook_secret:
        missing.append("STRIPE_WEBHOOK_SECRET")
    if not price_id:
        missing.append("STRIPE_PRICE_ID")
    if require_publishable_key and not publishable_key:
        missing.append("STRIPE_PUBLISHABLE_KEY")
    return missing

class Settings:
    PROJECT_NAME: str = "Association Self-Serve"
    PROJECT_VERSION: str = "1.0.0"

    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    APP_DATA_DIR: str = os.getenv("APP_DATA_DIR", os.path.join(BASE_DIR, "data"))
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", os.path.join(APP_DATA_DIR, "uploads"))

    # In production, this should be secret and loaded from env
    SECRET_KEY: str = os.getenv("SECRET_KEY", "supersecretkey")
    ALGORITHM: str = "HS256"

    LOGIN_TOKEN_EXPIRE_MINUTES: int = 15
    JOIN_TOKEN_EXPIRE_MINUTES: int = 120

    BASE_URL: str = os.getenv("BASE_URL", "http://localhost:8000")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "")
    FRONTEND_STATIC_DIR: str = os.getenv("FRONTEND_STATIC_DIR", "")
    INGEST_RATE_LIMIT_MAX_REQUESTS: int = int(os.getenv("INGEST_RATE_LIMIT_MAX_REQUESTS", "20"))
    INGEST_RATE_LIMIT_WINDOW_SECONDS: int = int(os.getenv("INGEST_RATE_LIMIT_WINDOW_SECONDS", "300"))
    CARD_PUBLIC_RATE_LIMIT_MAX_REQUESTS: int = int(
        os.getenv("CARD_PUBLIC_RATE_LIMIT_MAX_REQUESTS", "120")
    )
    CARD_PUBLIC_RATE_LIMIT_WINDOW_SECONDS: int = int(
        os.getenv("CARD_PUBLIC_RATE_LIMIT_WINDOW_SECONDS", "300")
    )

    GIT_SHA: str = os.getenv("GIT_SHA", "")
    BUILD_TIME: str = os.getenv("BUILD_TIME", "")

    GOOGLE_WALLET_ISSUER_ID: str = os.getenv("GOOGLE_WALLET_ISSUER_ID", "")
    GOOGLE_WALLET_SA_B64: str = os.getenv("GOOGLE_WALLET_SA_B64", "")
    GOOGLE_APPLICATION_CREDENTIALS: str = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
    GOOGLE_WALLET_HTTP_TIMEOUT_SECONDS: int = int(
        os.getenv("GOOGLE_WALLET_HTTP_TIMEOUT_SECONDS", "15")
    )
    WALLET_DEMO_MODE: bool = os.getenv("WALLET_DEMO_MODE", "false").lower() in ("true", "1", "yes")

    # Super admin bootstrap
    SUPER_ADMIN_EMAIL: str = os.getenv("SUPER_ADMIN_EMAIL", "admin@assonam.it")
    SUPER_ADMIN_PASSWORD: str = os.getenv("SUPER_ADMIN_PASSWORD", "admin")

    # SMTP configuration
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "noreply@assonam.it")
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", os.getenv("SMTP_FROM", "noreply@assonam.it"))
    SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")
    MAIL_FROM_DOMAIN: str = os.getenv("MAIL_FROM_DOMAIN", "")

    # Twilio / WhatsApp
    TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_LOW_CARDS_FLOW_SID: str = os.getenv("TWILIO_LOW_CARDS_FLOW_SID", "")
    TWILIO_ALERT_FLOW_SID: str = os.getenv("TWILIO_ALERT_FLOW_SID", "")
    TWILIO_WHATSAPP_FROM: str = os.getenv("TWILIO_WHATSAPP_FROM", "")
    TWILIO_SMS_FROM: str = os.getenv("TWILIO_SMS_FROM", "")
    ADMIN_PHONE_E164: str = os.getenv("ADMIN_PHONE_E164", "")
    LOW_CARDS_ALERT_JOB_INTERVAL_SECONDS: int = int(
        os.getenv("LOW_CARDS_ALERT_JOB_INTERVAL_SECONDS", "300")
    )

    # Public affiliation wizard
    AFFILIAZIONE_ENABLED: bool = _env_bool("AFFILIAZIONE_ENABLED", default=False)
    STRIPE_SECRET_KEY: str | None = _env_optional("STRIPE_SECRET_KEY")
    STRIPE_WEBHOOK_SECRET: str | None = _env_optional("STRIPE_WEBHOOK_SECRET")
    STRIPE_PRICE_ID: str | None = _env_optional("STRIPE_PRICE_ID")
    STRIPE_PUBLISHABLE_KEY: str | None = _env_optional("STRIPE_PUBLISHABLE_KEY")
    STRIPE_REQUIRE_PUBLISHABLE_KEY: bool = _env_bool(
        "STRIPE_REQUIRE_PUBLISHABLE_KEY", default=False
    )
    STRIPE_AFFILIATION_PRICE_CENTS: int = int(
        os.getenv("STRIPE_AFFILIATION_PRICE_CENTS", "9000")
    )
    AFFILIATION_BANK_IBAN: str = os.getenv("AFFILIATION_BANK_IBAN", "")
    AFFILIATION_BANK_CAUSALE_PREFIX: str = os.getenv(
        "AFFILIATION_BANK_CAUSALE_PREFIX", "AFFILIAZIONE ASSONAM"
    )
    AFFILIATION_CASH_LOCATION: str = os.getenv(
        "AFFILIATION_CASH_LOCATION", "Sede ASSONAM"
    )
    AFFILIATION_VIDEO_RENDERER_DIR: str = os.getenv(
        "AFFILIATION_VIDEO_RENDERER_DIR",
        os.path.join(
            BASE_DIR,
            "video-renderer",
            "services",
            "welcome-video",
        ),
    )
    AFFILIATION_VIDEO_OUTPUT_DIR: str = os.getenv(
        "AFFILIATION_VIDEO_OUTPUT_DIR",
        os.path.join(APP_DATA_DIR, "videos", "welcome"),
    )
    AFFILIATION_VIDEO_AUTO_RENDER: bool = os.getenv(
        "AFFILIATION_VIDEO_AUTO_RENDER", "false"
    ).lower() in ("true", "1", "yes")
    AFFILIATION_VIDEO_ENABLED: bool = _env_bool(
        "AFFILIATION_VIDEO_ENABLED",
        default=True,
    )

    # OpenAI
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    # Email mode: "normal" (SMTP) or "test" (in-memory capture)
    EMAIL_MODE: str = os.getenv("EMAIL_MODE", "normal")
    EMAIL_OUTBOX_BATCH_SIZE: int = int(os.getenv("EMAIL_OUTBOX_BATCH_SIZE", "50"))
    EMAIL_OUTBOX_POLL_SECONDS: int = int(os.getenv("EMAIL_OUTBOX_POLL_SECONDS", "3"))
    EMAIL_OUTBOX_STALE_AFTER_SECONDS: int = int(
        os.getenv("EMAIL_OUTBOX_STALE_AFTER_SECONDS", "300")
    )

    @property
    def STRIPE_ENABLED(self) -> bool:
        return is_stripe_configured(
            secret_key=self.STRIPE_SECRET_KEY,
            webhook_secret=self.STRIPE_WEBHOOK_SECRET,
            price_id=self.STRIPE_PRICE_ID,
            publishable_key=self.STRIPE_PUBLISHABLE_KEY,
            require_publishable_key=self.STRIPE_REQUIRE_PUBLISHABLE_KEY,
        )

    @property
    def IS_LOCAL_ENV(self) -> bool:
        base_host = _url_hostname(self.BASE_URL)
        frontend_host = _url_hostname(self.FRONTEND_URL)
        return _is_local_hostname(base_host) and _is_local_hostname(frontend_host)

    @property
    def USES_INSECURE_SECRET_KEY(self) -> bool:
        return (self.SECRET_KEY or "").strip() in {"", "supersecretkey"}

    @property
    def USES_DEFAULT_SUPER_ADMIN_BOOTSTRAP(self) -> bool:
        return (
            (self.SUPER_ADMIN_EMAIL or "").strip().lower() == "admin@assonam.it"
            and (self.SUPER_ADMIN_PASSWORD or "") == "admin"
        )

settings = Settings()

logger = logging.getLogger(__name__)

if settings.SMTP_HOST and not settings.FRONTEND_URL:
    logger.error("FRONTEND_URL is not set! Magic links will fallback to BASE_URL/app but might be incorrect.")
