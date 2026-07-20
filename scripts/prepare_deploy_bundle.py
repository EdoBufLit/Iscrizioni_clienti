"""Build the private deployment bundle consumed over SSH stdin/file transfer.

Secret values are read from the runner environment and written only to files
inside a mode-0700 directory.  They must never be interpolated into an SSH
command or passed as child-process arguments.
"""

from __future__ import annotations

import argparse
import os
import shutil
import stat
from pathlib import Path
from typing import Mapping


APP_ENV_KEYS = (
    "SECRET_KEY",
    "BASE_URL",
    "FRONTEND_URL",
    "SUPER_ADMIN_EMAIL",
    "SUPER_ADMIN_PASSWORD",
    "MFA_ENCRYPTION_KEY",
    "DATABASE_URL",
    "POSTGRES_PASSWORD",
    "UPLOAD_DIR",
    "SPA_DIR",
    "GOOGLE_WALLET_ISSUER_ID",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "GOOGLE_WALLET_SA_B64",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
    "SMTP_USE_TLS",
    "EMAIL_TRANSPORT",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_EMAIL_API_TOKEN",
    "CLOUDFLARE_EMAIL_API_BASE_URL",
    "MAIL_FROM_DOMAIN",
    "ASSOCIATION_MAIL_API_TOKEN",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "TWILIO_LOW_CARDS_FLOW_SID",
    "TWILIO_ALERT_FLOW_SID",
    "TWILIO_WHATSAPP_FROM",
    "ADMIN_PHONE_E164",
    "TWILIO_SMS_FROM",
    "TG_BOT_TOKEN",
    "TG_CHAT_ID",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_ID",
    "STRIPE_PUBLISHABLE_KEY",
    "STRIPE_THIN_WEBHOOK_SECRET",
    "STRIPE_BILLING_WEBHOOK_SECRET",
    "STRIPE_PLATFORM_PRICE_ID",
    "STRIPE_REQUIRE_PUBLISHABLE_KEY",
    "ENABLE_STRIPE_CONNECT_DEMO",
    "AFFILIATION_VIDEO_WORKER_ENABLED",
    "AFFILIATION_VIDEO_ENABLED",
    "ENABLE_WHATSAPP_EVOLUTION",
    "ENABLE_WHATSAPP",
    "WHATSAPP_PROVIDER",
    "GREEN_API_BASE_URL",
    "GREEN_API_WEBHOOK_SECRET",
    "GREEN_API_WEBHOOK_ALLOWED_IPS",
    "EVOLUTION_API_KEY",
    "SUMUP_CREDENTIALS_ENCRYPTION_KEY",
    "AFFILIAZIONE_ENABLED",
)

CONTROL_KEYS = (
    "APP_PATH",
    "BRANCH",
    "APP_RUNTIME_CHANGED",
    "RUNTIME_CONFIG_CHANGED",
    "VIDEO_WORKER_CHANGED",
    "EVOLUTION_CHANGED",
    "MIGRATE",
    "WORKFLOW_EVENT",
    "GHCR_USERNAME",
    "GIT_SHA",
)


def _single_line(name: str, value: str) -> str:
    if "\n" in value or "\r" in value:
        raise ValueError(f"{name} must be a single-line value")
    return value


def _normalise_bool(value: str, *, default: str) -> str:
    return (value or default).strip().lower()


def _normalise_provider(value: str) -> str:
    return (value or "green_api").strip().lower().replace("-", "_")


def build_app_env(source: Mapping[str, str]) -> str:
    values = {key: source.get(key, "") for key in APP_ENV_KEYS}
    values["AFFILIAZIONE_ENABLED"] = _normalise_bool(
        values["AFFILIAZIONE_ENABLED"], default="false"
    )
    values["ENABLE_WHATSAPP_EVOLUTION"] = _normalise_bool(
        values["ENABLE_WHATSAPP_EVOLUTION"], default="false"
    )
    values["ENABLE_WHATSAPP"] = _normalise_bool(
        values["ENABLE_WHATSAPP"], default="false"
    )
    values["WHATSAPP_PROVIDER"] = _normalise_provider(values["WHATSAPP_PROVIDER"])
    values["GREEN_API_BASE_URL"] = (
        values["GREEN_API_BASE_URL"].strip() or "https://api.green-api.com"
    )
    values["AFFILIATION_VIDEO_WORKER_ENABLED"] = _normalise_bool(
        values["AFFILIATION_VIDEO_WORKER_ENABLED"], default="false"
    )
    values["AFFILIATION_VIDEO_ENABLED"] = _normalise_bool(
        values["AFFILIATION_VIDEO_ENABLED"], default="true"
    )

    rendered: list[tuple[str, str]] = [("APP_ENV", "production")]
    rendered.extend(
        (key, values[key])
        for key in APP_ENV_KEYS
        if key != "AFFILIAZIONE_ENABLED"
    )
    rendered.extend(
        (
            (
                "GREEN_API_WEBHOOK_REQUIRE_SECRET",
                "true" if values["GREEN_API_WEBHOOK_SECRET"] else "false",
            ),
            ("WHATSAPP_WEBHOOK_MAX_BODY_BYTES", "524288"),
            ("EVOLUTION_API_BASE_URL", "http://evolution-api:8080"),
            ("APP_RUNTIME_IMAGE", source.get("APP_RUNTIME_IMAGE", "")),
            (
                "AFFILIATION_VIDEO_WORKER_IMAGE",
                source.get("AFFILIATION_VIDEO_WORKER_IMAGE", ""),
            ),
            ("EVOLUTION_API_IMAGE", source.get("EVOLUTION_API_IMAGE", "")),
            ("GIT_SHA", source.get("GIT_SHA", "")),
            ("BUILD_TIME", source.get("BUILD_TIME", "")),
            ("AFFILIAZIONE_ENABLED", values["AFFILIAZIONE_ENABLED"]),
        )
    )
    return "".join(
        f"{key}={_single_line(key, str(value))}\n" for key, value in rendered
    )


def build_control_env(source: Mapping[str, str]) -> str:
    return "".join(
        f"{key}={_single_line(key, source.get(key, ''))}\n" for key in CONTROL_KEYS
    )


def _write_private(path: Path, content: str) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    if stat.S_IMODE(path.stat().st_mode) != 0o600:
        path.chmod(0o600)


def prepare_bundle(output_dir: Path, source: Mapping[str, str]) -> None:
    output_dir.mkdir(mode=0o700, parents=True, exist_ok=False)
    output_dir.chmod(0o700)
    try:
        _write_private(output_dir / "app.env", build_app_env(source))
        _write_private(output_dir / "control.env", build_control_env(source))
        token = _single_line("GHCR_TOKEN", source.get("GHCR_TOKEN", ""))
        if not token:
            raise ValueError("GHCR_TOKEN is required")
        _write_private(output_dir / "ghcr.token", token + "\n")
    except Exception:
        shutil.rmtree(output_dir, ignore_errors=True)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare private Hetzner deploy files")
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    prepare_bundle(args.output_dir, os.environ)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
