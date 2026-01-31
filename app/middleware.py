"""Security middleware: response headers and rate limiting."""

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware


# ── Security Headers ──────────────────────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add standard security headers to every response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        # Prevent caching of API responses
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response


# ── Rate Limiter ──────────────────────────────────────────────────

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


# Shared limiter instances — import in route modules.
auth_limiter = RateLimiter(max_requests=5, window_seconds=60)
join_limiter = RateLimiter(max_requests=3, window_seconds=60)


def get_client_ip(request: Request) -> str:
    """Best-effort client IP, respecting X-Forwarded-For behind a proxy."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
