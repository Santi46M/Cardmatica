"""Anonymous usage counts: how many times each page was seen, per day.

No cookies, no IP addresses, nothing that identifies a person: only a page or
event name, a day and a number.
"""

from datetime import date

from sqlalchemy import Date, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Entity

__all__ = ["UsageCount"]


class UsageCount(Entity, Base):
    __tablename__ = "usage_counts"
    __table_args__ = (UniqueConstraint("day", "key"),)
    day: Mapped[date] = mapped_column(Date, index=True)
    # "tab:Todas", "carta", "cuenta:registro"... (frontend/js/analytics.js)
    key: Mapped[str] = mapped_column(String(80))
    count: Mapped[int] = mapped_column(Integer, default=0)
