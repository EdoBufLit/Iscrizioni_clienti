import re

from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles


class PublicUploadsStaticFiles(StaticFiles):
    """Serve only explicitly public upload subtrees.

    This prevents accidental exposure of member documents while keeping
    Wallet branding assets available at their existing URLs.
    """

    _ALLOWED_PATTERNS = (
        re.compile(r"^org/\d+/wallet/[^/]+$"),
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
        return await super().get_response(normalized, scope)
