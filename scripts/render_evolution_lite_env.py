from __future__ import annotations

import argparse
import os
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit


DEFAULT_SERVER_PORT = "8080"
DEFAULT_SERVER_URL = "http://localhost:8080"
DEFAULT_DATABASE_PROVIDER = "postgresql"
DEFAULT_DATABASE_NAME = "evolution"
DEFAULT_CLIENT_NAME = "Chrome"
DEFAULT_CLIENT_DEVICE = "Windows"


def _read_env_values(source_env: Path, required: set[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in source_env.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in raw_line:
            continue
        key, value = raw_line.split("=", 1)
        key = key.strip()
        if key in required:
            values[key] = value
    missing = sorted(key for key in required if not values.get(key, "").strip())
    if missing:
        raise ValueError("Required deployment settings are missing")
    return values


def _build_evolution_database_uri(database_url: str, database_name: str) -> str:
    value = (database_url or "").strip()
    if not value:
        raise ValueError("DATABASE_URL is required")

    parsed = urlsplit(value)
    scheme = parsed.scheme.split("+", 1)[0].lower()
    if scheme != DEFAULT_DATABASE_PROVIDER:
        raise ValueError(
            f"Only PostgreSQL DATABASE_URL values are supported, got scheme '{parsed.scheme}'"
        )

    sanitized_scheme = DEFAULT_DATABASE_PROVIDER
    path = f"/{database_name}"
    return urlunsplit(
        (
            sanitized_scheme,
            parsed.netloc,
            path,
            parsed.query,
            parsed.fragment,
        )
    )


def _render_env_file(
    *,
    database_url: str,
    auth_api_key: str,
    database_name: str,
    server_port: str,
    server_url: str,
) -> str:
    if not auth_api_key.strip():
        raise ValueError("AUTHENTICATION_API_KEY is required")

    evolution_uri = _build_evolution_database_uri(database_url, database_name)

    lines = [
        f"SERVER_PORT={server_port}",
        f"SERVER_URL={server_url}",
        f"DATABASE_PROVIDER={DEFAULT_DATABASE_PROVIDER}",
        f"DATABASE_CONNECTION_URI={evolution_uri}",
        f"AUTHENTICATION_API_KEY={auth_api_key.strip()}",
        f"CONFIG_SESSION_PHONE_CLIENT={DEFAULT_CLIENT_NAME}",
        f"CONFIG_SESSION_PHONE_NAME={DEFAULT_CLIENT_DEVICE}",
        "EVOLUTION_FIRE_INIT_QUERIES=false",
        "DATABASE_SAVE_DATA_CONTACTS=false",
        "DATABASE_SAVE_DATA_CHATS=false",
        "DATABASE_SAVE_DATA_HISTORIC=false",
        "DATABASE_SAVE_IS_ON_WHATSAPP=false",
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Render the minimal Evolution API Lite .env file from the existing ASSONAM DATABASE_URL."
    )
    parser.add_argument("--source-env", required=True, type=Path)
    parser.add_argument("--output", required=True)
    parser.add_argument("--database-name", default=DEFAULT_DATABASE_NAME)
    parser.add_argument("--server-port", default=DEFAULT_SERVER_PORT)
    parser.add_argument("--server-url", default=DEFAULT_SERVER_URL)
    args = parser.parse_args()

    source_values = _read_env_values(
        args.source_env, {"DATABASE_URL", "EVOLUTION_API_KEY"}
    )
    rendered = _render_env_file(
        database_url=source_values["DATABASE_URL"],
        auth_api_key=source_values["EVOLUTION_API_KEY"],
        database_name=args.database_name,
        server_port=args.server_port,
        server_url=args.server_url,
    )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(rendered, encoding="utf-8")
    os.chmod(output_path, 0o600)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
