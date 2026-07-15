import re

from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles


class PublicUploadsStaticFiles(StaticFiles):
    """Serve only explicitly public upload subtrees.

    This prevents accidental exposure of member documents while keeping
    explicitly public Wallet and email-builder assets at their existing URLs.
    """

    _ALLOWED_PATTERNS = (
        re.compile(r"^org/\d+/wallet/[^/]+$"),
        re.compile(r"^org/\d+/communications/[^/]+$"),
        re.compile(r"^affiliation-videos/[^/]+$"),
    )

    @classmethod
    def _is_public_upload_path(cls, path: str) -> bool:
        normalized = path.lstrip("/").replace("\\", "/")
        return any(pattern.match(normalized) for pattern in cls._ALLOWED_PATTERNS)

    async def get_response(self, path: str, scope):
        normalized = path.lstrip("/").replace("\\", "/")
        if not self._is_public_upload_path(normalized):
            raise HTTPException(status_code=404)
        response = await super().get_response(normalized, scope)
        response.headers["X-Content-Type-Options"] = "nosniff"
        if normalized.lower().endswith(".svg"):
            # Legacy SVG assets may already exist. Sandboxing keeps them usable
            # as images while preventing scripts or same-origin navigation when
            # somebody opens the asset directly.
            response.headers["Content-Security-Policy"] = (
                "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:"
            )
        return response
