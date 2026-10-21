import hashlib
import io

from PIL import Image
from sqlalchemy import select

from app.integrations.http import AccessDenied
from app.models import Card, CardImage, CardPrinting


class ImageService:
    def __init__(self, settings, client):
        self.settings = settings
        self.client = client

    async def download(self, image: CardImage):
        if image.rights_status != "approved" or not image.authorization_reference:
            raise AccessDenied("No hay evidencia de permiso comercial para esta imagen")
        root = self.settings.image_directory.resolve()
        if (
            image.local_path
            and image.thumbnail_path
            and all(
                (root / name).resolve().is_relative_to(root) and (root / name).is_file()
                for name in (image.local_path, image.thumbnail_path)
            )
        ):
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
        with Image.open(io.BytesIO(response.content)) as raster:
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
