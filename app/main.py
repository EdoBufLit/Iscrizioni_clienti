import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from app.bootstrap import bootstrap_super_admin
from app.config import settings
from app.db import get_db, SessionLocal
from app.middleware import SecurityHeadersMiddleware
from app.routes import admin, join, member, org_admin, public, super_admin
from app.spa import SPAStaticFiles
from init_db import init_db

logger = logging.getLogger(__name__)

SPA_DIR = os.getenv("SPA_DIR", "frontend/dist")

_is_https = settings.BASE_URL.startswith("https")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure upload directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    try:
        init_db()
        # Bootstrap super admin after DB init
        db = SessionLocal()
        try:
            bootstrap_super_admin(db)
        finally:
            db.close()
    except Exception:
        logger.exception("Database initialization failed.")
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

# 1. Session — innermost, closest to route handlers
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SECRET_KEY,
    same_site="lax",
    https_only=_is_https,
)

# 2. CORS — restrict cross-origin requests to our own domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.BASE_URL],
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
    allow_credentials=True,
)

# 3. Security headers — outermost, applies to every response
app.add_middleware(SecurityHeadersMiddleware)

# ── Static files ──────────────────────────────────────────────────

# Backend static assets (favicons, images)
_static_path = Path("app/static")
if _static_path.is_dir():
    app.mount("/static", StaticFiles(directory=_static_path), name="static")

# Serve the React SPA build with client-side routing fallback
_spa_path = Path(SPA_DIR)
if _spa_path.is_dir() and (_spa_path / "index.html").is_file():
    app.mount("/app", SPAStaticFiles(directory=_spa_path, html=True), name="frontend")
    logger.info("SPA mounted at /app from %s", _spa_path.resolve())
else:
    logger.warning(
        "SPA directory not found or missing index.html: %s — "
        "/app will not be available. Run the frontend build first.",
        _spa_path.resolve(),
    )

# ── Routers ───────────────────────────────────────────────────────

app.include_router(join.router)
app.include_router(member.router)
app.include_router(admin.router)
app.include_router(org_admin.router)
app.include_router(super_admin.router)
app.include_router(public.router)


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


@app.get("/")
def read_root():
    return RedirectResponse(url="/app/")
