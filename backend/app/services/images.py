import hashlib
import io

from PIL import Image
from sqlalchemy import func, select

from app.db.base import utcnow
from app.integrations.http import AccessDenied
from app.models import Card, CardArtwork, CardImage, CardPrinting

# Which image of a printing is shown first: our own, then Yugipedia, then a seller's.
SOURCE_PRIORITY = {"staff": 0, "yugipedia": 1, "seller": 2}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
# A seller can have this many photos waiting for review at once.
MAX_PENDING_PER_ACCOUNT = 20


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
        if image.source_slug != "yugipedia":
            raise AccessDenied("Las fotos subidas ya están guardadas en el servidor")
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
    """Shown only with rights evidence and, for an upload, a moderator's approval."""
    return (
        image.rights_status == "approved"
        and bool(image.authorization_reference)
        and image.review_status == "approved"
    )


def ranked_images(images):
    """The images of one printing in display order: staff, Yugipedia, seller; oldest first."""
    return sorted(
        images,
        key=lambda image: (
            SOURCE_PRIORITY.get(image.source_slug, len(SOURCE_PRIORITY)),
            image.created_at.isoformat() if image.created_at else "",
            str(image.id),
        ),
    )


class UploadService:
    """Photos of a printing sent by a seller or by staff, for the catalogue.

    They show the printing itself (set, rarity, edition): the photo of the copy a
    seller has for sale, to prove its condition, belongs to that listing instead.
    """

    def __init__(self, settings, session):
        self.settings = settings
        self.session = session

    def upload(self, printing_id, content: bytes, *, uploader=None, source="seller", filename=""):
        if source not in {"seller", "staff"}:
            raise ValueError("Solo se aceptan fotos de vendedores o del equipo")
        if not content or len(content) > MAX_UPLOAD_BYTES:
            raise ValueError("La imagen debe pesar menos de 8 MB")
        if not self.session.get(CardPrinting, printing_id):
            raise LookupError("Impresión inexistente")
        if uploader is not None and source == "seller":
            waiting = self.session.scalar(
                select(func.count())
                .select_from(CardImage)
                .where(
                    CardImage.uploaded_by_id == uploader.id, CardImage.review_status == "pending"
                )
            )
            if waiting >= MAX_PENDING_PER_ACCOUNT:
                raise ValueError(
                    "Tienes demasiadas fotos esperando revisión; espera a que se revisen"
                )
        reference = "upload:" + hashlib.sha256(content).hexdigest()
        existing = self.session.scalar(
            select(CardImage).where(
                CardImage.printing_id == printing_id, CardImage.source_url == reference
            )
        )
        if existing:
            return existing, False
        image = CardImage(
            printing_id=printing_id,
            source_url=reference,
            file_title=(filename or reference)[:300],
            source_slug=source,
            # Never served until a moderator approves it with rights evidence.
            review_status="pending",
            rights_status="unverified",
            uploaded_by_id=uploader.id if uploader is not None else None,
        )
        try:
            # Decoded and re-encoded as PNG: the bytes that were sent are never served.
            ImageService(self.settings, None)._save(image, content)
        except (OSError, ValueError, Image.DecompressionBombError) as error:
            raise ValueError("El archivo no es una imagen PNG, JPEG o WebP válida") from error
        self.session.add(image)
        self.session.flush()
        return image, True

    def review(self, image_id, decision, *, reviewer, authorization_reference=None, note=None):
        image = self.session.get(CardImage, image_id)
        if not image or image.source_slug == "yugipedia":
            raise LookupError("Foto subida inexistente")
        if decision not in {"approved", "rejected"}:
            raise ValueError("La decisión debe ser approved o rejected")
        reference = (authorization_reference or "").strip()
        if decision == "approved" and not reference:
            raise ValueError("Para aprobar, indica qué permiso cubre esta foto")
        image.review_status = decision
        image.reviewed_by = (reviewer or "").strip()[:254] or None
        image.review_note = (note or "").strip() or None
        image.reviewed_at = utcnow()
        image.rights_status = "approved" if decision == "approved" else "denied"
        image.authorization_reference = reference if decision == "approved" else None
        return image


def pending_uploads(session, offset=0, limit=50):
    return session.scalars(
        select(CardImage)
        .where(CardImage.review_status == "pending")
        .order_by(CardImage.created_at, CardImage.id)
        .offset(offset)
        .limit(limit)
    ).all()


def eligible_images(session, identifier=None):
    query = (
        select(CardImage)
        .join(CardPrinting)
        .join(Card)
        .where(
            CardImage.source_slug == "yugipedia",
            CardImage.rights_status == "approved",
            CardImage.authorization_reference.is_not(None),
        )
    )
    if identifier:
        query = query.where(Card.konami_id == int(identifier))
    return query.order_by(CardImage.id)
