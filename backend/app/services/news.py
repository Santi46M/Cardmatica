"""News for the home page (app/models/news.py)."""

import secrets
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, model_validator
from sqlalchemy import select

from app.core.languages import LANGUAGES
from app.models import NewsItem


class NewsInput(BaseModel):
    section: Literal["site", "yugioh"]
    language: Literal["es", "pt", "en"] = "es"
    title: str = Field(min_length=3, max_length=140)
    summary: str = Field(min_length=3, max_length=400)
    url: HttpUrl | None = None
    source_name: str | None = Field(default=None, max_length=120)
    published_on: date

    @model_validator(mode="after")
    def game_news_have_a_source(self):
        # News about the game always say where they come from.
        if self.section == "yugioh" and not (self.url and self.source_name):
            raise ValueError("Una noticia de Yu-Gi-Oh! necesita su fuente: enlace y nombre")
        return self


def view(row: NewsItem) -> dict:
    return {
        "id": str(row.id),
        "section": row.section,
        "language": row.language,
        "title": row.title,
        "summary": row.summary,
        "url": row.url,
        "source_name": row.source_name,
        "published_on": row.published_on.isoformat(),
    }


def add(session, data: NewsInput) -> NewsItem:
    row = NewsItem(key=f"admin-{secrets.token_hex(8)}")
    for field, value in data.model_dump().items():
        setattr(row, field, str(value) if field == "url" and value else value)
    session.add(row)
    session.flush()
    return row


def latest(session, section: str, limit: int, language: str = "es") -> list[NewsItem]:
    """The newest in the visitor's language; if there are not enough, the rest
    come in the other languages, in the site's order (Spanish, Portuguese, English)."""
    order = [language, *(code for code in LANGUAGES if code != language)]
    found = []
    for code in order:
        found += session.scalars(
            select(NewsItem)
            .where(NewsItem.section == section, NewsItem.language == code)
            .order_by(NewsItem.published_on.desc(), NewsItem.created_at.desc())
            .limit(limit - len(found))
        ).all()
        if len(found) == limit:
            break
    return found
