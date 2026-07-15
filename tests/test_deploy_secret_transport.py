from __future__ import annotations

import os
import re
import stat
import subprocess
import sys
from pathlib import Path
from typing import Iterator

import pytest

from scripts.prepare_deploy_bundle import prepare_bundle


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "deploy-hetzner.yml"
REMOTE_SCRIPT_PATH = REPO_ROOT / "scripts" / "deploy_remote.sh"


def _shell_blocks(source: str) -> Iterator[str]:
    lines = source.splitlines()
    block_start = re.compile(r"^(?P<indent>\s*)(?:run|script):\s*\|\s*$")
    index = 0
    while index < len(lines):
        match = block_start.match(lines[index])
        index += 1
        if match is None:
            continue
        parent_indent = len(match.group("indent"))
        block: list[str] = []
        while index < len(lines):
            line = lines[index]
            if line and len(line) - len(line.lstrip()) <= parent_indent:
                break
            block.append(line)
            index += 1
        yield "\n".join(block)


def _assert_mode(path: Path, expected: int) -> None:
    if os.name != "nt":
        assert stat.S_IMODE(path.stat().st_mode) == expected


def test_workflow_keeps_secret_expressions_out_of_shell_bodies() -> None:
    source = WORKFLOW_PATH.read_text(encoding="utf-8")
    forbidden_expression = re.compile(
        r"\$\{\{\s*(?:secrets\.[A-Z0-9_]+|github\.token)\s*\}\}"
    )

    for block in _shell_blocks(source):
        assert forbidden_expression.search(block) is None
        assert "set -x" not in block
        assert "${{ github.ref_name }}" not in block
        assert "${{ github.event.repository.default_branch }}" not in block

    assert "appleboy/ssh-action" not in source
    assert "StrictHostKeyChecking=no" not in source
    assert "HETZNER_KNOWN_HOSTS" in source
    assert "group: production-hetzner" in source
    assert "scripts/deploy_remote.sh" in source
    assert "bash '$REMOTE_STAGE/deploy_remote.sh'" in source
    assert "bash -se" not in source
    assert "scripts/prepare_deploy_bundle.py" in source


def test_private_bundle_separates_controls_and_secret_material(tmp_path: Path) -> None:
    sentinels = {
        "SECRET_KEY": "SENTINEL_APP_SECRET_7f4f",
        "DATABASE_URL": "postgresql+psycopg2://user:SENTINEL_DB_913a@db/app",
        "SMTP_PASSWORD": "SENTINEL_SMTP_85b1",
        "GHCR_TOKEN": "SENTINEL_GHCR_f2ae",
    }
    output = tmp_path / "bundle"

    prepare_bundle(
        output,
        {
            **sentinels,
            "APP_PATH": "/opt/assonam/app",
            "BRANCH": "feat/test",
            "GHCR_USERNAME": "test-user",
            "GIT_SHA": "a" * 40,
        },
    )

    _assert_mode(output, 0o700)
    for name in ("app.env", "control.env", "ghcr.token"):
        _assert_mode(output / name, 0o600)

    app_env = (output / "app.env").read_text(encoding="utf-8")
    control_env = (output / "control.env").read_text(encoding="utf-8")
    ghcr_token = (output / "ghcr.token").read_text(encoding="utf-8")
    assert sentinels["SECRET_KEY"] in app_env
    assert sentinels["DATABASE_URL"] in app_env
    assert sentinels["SMTP_PASSWORD"] in app_env
    assert sentinels["GHCR_TOKEN"] == ghcr_token.strip()
    assert not any(secret in control_env for secret in sentinels.values())


def test_private_bundle_rejects_multiline_values(tmp_path: Path) -> None:
    output = tmp_path / "bundle"
    with pytest.raises(ValueError, match="single-line"):
        prepare_bundle(
            output,
            {"GHCR_TOKEN": "token", "SECRET_KEY": "first\nsecond"},
        )
    assert not output.exists()


def test_renderers_read_credentials_from_private_files_not_argv(
    tmp_path: Path,
) -> None:
    source_env = tmp_path / "app.env"
    source_env.write_text(
        "DATABASE_URL=postgresql+psycopg2://user:encoded%24pass@db:5432/app\n"
        "EVOLUTION_API_KEY=evolution-sentinel\n",
        encoding="utf-8",
    )
    evolution_output = tmp_path / "evolution.env"
    pgloader_output = tmp_path / "migration.load"

    evolution_result = subprocess.run(
        [
            sys.executable,
            str(REPO_ROOT / "scripts" / "render_evolution_lite_env.py"),
            "--source-env",
            str(source_env),
            "--output",
            str(evolution_output),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    pgloader_result = subprocess.run(
        [
            sys.executable,
            str(REPO_ROOT / "scripts" / "render_pgloader_load.py"),
            "--source-env",
            str(source_env),
            "--output",
            str(pgloader_output),
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    assert evolution_result.stdout == evolution_result.stderr == ""
    assert pgloader_result.stdout == pgloader_result.stderr == ""
    assert "evolution-sentinel" in evolution_output.read_text(encoding="utf-8")
    pgloader_source = pgloader_output.read_text(encoding="utf-8")
    assert "postgresql://user:encoded%24pass@db:5432/app" in pgloader_source
    _assert_mode(evolution_output, 0o600)
    _assert_mode(pgloader_output, 0o600)


def test_remote_deploy_has_no_credential_bearing_cli_arguments() -> None:
    source = REMOTE_SCRIPT_PATH.read_text(encoding="utf-8")
    forbidden = (
        "--database-url",
        "--auth-api-key",
        "postgresql://assonam:${",
        'echo "$GHCR_TOKEN"',
        "printenv",
        "docker compose config",
        "pgrep -af",
        "ps aux",
    )

    assert not any(pattern in source for pattern in forbidden)
    assert '--source-env "$APP_ENV_SOURCE"' in source
    assert '--password-stdin < "$GHCR_TOKEN_SOURCE"' in source
    assert "pgloader /run/secrets/migration.load" in source
    assert "-v \"$PGLOADER_FILE:/run/secrets/migration.load:ro\"" in source
    assert 'install -d -m 700 secrets' in source
    assert 'mv -f "$ENV_TMP" .env' in source
    assert 'git checkout -B "$BRANCH" "$DEPLOY_SHA"' in source
    assert "flock -w 1200" in source
    assert "Final canary passed" in source
    assert "alembic current" in source
