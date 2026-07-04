from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings

# NOTE: MySQL is the target production database (see requirements doc).
# `pool_pre_ping` avoids stale-connection errors for long-running services
# such as the telemetry simulator and the AI recommendation engine.
# For SQLite, we must set check_same_thread=False and handle pool parameters.
is_sqlite = settings.SQLALCHEMY_DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}
pool_recycle = -1 if is_sqlite else 3600

engine = create_engine(
    settings.SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=pool_recycle,
    connect_args=connect_args
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
