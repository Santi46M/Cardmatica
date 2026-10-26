import io

import httpx
import pytest
from PIL import Image
from sqlalchemy import select

from app.integrations.http import AccessDenied
from app.models import CardImage
from app.schemas.ingestion import ImageInput
from app.services.images import ImageService
from app.services.ingestion import IngestionService


class ImageSource:
    def __init__(self):
        self.http = self
        self.calls = 0
        self.url = "https://ms.yugipedia.com/test.png"

    async def image_info(self, title):
        return {"url": self.url, "thumburl": self.url}

    async def get(self, url):
        self.calls += 1
        output = io.BytesIO()
        Image.new("RGB", (400, 600), "blue").save(output, "PNG")
        return httpx.Response(200, content=output.getvalue())


async def test_authorized_download_generates_thumbnail_and_avoids_redundant_requests(
    session, settings, wiki_record
):
    wiki_record.printings[0].images = [
        ImageInput(
            file_title="File:Test.png",
            source_url="https://ms.yugipedia.com/test.png",
            rights_status="approved",
            authorization_reference="Synthetic test permission",
        )
    ]
    IngestionService(session).ingest(wiki_record)
    image = session.scalar(select(CardImage))
    source = ImageSource()
    service = ImageService(settings, source)
    assert await service.download(image)
    assert source.calls == 1
    with Image.open(settings.image_directory / image.thumbnail_path) as thumbnail:
        assert thumbnail.width <= 120 and thumbnail.height <= 180
    assert not await service.download(image)
    assert source.calls == 1


async def test_unverified_image_never_downloads(session, settings, wiki_record):
    wiki_record.printings[0].images = [
        ImageInput(file_title="File:Test.png", source_url="https://ms.yugipedia.com/test.png")
    ]
    IngestionService(session).ingest(wiki_record)
    source = ImageSource()
    with pytest.raises(AccessDenied):
        await ImageService(settings, source).download(session.scalar(select(CardImage)))
    assert source.calls == 0


async def test_changed_origin_revokes_approval(session, settings, wiki_record):
    wiki_record.printings[0].images = [
        ImageInput(
            file_title="File:Test.png",
            source_url="https://ms.yugipedia.com/test.png",
            rights_status="approved",
            authorization_reference="Synthetic test permission",
        )
    ]
    IngestionService(session).ingest(wiki_record)
    image = session.scalar(select(CardImage))
    source = ImageSource()
    source.url = "https://ms.yugipedia.com/changed.png"
    assert not await ImageService(settings, source).download(image)
    assert image.rights_status == "unverified"
    assert source.calls == 0
