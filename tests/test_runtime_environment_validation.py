from __future__ import annotations

from pathlib import Path

import pytest

from app.config import _env_app_env, settings, validate_runtime_environment
from scripts.prepare_deploy_bundle import build_app_env


REPO_ROOT = Path(__file__).resolve().parents[1]


def _set_secure_deployment(monkeypatch: pytest.MonkeyPatch, *, app_env: str) -> None:
    monkeypatch.setattr(settings, "APP_ENV", app_env)
    monkeypatch.setattr(
        settings,
        "SECRET_KEY",
        "bY7!qM2#vR9@tK4$xP8&nD3*zF6-wH1+",
    )
    monkeypatch.setattr(settings, "BASE_URL", "https://api.assonam.it")
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.assonam.it")
    monkeypatch.setattr(settings, "SUPER_ADMIN_EMAIL", "security-admin@assonam.it")
    monkeypatch.setattr(settings, "SUPER_ADMIN_PASSWORD", "deployment-password-changed")


@pytest.mark.parametrize("app_env", ["production", "staging"])
def test_secure_deployed_environments_pass_validation(monkeypatch, app_env) -> None:
    _set_secure_deployment(monkeypatch, app_env=app_env)

    validate_runtime_environment(settings)


@pytest.mark.parametrize("app_env", ["local", "test"])
def test_local_and_test_keep_development_defaults(monkeypatch, app_env) -> None:
    monkeypatch.setattr(settings, "APP_ENV", app_env)
    monkeypatch.setattr(settings, "SECRET_KEY", "supersecretkey")
    monkeypatch.setattr(settings, "BASE_URL", "http://localhost:8000")
    monkeypatch.setattr(settings, "FRONTEND_URL", "")
    monkeypatch.setattr(settings, "SUPER_ADMIN_EMAIL", "admin@assonam.it")
    monkeypatch.setattr(settings, "SUPER_ADMIN_PASSWORD", "admin")

    validate_runtime_environment(settings)


def test_missing_app_env_defaults_to_production_not_local(monkeypatch) -> None:
    monkeypatch.delenv("APP_ENV", raising=False)

    assert _env_app_env() == "production"


def test_compose_requires_explicit_app_env_and_official_deploy_is_production() -> None:
    compose_source = (REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    workflow_source = (
        REPO_ROOT / ".github" / "workflows" / "deploy-hetzner.yml"
    ).read_text(encoding="utf-8")
    dockerfile_source = (REPO_ROOT / "Dockerfile").read_text(encoding="utf-8")

    assert compose_source.count("APP_ENV: ${APP_ENV:?") == 2
    assert "APP_ENV:-local" not in compose_source
    assert "scripts/prepare_deploy_bundle.py" in workflow_source
    assert "APP_ENV=production" in build_app_env({})
    assert "ENV APP_ENV=local" not in dockerfile_source


def test_green_api_deploy_uses_secret_only_when_configured_and_keeps_ip_fallback() -> None:
    compose_source = (REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    app_env_without_secret = build_app_env({"GREEN_API_WEBHOOK_SECRET": ""})
    app_env_with_secret = build_app_env(
        {"GREEN_API_WEBHOOK_SECRET": "configured-test-secret"}
    )

    assert "GREEN_API_WEBHOOK_REQUIRE_SECRET: ${GREEN_API_WEBHOOK_REQUIRE_SECRET:-false}" in compose_source
    assert "GREEN_API_WEBHOOK_ALLOWED_IPS:" in compose_source
    assert "GREEN_API_WEBHOOK_REQUIRE_SECRET=false" in app_env_without_secret
    assert "GREEN_API_WEBHOOK_REQUIRE_SECRET=true" in app_env_with_secret
    assert "GREEN_API_WEBHOOK_ALLOWED_IPS=" in app_env_without_secret


def test_environment_classification_is_not_inferred_from_urls(monkeypatch) -> None:
    _set_secure_deployment(monkeypatch, app_env="production")
    monkeypatch.setattr(settings, "BASE_URL", "http://localhost:8000")
    monkeypatch.setattr(settings, "FRONTEND_URL", "")

    assert settings.IS_LOCAL_ENV is False
    assert settings.IS_DEPLOYED_ENV is True
    with pytest.raises(RuntimeError, match="BASE_URL.*FRONTEND_URL"):
        validate_runtime_environment(settings)

    monkeypatch.setattr(settings, "APP_ENV", "local")
    monkeypatch.setattr(settings, "BASE_URL", "https://api.assonam.it")
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.assonam.it")
    assert settings.IS_LOCAL_ENV is True
    assert settings.IS_DEPLOYED_ENV is False


@pytest.mark.parametrize("app_env", ["", "prod", "development", "qa"])
def test_unknown_app_environment_fails_closed(monkeypatch, app_env) -> None:
    monkeypatch.setattr(settings, "APP_ENV", app_env)

    with pytest.raises(RuntimeError, match="Invalid APP_ENV"):
        validate_runtime_environment(settings)


@pytest.mark.parametrize(
    "secret_key",
    [
        "",
        "supersecretkey",
        "short-but-not-default",
        "a" * 64,
    ],
)
def test_deployment_rejects_weak_or_default_secret_key(monkeypatch, secret_key) -> None:
    _set_secure_deployment(monkeypatch, app_env="production")
    monkeypatch.setattr(settings, "SECRET_KEY", secret_key)

    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        validate_runtime_environment(settings)


@pytest.mark.parametrize(
    "invalid_url",
    [
        "",
        "http://app.assonam.it",
        "https://localhost",
        "https://127.0.0.1",
        "https://10.0.0.8",
        "https://app.assonam.it/private",
        "https://app.assonam.it?preview=1",
        "https://user:password@app.assonam.it",
        "not-a-url",
    ],
)
@pytest.mark.parametrize("variable_name", ["BASE_URL", "FRONTEND_URL"])
def test_deployment_rejects_invalid_or_local_public_urls(
    monkeypatch,
    invalid_url,
    variable_name,
) -> None:
    _set_secure_deployment(monkeypatch, app_env="staging")
    monkeypatch.setattr(settings, variable_name, invalid_url)

    with pytest.raises(RuntimeError, match=variable_name):
        validate_runtime_environment(settings)


@pytest.mark.parametrize(
    ("variable_name", "default_value"),
    [
        ("SUPER_ADMIN_EMAIL", "admin@assonam.it"),
        ("SUPER_ADMIN_EMAIL", ""),
        ("SUPER_ADMIN_PASSWORD", "admin"),
        ("SUPER_ADMIN_PASSWORD", ""),
    ],
)
def test_deployment_rejects_default_super_admin_credentials(
    monkeypatch,
    variable_name,
    default_value,
) -> None:
    _set_secure_deployment(monkeypatch, app_env="production")
    monkeypatch.setattr(settings, variable_name, default_value)

    with pytest.raises(RuntimeError, match=variable_name):
        validate_runtime_environment(settings)


@pytest.mark.parametrize(
    "invalid_allowlist",
    [(), ("not-an-ip",), ("0.0.0.0/0",)],
)
def test_deployment_rejects_invalid_green_api_ip_allowlist(
    monkeypatch,
    invalid_allowlist,
) -> None:
    _set_secure_deployment(monkeypatch, app_env="production")
    monkeypatch.setattr(settings, "GREEN_API_WEBHOOK_ALLOWED_IPS", invalid_allowlist)

    with pytest.raises(RuntimeError, match="GREEN_API_WEBHOOK_ALLOWED_IPS"):
        validate_runtime_environment(settings)
