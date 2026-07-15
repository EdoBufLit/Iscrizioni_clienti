from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.spa import SPAStaticFiles


def _assert_javascript_content_type(response) -> None:
    media_type = response.headers["content-type"].split(";", 1)[0]
    assert media_type in {"text/javascript", "application/javascript"}


def _build_spa_client(tmp_path: Path) -> TestClient:
    dist_dir = tmp_path / "dist"
    assets_dir = dist_dir / "assets"
    assets_dir.mkdir(parents=True)

    (dist_dir / "index.html").write_text(
        "<!doctype html><html><body>SPA ENTRY</body></html>",
        encoding="utf-8",
    )
    (assets_dir / "main.js").write_text("console.log('ok');", encoding="utf-8")
    (assets_dir / "index-currenthash.js").write_text(
        "console.log('current-index-js');",
        encoding="utf-8",
    )
    (assets_dir / "index-currenthash.css").write_text(
        "body { background: #fff; }",
        encoding="utf-8",
    )

    app = FastAPI()
    app.mount("/", SPAStaticFiles(directory=dist_dir, html=True), name="frontend")
    return TestClient(app)


def test_spa_route_falls_back_to_index(tmp_path: Path):
    client = _build_spa_client(tmp_path)
    response = client.get("/pienissimo/thank-you/oasi-2")

    assert response.status_code == 200
    assert "SPA ENTRY" in response.text
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers.get("cache-control") == "no-cache"


def test_missing_asset_returns_404_not_index(tmp_path: Path):
    client = _build_spa_client(tmp_path)
    response = client.get("/assets/chunk-Wjd0D21K.js")

    assert response.status_code == 404


def test_existing_asset_is_served_normally(tmp_path: Path):
    client = _build_spa_client(tmp_path)
    response = client.get("/assets/main.js")

    assert response.status_code == 200
    assert "console.log('ok');" in response.text
    _assert_javascript_content_type(response)
    assert "immutable" in response.headers.get("cache-control", "")


def test_legacy_index_hashed_js_is_served_from_current_index_asset(tmp_path: Path):
    client = _build_spa_client(tmp_path)
    response = client.get("/assets/index-Wjd0D21K.js")

    assert response.status_code == 200
    assert "current-index-js" in response.text
    _assert_javascript_content_type(response)
    assert response.headers.get("x-asset-fallback") == "legacy-index-hash"


def test_legacy_index_hashed_css_is_served_from_current_index_asset(tmp_path: Path):
    client = _build_spa_client(tmp_path)
    response = client.get("/assets/index-2XkQLQzJ.css")

    assert response.status_code == 200
    assert "background" in response.text
    assert response.headers["content-type"].startswith("text/css")
    assert response.headers.get("x-asset-fallback") == "legacy-index-hash"
