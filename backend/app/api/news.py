"""News for the home page: the latest about Cardmática and about Yu-Gi-Oh!."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.dependencies import SessionDep
from app.models import NEWS_SECTIONS
from app.services import news

router = APIRouter(prefix="/api/v1", tags=["Noticias"])


@router.get("/news")
def latest_news(session: SessionDep, limit: Annotated[int, Query(ge=1, le=12)] = 4):
    return {
        section: [news.view(row) for row in news.latest(session, section, limit)]
        for section in NEWS_SECTIONS
    }
