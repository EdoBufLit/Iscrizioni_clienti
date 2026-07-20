import ipaddress
import logging
import os
from urllib.parse import urlparse


VALID_APP_ENVS = frozenset({"local", "test", "staging", "production"})
DEPLOYED_APP_ENVS = frozenset({"staging", "production"})
_INSECURE_SECRET_KEYS = frozenset(
    {
        "",
        "supersecretkey",
        "secret",
        "changeme",
        "change-me",
        "replace-me",
        "your-secret-key",
        "default",
    }
)
_DEFAULT_SUPER_ADMIN_EMAILS = frozenset(
    {"", "admin@assonam.it", "admin@example.com", "root@example.com"}
)
_DEFAULT_SUPER_ADMIN_PASSWORDS = frozenset(
    {"", "admin", "password", "changeme", "change-me", "default", "secret"}
)

# Published by Green API for WhatsApp Webhook Endpoint traffic. Keep the
# deployment documentation and tests in sync when the provider changes it.
# Source checked 2026-07-15:
# https://green-api.com/en/docs/api/receiving/technology-webhook-endpoint/
GREEN_API_OFFICIAL_WEBHOOK_IPS = (
    "46.101.109.139",
    "51.250.12.167",
    "51.250.84.44",
    "51.250.95.149",
    "89.169.137.216",
    "158.160.49.84",
    "165.22.93.202",
    "167.172.162.71",
    "104.248.252.93",
    "158.160.139.176",
    "64.226.111.11",
    "207.154.255.195",
)


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


def parse_ip_network_allowlist(
    value: str | tuple[str, ...] | list[str] | None,
) -> tuple[str, ...]:
    """Normalize an IP/CIDR allowlist and reject an accept-all network."""

    if value is None:
        return ()
    raw_entries = value.replace("\n", ",").split(",") if isinstance(value, str) else value
    normalized: list[str] = []
    for raw_entry in raw_entries:
        entry = str(raw_entry or "").strip()
        if not entry:
            continue
        try:
            network = ipaddress.ip_network(entry, strict=False)
        except ValueError as exc:
            raise ValueError(f"Invalid IP/CIDR in allowlist: {entry}") from exc
        if network.prefixlen == 0:
            raise ValueError("An accept-all IP network is not allowed")
        canonical = str(network)
        if canonical not in normalized:
            normalized.append(canonical)
    return tuple(normalized)


def _env_app_env() -> str:
    raw = os.getenv("APP_ENV")
    if raw is None:
        # A directly-run production image must never become local merely because
        # its operator forgot APP_ENV. Local development is an explicit opt-in.
        return "production"
    return raw.strip().lower()


def _url_hostname(raw_url: str | None) -> str:
    value = (raw_url or "").strip()
    if not value:
        return ""
    parsed = urlparse(value)
    return (parsed.hostname or "").strip().lower()


def _is_local_hostname(hostname: str) -> bool:
    normalized = (hostname or "").strip().lower().rstrip(".")
    if normalized in {"", "localhost", "0.0.0.0", "127.0.0.1", "::1"}:
        return True
    if normalized.endswith((".localhost", ".local")):
        return True

    try:
        address = ipaddress.ip_address(normalized)
    except ValueError:
        return False
    return bool(
        address.is_loopback
        or address.is_private
        or address.is_link_local
        or address.is_unspecified
        or address.is_reserved
    )


def _is_valid_deployed_url(raw_url: str | None) -> bool:
    """Return whether a URL is a public HTTPS origin suitable for deployment."""

    value = (raw_url or "").strip()
    if not value:
        return False

    try:
        parsed = urlparse(value)
        # Accessing ``port`` validates malformed/out-of-range port declarations.
        _ = parsed.port
    except ValueError:
        return False

    hostname = (parsed.hostname or "").strip().lower().rstrip(".")
    if parsed.scheme.lower() != "https" or not parsed.netloc or not hostname:
        return False
    if parsed.username is not None or parsed.password is not None:
        return False
    if parsed.path not in {"", "/"} or parsed.params or parsed.query or parsed.fragment:
        return False
    if _is_local_hostname(hostname):
        return False
    if hostname.endswith((".test", ".example", ".invalid")):
        return False

    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        # Deployment URLs must use a fully-qualified public hostname.
        return "." in hostname and not hostname.startswith(".")
    return True


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

    # Environment classification is explicit. URL hostnames are never used to
    # decide whether deployment security checks should run.
    APP_ENV: str = _env_app_env()

    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    APP_DATA_DIR: str = os.getenv("APP_DATA_DIR", os.path.join(BASE_DIR, "data"))
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", os.path.join(APP_DATA_DIR, "uploads"))

    # In production, this should be secret and loaded from env
    SECRET_KEY: str = os.getenv("SECRET_KEY", "supersecretkey")
    ALGORITHM: str = "HS256"

    LOGIN_TOKEN_EXPIRE_MINUTES: int = 15
    ORG_ADMIN_SESSION_DAYS: int = int(os.getenv("ORG_ADMIN_SESSION_DAYS", "30"))
    JOIN_TOKEN_EXPIRE_MINUTES: int = 120

    # Privileged authentication. MFA is mandatory in deployed environments;
    # local/test installations can keep the password-only compatibility path
    # unless they explicitly enable it for security tests.
    MFA_ENCRYPTION_KEY: str | None = _env_optional("MFA_ENCRYPTION_KEY")
    SUPER_ADMIN_MFA_REQUIRED: bool = _env_bool(
        "SUPER_ADMIN_MFA_REQUIRED",
        default=APP_ENV in DEPLOYED_APP_ENVS,
    )
    SUPER_ADMIN_SESSION_IDLE_MINUTES: int = int(
        os.getenv("SUPER_ADMIN_SESSION_IDLE_MINUTES", "30")
    )
    SUPER_ADMIN_SESSION_ABSOLUTE_HOURS: int = int(
        os.getenv("SUPER_ADMIN_SESSION_ABSOLUTE_HOURS", "12")
    )
    SUPER_ADMIN_STEP_UP_MINUTES: int = int(
        os.getenv("SUPER_ADMIN_STEP_UP_MINUTES", "10")
    )

    BASE_URL: str = os.getenv("BASE_URL", "http://localhost:8000")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "")
    FRONTEND_STATIC_DIR: str = os.getenv("FRONTEND_STATIC_DIR", "")
    APP_TIMEZONE: str = os.getenv("APP_TIMEZONE", "Europe/Rome")
    INGEST_RATE_LIMIT_MAX_REQUESTS: int = int(os.getenv("INGEST_RATE_LIMIT_MAX_REQUESTS", "20"))
    INGEST_RATE_LIMIT_WINDOW_SECONDS: int = int(os.getenv("INGEST_RATE_LIMIT_WINDOW_SECONDS", "300"))
    CARD_PUBLIC_RATE_LIMIT_MAX_REQUESTS: int = int(
        os.getenv("CARD_PUBLIC_RATE_LIMIT_MAX_REQUESTS", "120")
    )
    CARD_PUBLIC_RATE_LIMIT_WINDOW_SECONDS: int = int(
        os.getenv("CARD_PUBLIC_RATE_LIMIT_WINDOW_SECONDS", "300")
    )
    # Deliberately permissive: this is a last-resort distributed abuse guard,
    # not a normal-user throttle. The bucket is scoped to IP + public form.
    PUBLIC_FORM_RATE_LIMIT_MAX_REQUESTS: int = int(
        os.getenv("PUBLIC_FORM_RATE_LIMIT_MAX_REQUESTS", "300")
    )
    PUBLIC_FORM_RATE_LIMIT_WINDOW_SECONDS: int = int(
        os.getenv("PUBLIC_FORM_RATE_LIMIT_WINDOW_SECONDS", "300")
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
    SMTP_FROM: str = os.getenv("SMTP_FROM", "no-reply@assonam.it")
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", os.getenv("SMTP_FROM", "no-reply@assonam.it"))
    SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")
    EMAIL_TRANSPORT: str = os.getenv("EMAIL_TRANSPORT", "auto").strip().lower() or "auto"
    CLOUDFLARE_ACCOUNT_ID: str = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
    CLOUDFLARE_EMAIL_API_TOKEN: str = (
        os.getenv("CLOUDFLARE_EMAIL_API_TOKEN") or os.getenv("SMTP_PASSWORD", "")
    )
    CLOUDFLARE_EMAIL_API_BASE_URL: str = os.getenv(
        "CLOUDFLARE_EMAIL_API_BASE_URL",
        "https://api.cloudflare.com/client/v4",
    )
    MAIL_FROM_DOMAIN: str = os.getenv("MAIL_FROM_DOMAIN", "")
    ASSOCIATION_MAIL_API_TOKEN: str = os.getenv("ASSOCIATION_MAIL_API_TOKEN", "")

    # Twilio / WhatsApp
    TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_LOW_CARDS_FLOW_SID: str = os.getenv("TWILIO_LOW_CARDS_FLOW_SID", "")
    TWILIO_ALERT_FLOW_SID: str = os.getenv("TWILIO_ALERT_FLOW_SID", "")
    TWILIO_WHATSAPP_FROM: str = os.getenv("TWILIO_WHATSAPP_FROM", "")
    ASSONAM_WHATSAPP_BOT_NUMBER: str = os.getenv("ASSONAM_WHATSAPP_BOT_NUMBER", "")
    TWILIO_SMS_FROM: str = os.getenv("TWILIO_SMS_FROM", "")
    ADMIN_PHONE_E164: str = os.getenv("ADMIN_PHONE_E164", "")
    TG_BOT_TOKEN: str = os.getenv("TG_BOT_TOKEN", "")
    TG_CHAT_ID: str = os.getenv("TG_CHAT_ID", "")
    ENABLE_WHATSAPP_EVOLUTION: bool = _env_bool("ENABLE_WHATSAPP_EVOLUTION", default=False)
    ENABLE_WHATSAPP: bool = _env_bool("ENABLE_WHATSAPP", default=ENABLE_WHATSAPP_EVOLUTION)
    WHATSAPP_PROVIDER_EXPLICIT: bool = "WHATSAPP_PROVIDER" in os.environ
    WHATSAPP_PROVIDER: str = os.getenv(
        "WHATSAPP_PROVIDER",
        "evolution" if ENABLE_WHATSAPP_EVOLUTION else "green_api",
    ).strip().lower()
    GREEN_API_BASE_URL: str = os.getenv("GREEN_API_BASE_URL", "https://api.green-api.com")
    GREEN_API_WEBHOOK_SECRET: str | None = _env_optional("GREEN_API_WEBHOOK_SECRET")
    GREEN_API_WEBHOOK_REQUIRE_SECRET: bool = _env_bool(
        "GREEN_API_WEBHOOK_REQUIRE_SECRET",
        default=False,
    )
    GREEN_API_WEBHOOK_ALLOWED_IPS: tuple[str, ...] = parse_ip_network_allowlist(
        _env_optional("GREEN_API_WEBHOOK_ALLOWED_IPS")
        or ",".join(GREEN_API_OFFICIAL_WEBHOOK_IPS)
    )
    WHATSAPP_WEBHOOK_MAX_BODY_BYTES: int = max(
        1024,
        int(os.getenv("WHATSAPP_WEBHOOK_MAX_BODY_BYTES", str(512 * 1024))),
    )
    EVOLUTION_API_BASE_URL: str = os.getenv(
        "EVOLUTION_API_BASE_URL",
        "http://evolution-api:8080",
    )
    EVOLUTION_API_KEY: str = os.getenv("EVOLUTION_API_KEY", "")
    WHATSAPP_WEBHOOK_BATCH_SIZE: int = int(os.getenv("WHATSAPP_WEBHOOK_BATCH_SIZE", "50"))
    WHATSAPP_WEBHOOK_POLL_SECONDS: int = int(os.getenv("WHATSAPP_WEBHOOK_POLL_SECONDS", "2"))
    WHATSAPP_WEBHOOK_STALE_AFTER_SECONDS: int = int(
        os.getenv("WHATSAPP_WEBHOOK_STALE_AFTER_SECONDS", "300")
    )
    WHATSAPP_OUTBOUND_QUEUE_ENABLED: bool = _env_bool("WHATSAPP_OUTBOUND_QUEUE_ENABLED", default=False)
    WHATSAPP_OUTBOUND_BATCH_SIZE: int = int(os.getenv("WHATSAPP_OUTBOUND_BATCH_SIZE", "20"))
    WHATSAPP_OUTBOUND_MIN_INTERVAL_SECONDS: int = int(
        os.getenv("WHATSAPP_OUTBOUND_MIN_INTERVAL_SECONDS", "60")
    )
    WHATSAPP_OUTBOUND_MAX_ATTEMPTS: int = int(os.getenv("WHATSAPP_OUTBOUND_MAX_ATTEMPTS", "3"))
    WHATSAPP_OUTBOUND_RETRY_BASE_SECONDS: int = int(
        os.getenv("WHATSAPP_OUTBOUND_RETRY_BASE_SECONDS", "60")
    )
    LOW_CARDS_ALERT_JOB_INTERVAL_SECONDS: int = int(
        os.getenv("LOW_CARDS_ALERT_JOB_INTERVAL_SECONDS", "300")
    )

    # Public affiliation wizard
    AFFILIAZIONE_ENABLED: bool = _env_bool("AFFILIAZIONE_ENABLED", default=False)
    STRIPE_SECRET_KEY: str | None = _env_optional("STRIPE_SECRET_KEY")
    STRIPE_WEBHOOK_SECRET: str | None = _env_optional("STRIPE_WEBHOOK_SECRET")
    STRIPE_PRICE_ID: str | None = _env_optional("STRIPE_PRICE_ID")
    STRIPE_PUBLISHABLE_KEY: str | None = _env_optional("STRIPE_PUBLISHABLE_KEY")
    STRIPE_THIN_WEBHOOK_SECRET: str | None = _env_optional(
        "STRIPE_THIN_WEBHOOK_SECRET"
    )
    STRIPE_BILLING_WEBHOOK_SECRET: str | None = _env_optional(
        "STRIPE_BILLING_WEBHOOK_SECRET"
    )
    STRIPE_PLATFORM_PRICE_ID: str | None = _env_optional("STRIPE_PLATFORM_PRICE_ID")
    STRIPE_REQUIRE_PUBLISHABLE_KEY: bool = _env_bool(
        "STRIPE_REQUIRE_PUBLISHABLE_KEY", default=False
    )
    ENABLE_STRIPE_CONNECT_DEMO: bool = _env_bool(
        "ENABLE_STRIPE_CONNECT_DEMO", default=False
    )
    STRIPE_AFFILIATION_PRICE_CENTS: int = int(
        os.getenv("STRIPE_AFFILIATION_PRICE_CENTS", "9000")
    )
    AFFILIATION_FEE_CURRENCY: str = os.getenv("AFFILIATION_FEE_CURRENCY", "EUR")
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
    SUMUP_API_BASE_URL: str = os.getenv(
        "SUMUP_API_BASE_URL", "https://api.sumup.com/v0.1"
    )
    SUMUP_REQUEST_TIMEOUT_SECONDS: int = int(
        os.getenv("SUMUP_REQUEST_TIMEOUT_SECONDS", "20")
    )
    SUMUP_CREDENTIALS_ENCRYPTION_KEY: str | None = _env_optional(
        "SUMUP_CREDENTIALS_ENCRYPTION_KEY"
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
    FILE_DELETION_BATCH_SIZE: int = int(
        os.getenv("FILE_DELETION_BATCH_SIZE", "50")
    )
    FILE_DELETION_POLL_SECONDS: int = int(
        os.getenv("FILE_DELETION_POLL_SECONDS", "5")
    )
    FILE_DELETION_STALE_AFTER_SECONDS: int = int(
        os.getenv("FILE_DELETION_STALE_AFTER_SECONDS", "300")
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
        return (self.APP_ENV or "").strip().lower() == "local"

    @property
    def IS_TEST_ENV(self) -> bool:
        return (self.APP_ENV or "").strip().lower() == "test"

    @property
    def IS_DEPLOYED_ENV(self) -> bool:
        return (self.APP_ENV or "").strip().lower() in DEPLOYED_APP_ENVS

    @property
    def USES_INSECURE_SECRET_KEY(self) -> bool:
        value = (self.SECRET_KEY or "").strip()
        return (
            len(value) < 32
            or len(set(value)) < 8
            or value.lower() in _INSECURE_SECRET_KEYS
        )

    @property
    def USES_DEFAULT_SUPER_ADMIN_BOOTSTRAP(self) -> bool:
        email = (self.SUPER_ADMIN_EMAIL or "").strip().lower()
        password = (self.SUPER_ADMIN_PASSWORD or "").strip().lower()
        return (
            email in _DEFAULT_SUPER_ADMIN_EMAILS
            or password in _DEFAULT_SUPER_ADMIN_PASSWORDS
        )


def validate_runtime_environment(runtime_settings: Settings) -> None:
    """Fail closed on invalid security configuration in deployed environments."""

    app_env = (runtime_settings.APP_ENV or "").strip().lower()
    if app_env not in VALID_APP_ENVS:
        valid_values = ", ".join(sorted(VALID_APP_ENVS))
        raise RuntimeError(
            f"Invalid APP_ENV '{app_env or '<empty>'}'. Expected one of: {valid_values}."
        )

    if app_env not in DEPLOYED_APP_ENVS:
        return

    errors: list[str] = []
    if runtime_settings.USES_INSECURE_SECRET_KEY:
        errors.append("SECRET_KEY must be a non-default secret of at least 32 characters")

    if not runtime_settings.SUPER_ADMIN_MFA_REQUIRED:
        errors.append("SUPER_ADMIN_MFA_REQUIRED must be enabled")
    if not (runtime_settings.MFA_ENCRYPTION_KEY or "").strip():
        errors.append("MFA_ENCRYPTION_KEY must be configured")

    for variable_name in ("BASE_URL", "FRONTEND_URL"):
        if not _is_valid_deployed_url(getattr(runtime_settings, variable_name, "")):
            errors.append(
                f"{variable_name} must be a public HTTPS origin without path, query or credentials"
            )

    super_admin_email = (runtime_settings.SUPER_ADMIN_EMAIL or "").strip().lower()
    if (
        super_admin_email in _DEFAULT_SUPER_ADMIN_EMAILS
        or "@" not in super_admin_email
        or any(character.isspace() for character in super_admin_email)
    ):
        errors.append("SUPER_ADMIN_EMAIL must be configured and non-default")

    super_admin_password = (runtime_settings.SUPER_ADMIN_PASSWORD or "").strip().lower()
    if super_admin_password in _DEFAULT_SUPER_ADMIN_PASSWORDS:
        errors.append("SUPER_ADMIN_PASSWORD must be configured and non-default")

    try:
        green_api_webhook_networks = parse_ip_network_allowlist(
            runtime_settings.GREEN_API_WEBHOOK_ALLOWED_IPS
        )
    except ValueError as exc:
        errors.append(f"GREEN_API_WEBHOOK_ALLOWED_IPS is invalid ({exc})")
    else:
        if not green_api_webhook_networks:
            errors.append("GREEN_API_WEBHOOK_ALLOWED_IPS must not be empty")

    if errors:
        raise RuntimeError(
            f"Refusing to start in APP_ENV={app_env}: " + "; ".join(errors) + "."
        )

settings = Settings()

logger = logging.getLogger(__name__)

if settings.SMTP_HOST and not settings.FRONTEND_URL:
    logger.error("FRONTEND_URL is not set! Magic links will fallback to BASE_URL/app but might be incorrect.")

if settings.ENABLE_WHATSAPP_EVOLUTION and not settings.EVOLUTION_API_KEY:
    logger.warning(
        "ENABLE_WHATSAPP_EVOLUTION=true but EVOLUTION_API_KEY is empty. "
        "Evolution calls will not authenticate correctly."
    )

if settings.ENABLE_WHATSAPP and settings.WHATSAPP_PROVIDER == "green_api" and not settings.SUMUP_CREDENTIALS_ENCRYPTION_KEY:
    logger.warning(
        "ENABLE_WHATSAPP=true with WHATSAPP_PROVIDER=green_api but "
        "SUMUP_CREDENTIALS_ENCRYPTION_KEY is empty. Green API tokens cannot be decrypted."
    )
