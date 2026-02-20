"""
SPA static file server with client-side routing fallback.

Any GET request under the mount path that does not match a real file
on disk is answered with ``index.html`` so that the React router can
handle the route on the client side.
"""

from pathlib import PurePosixPath

from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles


class SPAStaticFiles(StaticFiles):
    """StaticFiles subclass that falls back to index.html for SPA routing."""

    @staticmethod
    def _looks_like_asset_path(path: str) -> bool:
        # Keep real assets strict: /assets/*.js, *.css, *.png, etc.
        # Only extension-less paths should fall back to index.html.
        filename = PurePosixPath(path).name
        return bool(filename and "." in filename)

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
                    # Do not mask missing JS/CSS/images with index.html.
                    raise
                # Let the SPA client-side router handle the path
                response = await super().get_response("index.html", scope)
                self._set_cache_headers("index.html", response)
                return response
            raise
