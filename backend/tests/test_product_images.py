import io
import json

import httpx
import pytest
from PIL import Image

from app.integrations.http import AccessDenied
from app.services import product_images
from app.services.product_images import allowed_picture_host, download_all, picture_url

PAGE = "https://www.example-brand.com/products/sleeves"


@pytest.fixture
def preview(settings, monkeypatch):
    monkeypatch.setattr(settings, "deployment_mode", "local")
    monkeypatch.setattr(settings, "allow_local_image_preview", True)
    monkeypatch.setattr(settings, "user_agent", "CardmaticaTest/1.0 (tests@example.com)")
    monkeypatch.setattr(settings, "product_request_interval", 1.0)
    return settings


@pytest.fixture
def pages(tmp_path):
    path = tmp_path / "pages.json"
    path.write_text(
        json.dumps({"image_hosts": ["cdn.shopify.com"], "pages": {"sleeves": PAGE}}),
        encoding="utf-8",
    )
    return path


def png():
    out = io.BytesIO()
    Image.new("RGB", (900, 600), "green").save(out, "PNG")
    return out.getvalue()


def test_the_main_picture_comes_from_the_sharing_tags_or_the_infobox():
    assert (
        picture_url('<meta property="og:image" content="/cdn/a.jpg">', PAGE)
        == "https://www.example-brand.com/cdn/a.jpg"
    )
    assert picture_url('<meta name="twitter:image" content="https://x.com/b.png">', PAGE).endswith(
        "b.png"
    )
    wiki = '<table class="infobox"><tr><td><img src="//ms.yugipedia.com/c.png"></td></tr></table>'
    assert picture_url(wiki, "https://yugipedia.com/wiki/Set") == "https://ms.yugipedia.com/c.png"
    assert picture_url("<p>nothing</p>", PAGE) is None


def test_pictures_only_come_from_the_product_site_or_a_listed_cdn():
    cdn = {"cdn.shopify.com"}
    assert allowed_picture_host("https://images.example-brand.com/a.jpg", PAGE, cdn)
    assert allowed_picture_host("https://cdn.shopify.com/a.jpg", PAGE, cdn)
    assert not allowed_picture_host("https://tracker.example/a.jpg", PAGE, cdn)
    assert not allowed_picture_host("http://www.example-brand.com/a.jpg", PAGE, cdn)
    assert not allowed_picture_host("https://10.0.0.1/a.jpg", PAGE, cdn)


async def test_photos_are_saved_small_and_only_for_the_local_preview(preview, pages, settings):
    requests = []

    def answer(request):
        requests.append(str(request.url))
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        if str(request.url) == PAGE:
            html = '<meta property="og:image" content="https://cdn.shopify.com/s/sleeves.png">'
            return httpx.Response(200, html=html)
        return httpx.Response(200, content=png(), headers={"content-type": "image/png"})

    transport = httpx.MockTransport(answer)
    result = await download_all(settings, transport=transport, pages_file=pages)
    assert result == {"saved": ["sleeves"], "kept": 0, "failed": {}}
    saved = product_images.stored_file(settings, "sleeves")
    with Image.open(saved) as photo:
        assert photo.format == "WEBP" and max(photo.size) <= product_images.MAX_SIDE
    entry = product_images.read_index(settings)["sleeves"]
    assert entry["page"] == PAGE and entry["picture"].startswith("https://cdn.shopify.com/")

    # Already saved: a second run asks nothing.
    count = len(requests)
    assert (await download_all(settings, transport=transport, pages_file=pages))["kept"] == 1
    assert len(requests) == count

    settings.allow_local_image_preview = False
    with pytest.raises(AccessDenied):
        await download_all(settings, transport=transport, pages_file=pages)


async def test_a_picture_from_another_site_is_refused(preview, pages, settings):
    def answer(request):
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(
            200, html='<meta property="og:image" content="https://evil.test/x.png">'
        )

    result = await download_all(settings, transport=httpx.MockTransport(answer), pages_file=pages)
    assert not result["saved"] and "sleeves" in result["failed"]


def test_the_api_serves_photos_only_on_a_private_preview(client, preview, monkeypatch):
    folder = product_images.folder(preview)
    folder.mkdir(parents=True)
    (folder / "nest-100.webp").write_bytes(product_images.shrink(png()))
    (folder / "index.json").write_text(json.dumps({"nest-100": {"file": "nest-100.webp"}}))

    listing = client.get("/api/v1/product-images")
    assert listing.json() == {"images": {"nest-100": "/api/v1/product-images/nest-100"}}
    assert "no-store" in listing.headers["cache-control"]
    photo = client.get("/api/v1/product-images/nest-100")
    assert photo.status_code == 200 and photo.headers["content-type"] == "image/webp"
    assert photo.headers["X-Image-Usage"] == "local-preview-only"
    assert client.get("/api/v1/product-images/..%2Findex").status_code == 404

    public = {"Host": "cardmatica.example"}
    assert client.get("/api/v1/product-images", headers=public).json() == {"images": {}}
    assert client.get("/api/v1/product-images/nest-100", headers=public).status_code == 404
    monkeypatch.setattr(preview, "deployment_mode", "production")
    assert client.get("/api/v1/product-images").json() == {"images": {}}
    assert client.get("/api/v1/product-images/nest-100").status_code == 404


def test_every_demo_product_names_a_listed_page():
    import re
    from pathlib import Path

    pages, _ = product_images.load_pages()
    data = (Path(__file__).resolve().parents[2] / "frontend/demo/data.js").read_text()
    keys = set(re.findall(r'image: "([a-z0-9-]+)"', data))
    assert keys and keys <= set(pages)
    assert set(pages) <= keys, "Páginas sin producto en la demo"
