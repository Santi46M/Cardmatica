"""Short news for the home page: about Cardmática itself, and about Yu-Gi-Oh!.

News about the game always carry the page they come from and are in the
language that page is written in (es, pt or en): they are never translated
here. Most arrive from their sources (app/services/news_feeds.py); an
administrator can add more from the panel.
"""

from datetime import date

from sqlalchemy import CheckConstraint, Date, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Entity

__all__ = ["NewsItem", "NEWS_SECTIONS"]

NEWS_SECTIONS = ("site", "yugioh")


class NewsItem(Entity, Base):
    __tablename__ = "news_items"
    __table_args__ = (
        UniqueConstraint("key"),
        CheckConstraint("section IN ('site', 'yugioh')", name="valid_section"),
        CheckConstraint("language IN ('es', 'pt', 'en')", name="valid_language"),
    )
    key: Mapped[str] = mapped_column(String(80))
    section: Mapped[str] = mapped_column(String(10), index=True)
    language: Mapped[str] = mapped_column(String(2), default="es", server_default="es")
    title: Mapped[str] = mapped_column(String(140))
    summary: Mapped[str] = mapped_column(String(400))
    url: Mapped[str | None] = mapped_column(String(500))
    source_name: Mapped[str | None] = mapped_column(String(120))
    published_on: Mapped[date] = mapped_column(Date, index=True)
