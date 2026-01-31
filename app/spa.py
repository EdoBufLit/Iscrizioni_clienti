"""
SPA static file server with client-side routing fallback.

Any GET request under the mount path that does not match a real file
on disk is answered with ``index.html`` so that the React router can
handle the route on the client side.
"""

from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles


class SPAStaticFiles(StaticFiles):
    """StaticFiles subclass that falls back to index.html for SPA routing."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code == 404:
                # Let the SPA client-side router handle the path
                return await super().get_response("index.html", scope)
            raise
