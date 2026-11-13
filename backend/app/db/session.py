from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import get_settings


@lru_cache
def session_factory() -> sessionmaker[Session]:
    settings = get_settings()
    url = settings.database_url
    # Hosted poolers in transaction mode (Supabase, Neon) hand each transaction
    # to any connection, so statements are never prepared on one of them.
    postgres = {"connect_timeout": 10, "prepare_threshold": None}
    engine = create_engine(
        url,
        pool_pre_ping=not settings.serverless,
        poolclass=NullPool if settings.serverless else None,
        connect_args=postgres if url.startswith("postgresql") else {},
    )
    return sessionmaker(engine, expire_on_commit=False)


def get_session():
    with session_factory()() as session:
        yield session
