"""Attempts allowed per key and minute, counted in the database.

A counter in memory is one per server process; on Vercel every request may
land on a different one, so it hardly limited anything (security review, #4).
Here every server adds to the same row in one statement, safe when two
requests arrive at once.
"""

import time

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models import RateLimit

# Rows are kept an hour: enough for every window, short for a visitor's address.
KEEP_MINUTES = 60


def allow(session: Session, key: str, limit: int) -> tuple[bool, int]:
    """Counts one attempt; whether it is within `limit` this minute, and the
    seconds until the next minute (the 429's Retry-After)."""
    now = time.time()
    minute = int(now // 60)
    insert = postgres_insert if session.bind.dialect.name == "postgresql" else sqlite_insert
    statement = (
        insert(RateLimit)
        .values(key=key, minute=minute, count=1)
        .on_conflict_do_update(
            index_elements=["key", "minute"], set_={"count": RateLimit.count + 1}
        )
        .returning(RateLimit.count)
    )
    count = session.execute(statement).scalar_one()
    if count == 1:
        # First attempt of this key this minute: a good moment to forget old rows.
        session.execute(delete(RateLimit).where(RateLimit.minute < minute - KEEP_MINUTES))
    session.commit()
    return count <= limit, 60 - int(now % 60)
