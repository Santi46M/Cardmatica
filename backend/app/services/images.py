import hashlib
import io

from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import object_session

from app.integrations.http import AccessDenied
from app.models import Card, CardArtwork, CardImage, CardPrinting
from app.services import image_store


class ImageService:
    def __init__(self, settings, client):
        self.settings = settings
        self.client = client

    async def download_artwork(self, image: CardArtwork):
        commercial = image.rights_status == "approved" and bool(image.authorization_reference)
        if image.rights_status == "denied" or not (commercial or self.settings.local_image_preview):
            raise AccessDenied("Ilustración sin permiso comercial; vista local no habilitada")
        if self._stored(image):
            return False
        response = await self.client.http.get(image.source_url, ttl=365 * 86400)
        self._save(image, response.content)
        # Technical API access is not evidence of a commercial image licence.
        return True

    def _stored(self, image) -> bool:
        """Whether both files of the image are already kept (app/services/image_store.py)."""
        session = object_session(image)
        return all(
            image_store.exists(session, self.settings, name)
            for name in (image.local_path, image.thumbnail_path)
        )

    def _save(self, image, content):
        checksum = hashlib.sha256(content).hexdigest()
        with Image.open(io.BytesIO(content)) as raster:
            if (
                raster.format not in {"PNG", "JPEG", "WEBP"}
                or raster.width * raster.height > 40_000_000
            ):
                raise ValueError("Formato o tamaño de imagen no permitido")
            raster.load()
            raster = raster.convert("RGB")
        # WebP: a fraction of a PNG's weight, so the catalogue loads faster.
        files = {}
        for suffix, size in (("", (480, 700)), ("-thumb", (120, 180))):
            raster.thumbnail(size)
            output = io.BytesIO()
            raster.save(output, "WEBP", quality=82)
            files[f"{checksum}{suffix}.webp"] = output.getvalue()
        session = object_session(image)
        for name, data in files.items():
            image_store.save(session, self.settings, name, data)
        image.local_path, image.thumbnail_path = files
        image.sha256 = checksum

    async def download(self, image: CardImage):
        if image.rights_status != "approved" or not image.authorization_reference:
            raise AccessDenied("No hay evidencia de permiso comercial para esta imagen")
        if self._stored(image):
            return False
        metadata = await self.client.image_info(image.file_title)
        if not metadata or metadata.get("url") != image.source_url:
            image.rights_status = "unverified"
            return False
        url = metadata.get("thumburl") or metadata["url"]
        response = await self.client.http.get(url)
        checksum = hashlib.sha256(response.content).hexdigest()
        if image.sha256 and image.sha256 != checksum:
            image.rights_status = "unverified"
            return False
        # Decode and re-encode raster data. SVG/HTML is never served as active content.
        self._save(image, response.content)
        return True


def displayable(image: CardImage) -> bool:
    """A printing scan is shown only with evidence of a permission that covers it."""
    return image.rights_status == "approved" and bool(image.authorization_reference)


def eligible_images(session, identifier=None):
    query = (
        select(CardImage)
        .join(CardPrinting)
        .join(Card)
        .where(
            CardImage.rights_status == "approved", CardImage.authorization_reference.is_not(None)
        )
    )
    if identifier:
        query = query.where(Card.konami_id == int(identifier))
    return query.order_by(CardImage.id)
