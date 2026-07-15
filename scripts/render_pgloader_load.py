"""Render a private pgloader control file without putting credentials in argv."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit


def _database_url(source_env: Path) -> str:
    value = ""
    for raw_line in source_env.read_text(encoding="utf-8").splitlines():
        if raw_line.startswith("DATABASE_URL="):
            value = raw_line.split("=", 1)[1].strip()
    if not value:
        raise ValueError("DATABASE_URL is required")
    if any(character.isspace() for character in value) or ";" in value:
        raise ValueError("DATABASE_URL must be a percent-encoded single URI")
    parsed = urlsplit(value)
    if parsed.scheme.split("+", 1)[0].lower() != "postgresql":
        raise ValueError("Only PostgreSQL DATABASE_URL values are supported")
    return urlunsplit(
        ("postgresql", parsed.netloc, parsed.path, parsed.query, parsed.fragment)
    )


def render_pgloader_load(source_env: Path) -> str:
    target = _database_url(source_env)
    return (
        "LOAD DATABASE\n"
        "     FROM sqlite:///tmp/app.db\n"
        f"     INTO {target};\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a private pgloader load file")
    parser.add_argument("--source-env", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.output.write_text(render_pgloader_load(args.source_env), encoding="utf-8")
    os.chmod(args.output, 0o600)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
