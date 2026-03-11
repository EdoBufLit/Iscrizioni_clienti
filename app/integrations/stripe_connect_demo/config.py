from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse

from app.config import settings


DEFAULT_PUBLIC_BASE_URL = "https://assonam.it"


class StripeConnectDemoConfigError(RuntimeError):
    """Raised when the demo is enabled but a required runtime value is missing."""


def stripe_connect_demo_enabled() -> bool:
    return bool(settings.ENABLE_STRIPE_CONNECT_DEMO)


def require_stripe_connect_demo_enabled() -> None:
    if not stripe_connect_demo_enabled():
        raise StripeConnectDemoConfigError(
            "Stripe Connect demo non attivo. Imposta ENABLE_STRIPE_CONNECT_DEMO=true per usare il sample."
        )


def _normalize_optional(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _require_env(value: str | None, *, env_name: str, message: str) -> str:
    normalized = _normalize_optional(value)
    if normalized:
        return normalized
    raise StripeConnectDemoConfigError(f"Missing {env_name}. {message}")


def require_stripe_secret_key() -> str:
    return _require_env(
        settings.STRIPE_SECRET_KEY,
        env_name="STRIPE_SECRET_KEY",
        message="Add your Stripe secret key to the environment before using the Stripe Connect demo.",
    )


def require_stripe_publishable_key() -> str:
    return _require_env(
        settings.STRIPE_PUBLISHABLE_KEY,
        env_name="STRIPE_PUBLISHABLE_KEY",
        message="Add your Stripe publishable key to the environment before loading the Stripe Connect demo UI.",
    )


def require_stripe_thin_webhook_secret() -> str:
    return _require_env(
        settings.STRIPE_THIN_WEBHOOK_SECRET,
        env_name="STRIPE_THIN_WEBHOOK_SECRET",
        message="Create a Stripe webhook destination for thin v2 account events and set STRIPE_THIN_WEBHOOK_SECRET.",
    )


def require_stripe_billing_webhook_secret() -> str:
    return _require_env(
        settings.STRIPE_BILLING_WEBHOOK_SECRET,
        env_name="STRIPE_BILLING_WEBHOOK_SECRET",
        message="Create a Stripe webhook destination for billing events and set STRIPE_BILLING_WEBHOOK_SECRET.",
    )


def require_stripe_platform_price_id() -> str:
    return _require_env(
        settings.STRIPE_PLATFORM_PRICE_ID,
        env_name="STRIPE_PLATFORM_PRICE_ID",
        message="Create a recurring Stripe Price for your platform plan and set STRIPE_PLATFORM_PRICE_ID.",
    )


def resolve_demo_base_url() -> str:
    candidate = _normalize_optional(settings.BASE_URL)
    if candidate:
        parsed = urlparse(candidate)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            return candidate.rstrip("/")
    return DEFAULT_PUBLIC_BASE_URL


@dataclass(frozen=True)
class StripeConnectDemoPageConfig:
    publishable_key: str
    base_url: str


def get_demo_page_config() -> StripeConnectDemoPageConfig:
    require_stripe_connect_demo_enabled()
    return StripeConnectDemoPageConfig(
        publishable_key=require_stripe_publishable_key(),
        base_url=resolve_demo_base_url(),
    )
