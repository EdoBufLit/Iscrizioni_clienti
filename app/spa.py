"""
SPA static file server with client-side routing fallback.

Any GET request under the mount path that does not match a real file
on disk is answered with ``index.html`` so that the React router can
handle the route on the client side.
"""

import re
from pathlib import Path, PurePosixPath

from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles


class SPAStaticFiles(StaticFiles):
    """StaticFiles subclass that falls back to index.html for SPA routing."""

    _LEGACY_INDEX_ASSET_RE = re.compile(r"^assets/index-[A-Za-z0-9_-]+\.(js|css)$")

    @staticmethod
    def _looks_like_asset_path(path: str) -> bool:
        # Keep real assets strict: /assets/*.js, *.css, *.png, etc.
        # Only extension-less paths should fall back to index.html.
        filename = PurePosixPath(path).name
        return bool(filename and "." in filename)

    def _resolve_legacy_index_asset(self, path: str) -> str | None:
        normalized_path = path.lstrip("/").replace("\\", "/")
        match = self._LEGACY_INDEX_ASSET_RE.match(normalized_path)
        if not match:
            return None

        if not self.directory:
            return None
        assets_dir = Path(self.directory) / "assets"
        if not assets_dir.is_dir():
            return None

        ext = match.group(1)
        candidates = sorted(
            assets_dir.glob(f"index-*.{ext}"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        for candidate in candidates:
            relative = candidate.relative_to(Path(self.directory)).as_posix()
            if relative != normalized_path:
                return relative
        return None

    @staticmethod
    def _set_cache_headers(path: str, response) -> None:
        filename = PurePosixPath(path).name
        normalized_path = path.lstrip("/").replace("\\", "/")
        if path == "index.html" or not filename or "." not in filename:
            response.headers["Cache-Control"] = "no-cache"
            return
        if normalized_path.startswith("assets/"):
            response.headers.setdefault(
                "Cache-Control", "public, max-age=31536000, immutable"
            )
        else:
            response.headers.setdefault("Cache-Control", "public, max-age=3600")

    async def get_response(self, path: str, scope):
        try:
            response = await super().get_response(path, scope)
            self._set_cache_headers(path, response)
            return response
        except HTTPException as exc:
            if exc.status_code == 404:
                method = (scope.get("method") or "GET").upper()
                if method not in {"GET", "HEAD"}:
                    raise
                if self._looks_like_asset_path(path):
                    fallback_asset = self._resolve_legacy_index_asset(path)
                    if fallback_asset:
                        response = await super().get_response(fallback_asset, scope)
                        self._set_cache_headers(fallback_asset, response)
                        response.headers["X-Asset-Fallback"] = "legacy-index-hash"
                        return response
                    # Do not mask missing JS/CSS/images with index.html.
                    raise
                # Let the SPA client-side router handle the path
                response = await super().get_response("index.html", scope)
                self._set_cache_headers("index.html", response)
                return response
            raise
