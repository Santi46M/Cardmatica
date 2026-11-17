"""Where the card pictures are kept: files in the image folder, or rows of
stored_images when the host has no disk that lasts (IMAGE_STORAGE=database).

Either way a picture is known by its name ("<sha256>.webp"), the one saved in
local_path and thumbnail_path.
"""

import mimetypes

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import StoredImage


def media_type(name: str) -> str:
    return mimetypes.guess_type(name)[0] or "application/octet-stream"


def _path(settings, name: str):
    """The file in the image folder, or None for a name that would leave it."""
    root = settings.image_directory.resolve()
    path = (root / name).resolve()
    return path if path.is_relative_to(root) else None


def exists(session: Session, settings, name: str | None) -> bool:
    if not name:
        return False
    if settings.image_storage == "database":
        return session.scalar(select(StoredImage.name).where(StoredImage.name == name)) is not None
    path = _path(settings, name)
    return bool(path and path.is_file())


def save(session: Session, settings, name: str, content: bytes):
    if settings.image_storage == "database":
        session.merge(StoredImage(name=name, media_type=media_type(name), content=content))
        return
    path = _path(settings, name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def read(session: Session, settings, name: str | None) -> bytes | None:
    if not name:
        return None
    if settings.image_storage == "database":
        return session.scalar(select(StoredImage.content).where(StoredImage.name == name))
    path = _path(settings, name)
    return path.read_bytes() if path and path.is_file() else None


def delete(session: Session, settings, name: str | None):
    if not name:
        return
    if settings.image_storage == "database":
        stored = session.get(StoredImage, name)
        if stored:
            session.delete(stored)
        return
    path = _path(settings, name)
    if path and path.is_file():
        path.unlink()
