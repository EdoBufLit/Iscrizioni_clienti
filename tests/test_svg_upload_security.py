import asyncio
import hashlib
import io
from pathlib import Path

import pytest
from starlette.datastructures import Headers, UploadFile
from starlette.responses import FileResponse
from starlette.routing import Route
from starlette.testclient import TestClient
from starlette.applications import Starlette

from app.config import settings
from app.middleware import SecurityHeadersMiddleware
from app.services.svg_sanitizer import UnsafeSvgError, sanitize_svg_bytes
from app.services.wallet_asset_upload import save_wallet_logo_file


_SAFE_SVG = b"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40">
  <defs>
    <linearGradient id="paint"><stop offset="0" stop-color="#123456"/></linearGradient>
    <path id="mark" d="M2 2h30v30H2z"/>
  </defs>
  <style>.brand { fill: url(#paint); }</style>
  <use href="#mark" class="brand"/>
  <text x="40" y="24">Associazione</text>
</svg>"""


def _upload(filename: str, payload: bytes, content_type: str) -> UploadFile:
    return UploadFile(
        io.BytesIO(payload),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


def test_benign_svg_is_canonicalized_and_keeps_local_references():
    sanitized = sanitize_svg_bytes(_SAFE_SVG)

    assert sanitized.startswith(b"<?xml")
    assert b"<script" not in sanitized.lower()
    assert b"foreignObject" not in sanitized
    assert b"url(#paint)" in sanitized
    assert b'href="#mark"' in sanitized


@pytest.mark.parametrize(
    "payload",
    [
        b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
        b"<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'><path d='M0 0'/></svg>",
        b"<svg xmlns='http://www.w3.org/2000/svg'><foreignObject><div>html</div></foreignObject></svg>",
        b"<svg xmlns='http://www.w3.org/2000/svg'><use href='https://evil.example/x.svg#x'/></svg>",
        b"<svg xmlns='http://www.w3.org/2000/svg' xml:base='https://evil.example/'><use href='#x'/></svg>",
        b"<svg xmlns='http://www.w3.org/2000/svg'><path style='fill:url(https://evil.example/pixel)'/></svg>",
        b"<svg xmlns='http://www.w3.org/2000/svg'><animate attributeName='href' values='#ok;javascript:alert(1)'/></svg>",
        b"<!DOCTYPE svg [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]><svg xmlns='http://www.w3.org/2000/svg'>&xxe;</svg>",
        b"<svg xmlns='http://www.w3.org/2000/svg'><image href='data:image/svg+xml;base64,PHN2Zy8+'/></svg>",
    ],
)
def test_active_or_external_svg_payloads_are_rejected(payload: bytes):
    with pytest.raises(UnsafeSvgError):
        sanitize_svg_bytes(payload)


def test_wallet_logo_upload_accepts_and_persists_only_sanitized_svg(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))

    relative_path, size_bytes, sha256 = asyncio.run(
        save_wallet_logo_file(
            _upload("brand.svg", _SAFE_SVG, "image/svg+xml"),
            org_id=42,
        )
    )

    stored = (tmp_path / Path(relative_path)).read_bytes()
    assert Path(relative_path).suffix == ".svg"
    assert size_bytes == len(stored)
    assert sha256 == hashlib.sha256(stored).hexdigest()
    assert stored == sanitize_svg_bytes(_SAFE_SVG)


def test_svg_response_is_sandboxed_even_when_url_has_no_svg_suffix(tmp_path):
    svg_path = tmp_path / "logo.svg"
    svg_path.write_bytes(sanitize_svg_bytes(_SAFE_SVG))

    async def organization_logo(_request):
        return FileResponse(svg_path)

    app = Starlette(routes=[Route("/api/organizations/demo/logo", organization_logo)])
    app.add_middleware(SecurityHeadersMiddleware)

    with TestClient(app) as client:
        response = client.get("/api/organizations/demo/logo")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/svg+xml")
    assert "sandbox" in response.headers["content-security-policy"]
    assert "default-src 'none'" in response.headers["content-security-policy"]
    assert response.headers["x-content-type-options"] == "nosniff"
