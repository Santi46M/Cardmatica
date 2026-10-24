"""News for the home page (app/models/news.py)."""

import json
import secrets
from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, model_validator
from sqlalchemy import select

from app.models import NewsItem

BUNDLED = Path(__file__).resolve().parents[1] / "data" / "news.json"


class NewsInput(BaseModel):
    section: Literal["site", "yugioh"]
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


class BundledNews(NewsInput):
    key: str = Field(min_length=3, max_length=80)


def view(row: NewsItem) -> dict:
    return {
        "id": str(row.id),
        "section": row.section,
        "title": row.title,
        "summary": row.summary,
        "url": row.url,
        "source_name": row.source_name,
        "published_on": row.published_on.isoformat(),
    }


def import_bundled(session, path=BUNDLED) -> int:
    """Add or update the bundled news by key. Running it again changes nothing.

    Within a day the file's order is the page's: the first entry is stored last,
    so it is the newest.
    """
    entries = [BundledNews.model_validate(entry) for entry in json.loads(path.read_text("utf-8"))]
    stored = {row.key: row for row in session.scalars(select(NewsItem))}
    for entry in reversed(entries):
        row = stored.get(entry.key) or NewsItem(key=entry.key)
        for field, value in entry.model_dump(exclude={"key"}).items():
            setattr(row, field, str(value) if field == "url" and value else value)
        session.add(row)
    return len(entries)


def add(session, data: NewsInput) -> NewsItem:
    row = NewsItem(key=f"admin-{secrets.token_hex(8)}")
    for field, value in data.model_dump().items():
        setattr(row, field, str(value) if field == "url" and value else value)
    session.add(row)
    session.flush()
    return row


def latest(session, section: str, limit: int) -> list[NewsItem]:
    return session.scalars(
        select(NewsItem)
        .where(NewsItem.section == section)
        .order_by(NewsItem.published_on.desc(), NewsItem.created_at.desc())
        .limit(limit)
    ).all()
