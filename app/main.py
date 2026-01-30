from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from starlette.middleware.sessions import SessionMiddleware
from contextlib import asynccontextmanager
import os

from app.config import settings
from init_db import init_db
from app.routes import join, member, admin, public
from init_db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure upload directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    try:
        init_db()
    except Exception:
        import logging

        logging.getLogger(__name__).exception("Database initialization failed.")
    yield

app = FastAPI(title=settings.PROJECT_NAME, version=settings.PROJECT_VERSION, lifespan=lifespan)

# Add Session Middleware
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Templates
templates = Jinja2Templates(directory="app/templates")

app.include_router(join.router)
app.include_router(member.router)
app.include_router(admin.router)
app.include_router(public.router)

@app.get("/", response_class=HTMLResponse)
def read_root(request: Request):
    return templates.TemplateResponse("home.html", {"request": request})
