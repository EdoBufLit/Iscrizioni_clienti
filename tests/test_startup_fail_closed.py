import asyncio

import pytest

import app.main as main_module


def _run_lifespan_startup() -> None:
    async def _enter() -> None:
        async with main_module.lifespan(main_module.app):
            return

    asyncio.run(_enter())


def test_startup_fails_closed_on_runtime_security_error(monkeypatch):
    def _reject_runtime() -> None:
        raise RuntimeError("insecure runtime")

    monkeypatch.setattr(main_module, "_validate_runtime_security", _reject_runtime)

    with pytest.raises(RuntimeError, match="insecure runtime"):
        _run_lifespan_startup()


@pytest.mark.parametrize("failing_step", ["init_db", "validate_schema", "bootstrap"])
def test_startup_fails_closed_on_initialization_error(monkeypatch, failing_step):
    monkeypatch.setattr(main_module, "_validate_runtime_security", lambda: None)
    monkeypatch.setattr(main_module, "init_db", lambda: None)
    monkeypatch.setattr(main_module, "validate_schema", lambda _engine: None)
    monkeypatch.setattr(main_module, "bootstrap_super_admin", lambda _db: None)

    def _fail(*_args, **_kwargs) -> None:
        raise RuntimeError(f"{failing_step} failed")

    if failing_step == "bootstrap":
        monkeypatch.setattr(main_module, "bootstrap_super_admin", _fail)
    else:
        monkeypatch.setattr(main_module, failing_step, _fail)

    with pytest.raises(RuntimeError, match=f"{failing_step} failed"):
        _run_lifespan_startup()
