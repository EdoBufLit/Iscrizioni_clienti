"""Security middleware: response headers, request ID, and rate limiting."""

import ipaddress
import re
import time
import uuid
from collections import defaultdict
from threading import Lock
from urllib.parse import urlparse

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings


# Request ID
class RequestIdMiddleware(BaseHTTPMiddleware):
    """Generate a unique request ID for every request and attach to response."""

    async def dispatch(self, request: Request, call_next):
        request_id = uuid.uuid4().hex[:12]
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response


def get_request_id(request: Request) -> str:
    """Get the request ID from request state, or generate one."""
    return getattr(request.state, "request_id", uuid.uuid4().hex[:12])


# Security headers
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add standard security headers to every response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        allow_same_origin_embed = bool(
            re.match(
                r"^/api/(super-admin|org-admin)/accounting/documents/\d+/preview$",
                request.url.path,
            )
        )
        frame_ancestors = "'self'" if allow_same_origin_embed else "'none'"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = (
            "SAMEORIGIN" if allow_same_origin_embed else "DENY"
        )
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "base-uri 'self'; "
            f"frame-ancestors {frame_ancestors}; "
            "form-action 'self'; "
            "img-src 'self' data: blob: https:; "
            "font-src 'self' data: https://fonts.gstatic.com; "
            "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "script-src 'self' 'unsafe-inline'"
        )
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        # Prevent caching of API responses
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response


def _normalize_origin(raw_url: str | None) -> str:
    if not raw_url:
        return ""
    parsed = urlparse(raw_url.strip())
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


_CSRF_ALLOWED_ORIGINS = {
    origin
    for origin in (
        _normalize_origin(settings.BASE_URL),
        _normalize_origin(settings.FRONTEND_URL),
    )
    if origin
}
_CSRF_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_CSRF_PROTECTED_PATH_PREFIXES = (
    "/api/auth/",
    "/api/org-admin/",
    "/api/super-admin/",
    "/api/me/onboarding/",
)


class SessionCsrfMiddleware(BaseHTTPMiddleware):
    """Best-effort CSRF protection for session-based unsafe requests."""

    async def dispatch(self, request: Request, call_next):
        method = request.method.upper()
        path = request.url.path

        requires_check = (
            method in _CSRF_UNSAFE_METHODS
            and path.startswith(_CSRF_PROTECTED_PATH_PREFIXES)
            and "session" in request.cookies
            and bool(_CSRF_ALLOWED_ORIGINS)
        )

        if requires_check:
            origin = _normalize_origin(request.headers.get("origin"))
            referer = _normalize_origin(request.headers.get("referer"))

            if origin and origin not in _CSRF_ALLOWED_ORIGINS:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "CSRF blocked (origin mismatch)"},
                )

            if not origin and referer and referer not in _CSRF_ALLOWED_ORIGINS:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "CSRF blocked (referer mismatch)"},
                )

        return await call_next(request)


# Rate limiter
class RateLimiter:
    """In-memory sliding-window rate limiter (single-process only).

    For multi-process production deployments, replace with a Redis-backed
    implementation.
    """

    def __init__(self, max_requests: int = 5, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def check(self, key: str) -> None:
        """Raise HTTP 429 if *key* has exceeded the rate limit."""
        now = time.monotonic()
        with self._lock:
            cutoff = now - self.window
            hits = [t for t in self._hits[key] if t > cutoff]
            if len(hits) >= self.max_requests:
                self._hits[key] = hits
                raise HTTPException(
                    status_code=429,
                    detail="Too many requests. Please try again later.",
                )
            hits.append(now)
            self._hits[key] = hits


# Shared limiter instances - import in route modules.
auth_limiter = RateLimiter(max_requests=5, window_seconds=60)
join_limiter = RateLimiter(max_requests=3, window_seconds=60)


def get_client_ip(request: Request) -> str:
    """Best-effort client IP, trusting X-Forwarded-For only from trusted proxies."""
    peer_host = request.client.host if request.client else ""
    forwarded = request.headers.get("x-forwarded-for")
    if not forwarded or not peer_host:
        return peer_host or "unknown"

    try:
        peer_ip = ipaddress.ip_address(peer_host)
        peer_is_trusted_proxy = peer_ip.is_loopback or peer_ip.is_private
    except ValueError:
        peer_is_trusted_proxy = peer_host.lower() == "localhost"

    if not peer_is_trusted_proxy:
        return peer_host

    forwarded_chain = [
        item.strip()
        for item in forwarded.split(",")
        if item and item.strip() and item.strip().lower() != "unknown"
    ]
    for candidate in reversed(forwarded_chain):
        try:
            candidate_ip = ipaddress.ip_address(candidate)
            if candidate_ip.is_loopback or candidate_ip.is_private:
                continue
        except ValueError:
            if candidate.lower() == "localhost":
                continue
        return candidate

    return forwarded_chain[-1] if forwarded_chain else peer_host
