import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.sessions import SessionMiddleware

from app.bootstrap import bootstrap_super_admin
from app.config import settings, validate_runtime_environment
from app.db import get_db, SessionLocal, engine
from app.middleware import (
    RequestIdMiddleware,
    SecurityHeadersMiddleware,
    SessionCsrfMiddleware,
    get_request_id,
)
from app.public_uploads import PublicUploadsStaticFiles
from app.routes import (
    admin,
    ingest_pienissimo,
    integrations,
    join,
    marketing_preferences,
    membership_payments,
    member,
    onboarding,
    org_admin,
    public,
    stripe_connect_demo,
    stripe_webhooks,
    super_admin,
    whatsapp,
    whatsapp_evolution,
)
from app.schema_validation import validate_schema
from app.spa import SPAStaticFiles
from init_db import init_db

logger = logging.getLogger(__name__)

SPA_DIR = os.getenv("SPA_DIR", "frontend/dist")

_is_https = settings.BASE_URL.startswith("https")
_cors_origins = sorted(
    {
        origin.rstrip("/")
        for origin in (settings.BASE_URL, settings.FRONTEND_URL)
        if (origin or "").strip()
    }
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_runtime_security()
    # Ensure upload directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.AFFILIATION_VIDEO_OUTPUT_DIR, exist_ok=True)
    try:
        init_db()

        # Verify schema consistency (SQLite only)
        validate_schema(engine)

        # Bootstrap super admin after DB init
        db = SessionLocal()
        try:
            bootstrap_super_admin(db)
        finally:
            db.close()
    except Exception:
        logger.exception("Application startup validation failed; refusing to start.")
        raise

    if settings.AFFILIAZIONE_ENABLED and not settings.STRIPE_ENABLED:
        logger.warning("Stripe disabled: missing env vars")

    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.PROJECT_VERSION,
    lifespan=lifespan,
    docs_url=None if _is_https else "/docs",
    redoc_url=None if _is_https else "/redoc",
    openapi_url=None if _is_https else "/openapi.json",
)


# ── Middleware stack (last added = outermost) ─────────────────────
# Exception handlers (JSON + request_id for frontend-friendly errors)
def _first_validation_message(errors: list[dict]) -> str:
    if not errors:
        return "Dati non validi."

    first = errors[0] or {}
    msg = first.get("msg")
    loc = first.get("loc") or []
    if not isinstance(msg, str) or not msg.strip():
        return "Dati non validi."

    loc_parts = [str(item) for item in loc if item not in {"body"}]
    if not loc_parts:
        return msg
    return f"{'.'.join(loc_parts)}: {msg}"


def _http_detail_message(detail: object, default: str) -> str:
    if isinstance(detail, str) and detail.strip():
        return detail
    return default


async def _safe_request_body_text(request: Request) -> str | None:
    try:
        raw_body = await request.body()
    except Exception:
        return None

    if not raw_body:
        return None
    if isinstance(raw_body, (bytes, bytearray)):
        return raw_body.decode("utf-8", errors="replace")
    return str(raw_body)


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(
    request: Request, exc: RequestValidationError
):
    errors = exc.errors()
    payload = {
        "detail": errors,
        "message": _first_validation_message(errors),
        "request_id": get_request_id(request),
    }
    body_text = await _safe_request_body_text(request)
    if body_text is not None:
        payload["body"] = body_text
    return JSONResponse(status_code=422, content=jsonable_encoder(payload))


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    default_message = "Richiesta non completata."
    if exc.status_code >= 500:
        default_message = "Errore server, riprova."
    elif exc.status_code == 413:
        default_message = "File troppo grande. Max 10 MB."
    elif exc.status_code == 415:
        default_message = "Formato non valido."

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "message": _http_detail_message(exc.detail, default_message),
            "request_id": get_request_id(request),
        },
        headers=exc.headers,
    )


# 1. Session — innermost, closest to route handlers
# max_age=1800 = 30 minutes session timeout for security
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SECRET_KEY,
    same_site="strict",
    https_only=_is_https,
    max_age=1800,  # 30 minutes - prevents permanent access if session compromised
)

# 2. CORS — restrict cross-origin requests to our own domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Idempotency-Key",
        "X-ASSONAM-API-KEY",
        "X-Client-Version",
    ],
    allow_credentials=True,
)


def _validate_runtime_security() -> None:
    validate_runtime_environment(settings)

# 3. CSRF origin checks for unsafe session-auth requests
app.add_middleware(SessionCsrfMiddleware)

# 4. Security headers
app.add_middleware(SecurityHeadersMiddleware)

# 5. Request ID — outermost, generates unique ID for every request
app.add_middleware(RequestIdMiddleware)

# ── Static files ──────────────────────────────────────────────────

# Backend static assets (favicons, images)
_static_path = Path("app/static")
if _static_path.is_dir():
    app.mount("/static", StaticFiles(directory=_static_path), name="static")

_uploads_path = Path(settings.UPLOAD_DIR)
app.mount(
    "/uploads",
    PublicUploadsStaticFiles(directory=_uploads_path, check_dir=False),
    name="uploads",
)

_generated_videos_path = Path(settings.AFFILIATION_VIDEO_OUTPUT_DIR).parent
app.mount(
    "/generated-videos",
    StaticFiles(directory=_generated_videos_path, check_dir=False),
    name="generated-videos",
)
app.mount(
    "/videos",
    StaticFiles(directory=_generated_videos_path, check_dir=False),
    name="videos",
)


def _include_affiliation_routers() -> None:
    if not settings.AFFILIAZIONE_ENABLED:
        logger.info("Affiliation routes disabled (AFFILIAZIONE_ENABLED=false).")
        return

    try:
        from app.routes import affiliation
    except Exception:
        logger.exception(
            "Affiliation routes enabled but failed to import; "
            "skipping registration to keep service available."
        )
        return

    app.include_router(
        affiliation.router,
        dependencies=[Depends(affiliation.ensure_public_affiliation_enabled)],
    )
    app.include_router(affiliation.super_admin_router)
    app.include_router(affiliation.associations_router)

# ── Routers ───────────────────────────────────────────────────────

app.include_router(join.router)
app.include_router(marketing_preferences.router)
app.include_router(membership_payments.router)
app.include_router(member.router)
app.include_router(admin.router)
app.include_router(org_admin.router)
app.include_router(super_admin.router)
app.include_router(super_admin.associations_router)
_include_affiliation_routers()
app.include_router(public.router)
app.include_router(onboarding.router)
app.include_router(integrations.router)
app.include_router(ingest_pienissimo.router)
app.include_router(whatsapp.router)
app.include_router(whatsapp_evolution.router)
app.include_router(whatsapp_evolution.internal_router)
if settings.ENABLE_STRIPE_CONNECT_DEMO:
    app.include_router(stripe_connect_demo.router)
    app.include_router(stripe_webhooks.router)


@app.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "db": db_ok}


@app.get("/version")
def version():
    return {
        "version": settings.PROJECT_VERSION,
        "git_sha": settings.GIT_SHA or None,
        "build_time": settings.BUILD_TIME or None,
    }


@app.get("/api/version")
def api_version(request: Request):
    return {
        "version": settings.PROJECT_VERSION,
        "git_sha": settings.GIT_SHA or None,
        "build_time": settings.BUILD_TIME or None,
        "request_id": get_request_id(request),
    }


@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS", "HEAD"],
)
def api_not_found(path: str):
    raise HTTPException(status_code=404, detail="Not found")


# ── SPA catch-all (must be LAST to avoid shadowing API routes) ──

_spa_path = Path(SPA_DIR)
if _spa_path.is_dir() and (_spa_path / "index.html").is_file():
    app.mount("/", SPAStaticFiles(directory=_spa_path, html=True), name="frontend")
    logger.info("SPA mounted at / from %s", _spa_path.resolve())
else:
    logger.warning(
        "SPA directory not found or missing index.html: %s — "
        "/ will not serve the SPA. Run the frontend build first.",
        _spa_path.resolve(),
    )
