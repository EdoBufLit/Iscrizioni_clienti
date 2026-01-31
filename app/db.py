import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

_default_db = "sqlite:///data/app.db"
if os.path.isdir("/app"):
    _default_db = "sqlite:////app/data/app.db"

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", _default_db)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def init_db() -> None:
    import app.models

    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
