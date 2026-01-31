import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.routes import admin, join, member, public
from app.spa import SPAStaticFiles
from init_db import init_db

logger = logging.getLogger(__name__)

SPA_DIR = os.getenv("SPA_DIR", "frontend/dist")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure upload directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    try:
        init_db()
    except Exception:
        logger.exception("Database initialization failed.")
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.PROJECT_VERSION,
    lifespan=lifespan,
)

# Add Session Middleware
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)

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

app.include_router(join.router)
app.include_router(member.router)
app.include_router(admin.router)
app.include_router(public.router)


@app.get("/")
def read_root():
    return RedirectResponse(url="/app/")
