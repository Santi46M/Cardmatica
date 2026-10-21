from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


@lru_cache
def session_factory() -> sessionmaker[Session]:
    url = get_settings().database_url
    engine = create_engine(
        url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 10} if url.startswith("postgresql") else {},
    )
    return sessionmaker(engine, expire_on_commit=False)


def get_session():
    with session_factory()() as session:
        yield session
