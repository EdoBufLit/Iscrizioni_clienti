import os

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker, declarative_base

_default_db = "sqlite:///./data/app.db"
if os.path.isdir("/app"):
    _default_db = "sqlite:////app/data/app.db"

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", _default_db)

# Runtime connections must fail within seconds when a transaction holds a lock.
# Alembic creates its own engine, so these limits do not constrain migrations.
_POSTGRESQL_TIMEOUT_OPTIONS = (
    "-clock_timeout=5000 "
    "-cstatement_timeout=30000 "
    "-cidle_in_transaction_session_timeout=60000"
)
_POSTGRESQL_TIMEOUT_SQL = (
    "SET lock_timeout = '5000ms'; "
    "SET statement_timeout = '30000ms'; "
    "SET idle_in_transaction_session_timeout = '60000ms'"
)


def _engine_kwargs_for_url(database_url: str) -> dict:
    url = make_url(database_url)
    kwargs = {"pool_pre_ping": True}
    if url.get_backend_name() == "sqlite":
        kwargs["connect_args"] = {"check_same_thread": False}
    elif url.get_backend_name() == "postgresql":
        existing_options = url.query.get("options", "")
        if not isinstance(existing_options, str):
            raise ValueError("PostgreSQL DATABASE_URL options must appear only once")
        kwargs.update(
            pool_size=5,
            max_overflow=5,
            pool_timeout=5,
            connect_args={
                # SQLAlchemy applies connect_args after the URL query values.
                "connect_timeout": 5,
                # Keep search_path and other existing options, then override
                # timeout values so URL options cannot disable the safeguards.
                "options": f"{existing_options} {_POSTGRESQL_TIMEOUT_OPTIONS}".strip(),
            },
        )
    return kwargs


def _restore_postgresql_timeouts(dbapi_connection, _record, _proxy) -> None:
    """Reapply limits on every checkout without opening a transaction."""

    previous_autocommit = dbapi_connection.autocommit
    dbapi_connection.autocommit = True
    try:
        with dbapi_connection.cursor() as cursor:
            cursor.execute(_POSTGRESQL_TIMEOUT_SQL)
    finally:
        dbapi_connection.autocommit = previous_autocommit


def create_app_engine(database_url: str):
    app_engine = create_engine(database_url, **_engine_kwargs_for_url(database_url))
    if app_engine.dialect.name == "postgresql":
        event.listen(app_engine, "checkout", _restore_postgresql_timeouts)
    return app_engine


engine = create_app_engine(SQLALCHEMY_DATABASE_URL)
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
