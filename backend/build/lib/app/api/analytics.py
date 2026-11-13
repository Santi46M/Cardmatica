"""Anonymous page and event counts (see app/models/analytics.py)."""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import SessionDep, same_origin
from app.core.config import get_settings
from app.db.base import utcnow
from app.models import UsageCount
from app.services.accounts import limiter

router = APIRouter(prefix="/api/v1/analytics", tags=["Estadísticas"])
# Generous: a person browsing fast still counts; a script flooding does not.
EVENTS_PER_MINUTE = 120


# What the page reports (frontend/js/analytics.js). Anything else is refused,
# so the counts cannot be filled with arbitrary text.
EVENTS = {"carta", "busqueda", "cuenta:registro", "wantlist:agregar"}


class EventInput(BaseModel):
    key: str = Field(min_length=1, max_length=40, pattern=r"^(tab:[A-Za-z]{1,20}|[a-z:]{1,40})$")


def increment(session, key: str) -> None:
    today = utcnow().date()
    changed = session.execute(
        update(UsageCount)
        .where(UsageCount.day == today, UsageCount.key == key)
        .values(count=UsageCount.count + 1)
    ).rowcount
    if changed:
        return
    try:
        with session.begin_nested():
            session.add(UsageCount(day=today, key=key, count=1))
    except IntegrityError:
        # Another request created today's row first: count on it.
        increment(session, key)


@router.post("/event", status_code=204, dependencies=[Depends(same_origin)])
def event(payload: EventInput, request: Request, session: SessionDep):
    if not payload.key.startswith("tab:") and payload.key not in EVENTS:
        raise HTTPException(422, "Evento desconocido")
    if not get_settings().analytics_enabled:
        return Response(status_code=204)
    client = request.client.host if request.client else "unknown"
    if not limiter.allow(f"analytics:{client}", EVENTS_PER_MINUTE):
        raise HTTPException(429, "Demasiados eventos")
    increment(session, payload.key)
    session.commit()
    return Response(status_code=204)


def top_keys(session, days: int = 7, limit: int = 10):
    since = utcnow().date() - timedelta(days=days - 1)
    rows = session.execute(
        select(UsageCount.key, func.sum(UsageCount.count).label("total"))
        .where(UsageCount.day >= since)
        .group_by(UsageCount.key)
        .order_by(func.sum(UsageCount.count).desc())
        .limit(limit)
    )
    return [{"key": key, "count": int(total)} for key, total in rows]
