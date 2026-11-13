"""Image files kept in the database instead of a folder (IMAGE_STORAGE=database).

For hosts with no disk that survives, like the test site on Vercel: each file
keeps the name it would have in the image folder (app/services/image_store.py).
"""

from datetime import datetime

from sqlalchemy import DateTime, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, utcnow

__all__ = ["StoredImage"]


class StoredImage(Base):
    __tablename__ = "stored_images"
    # "<sha256>.webp", "<sha256>-thumb.webp": the name in local_path / thumbnail_path.
    name: Mapped[str] = mapped_column(String(300), primary_key=True)
    media_type: Mapped[str] = mapped_column(String(40))
    content: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
