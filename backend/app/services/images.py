import hashlib
import io

from PIL import Image
from sqlalchemy import select

from app.integrations.http import AccessDenied
from app.models import Card, CardArtwork, CardImage, CardPrinting


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
        """Whether both files of the image are already inside the image folder."""
        root = self.settings.image_directory.resolve()
        names = (image.local_path, image.thumbnail_path)
        return all(names) and all(
            (root / name).resolve().is_relative_to(root) and (root / name).is_file()
            for name in names
        )

    def _save(self, image, content):
        root = self.settings.image_directory.resolve()
        checksum = hashlib.sha256(content).hexdigest()
        with Image.open(io.BytesIO(content)) as raster:
            if (
                raster.format not in {"PNG", "JPEG", "WEBP"}
                or raster.width * raster.height > 40_000_000
            ):
                raise ValueError("Formato o tamaño de imagen no permitido")
            raster.load()
            raster = raster.convert("RGB")
            root.mkdir(parents=True, exist_ok=True)
            image.local_path = f"{checksum}.png"
            image.thumbnail_path = f"{checksum}-thumb.png"
            raster.thumbnail((480, 700))
            raster.save(root / image.local_path, "PNG")
            raster.thumbnail((120, 180))
            raster.save(root / image.thumbnail_path, "PNG")
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
