import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

_default_db = "sqlite:///./data/app.db"
if os.path.isdir("/app"):
    _default_db = "sqlite:////app/data/app.db"

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", _default_db)

_engine_kwargs = {"pool_pre_ping": True}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    **_engine_kwargs,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def init_db() -> None:
    """DEPRECATED: Use Alembic migrations instead.

    This function is kept for backwards compatibility but should NOT be used
    in production. Schema changes should be managed exclusively via Alembic.

    In production:
    1. Set SKIP_CREATE_ALL=1
    2. Run: alembic upgrade head
    """
    import warnings
    warnings.warn(
        "app.db.init_db() is deprecated. Use 'alembic upgrade head' instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    import app.models
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
