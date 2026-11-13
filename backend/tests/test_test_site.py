"""The test site (TEST_SITE): says so, keeps search engines out, and can ask for a password."""

import base64

import pytest

from app.integrations.http import AccessDenied


def basic(password):
    return {"Authorization": "Basic " + base64.b64encode(f"x:{password}".encode()).decode()}


def test_an_ordinary_site_says_nothing(client):
    page = client.get("/")
    assert "test-site-note" not in page.text
    assert "x-robots-tag" not in page.headers
    assert "Disallow: /api/" in client.get("/robots.txt").text


def test_the_test_site_says_so_and_stays_out_of_search_engines(client, settings, monkeypatch):
    monkeypatch.setattr(settings, "test_site", True)
    page = client.get("/yugioh")
    assert 'class="test-site-note"' in page.text
    assert '<meta name="robots" content="noindex, nofollow">' in page.text
    assert page.headers["x-robots-tag"] == "noindex, nofollow"
    # In the visitor's language too, and on the API's answers.
    assert "Versão de teste" in client.get("/yugioh?lang=pt").text
    assert client.get("/api/v1/sets").headers["x-robots-tag"] == "noindex, nofollow"
    assert client.get("/robots.txt").text == "User-agent: *\nDisallow: /\n"


def test_with_a_password_only_who_has_it_gets_in(client, settings, monkeypatch):
    monkeypatch.setattr(settings, "test_site", True)
    monkeypatch.setattr(settings, "test_site_password", "una clave de prueba")
    refused = client.get("/")
    assert refused.status_code == 401
    assert refused.headers["www-authenticate"].startswith("Basic")
    assert client.get("/", headers=basic("otra")).status_code == 401
    assert client.get("/", headers=basic("una clave de prueba")).status_code == 200
    # The host's health check gets through without it.
    assert client.get("/health/live").status_code == 200


def test_with_a_user_name_both_must_match(client, settings, monkeypatch):
    monkeypatch.setattr(settings, "test_site", True)
    monkeypatch.setattr(settings, "test_site_user", "admin")
    monkeypatch.setattr(settings, "test_site_password", "una clave de prueba")
    assert client.get("/", headers=basic("una clave de prueba")).status_code == 401
    good = base64.b64encode(b"admin:una clave de prueba").decode()
    assert client.get("/", headers={"Authorization": f"Basic {good}"}).status_code == 200


def test_the_test_site_keeps_its_pictures_in_the_database(client, factory, settings, monkeypatch):
    """With no lasting disk (Vercel), pictures are rows, shown only behind the password."""
    import asyncio
    import io
    from types import SimpleNamespace

    from PIL import Image
    from sqlalchemy import select

    from app.models import Card, CardArtwork, StoredImage
    from app.services.images import ImageService

    monkeypatch.setattr(settings, "image_storage", "database")
    picture = io.BytesIO()
    Image.new("RGB", (600, 875), "teal").save(picture, "PNG")

    class Http:
        async def get(self, url, **options):
            return SimpleNamespace(content=picture.getvalue())

    with factory.begin() as session:
        card = Card(display_name="Carta sintética")
        artwork = CardArtwork(
            card=card,
            source_slug="ygoprodeck",
            external_id="synthetic",
            source_url="https://images.ygoprodeck.com/images/cards/0.jpg",
        )
        session.add(artwork)
        session.flush()
        artwork_id = artwork.id
        # Not without the preview: on a public site it stays out.
        with pytest.raises(AccessDenied):
            asyncio.run(
                ImageService(settings, SimpleNamespace(http=Http())).download_artwork(artwork)
            )
    monkeypatch.setattr(settings, "test_site", True)
    monkeypatch.setattr(settings, "test_site_password", "una clave de prueba")
    monkeypatch.setattr(settings, "allow_local_image_preview", True)
    with factory.begin() as session:
        artwork = session.get(CardArtwork, artwork_id)
        asyncio.run(ImageService(settings, SimpleNamespace(http=Http())).download_artwork(artwork))
        assert artwork.local_path.endswith(".webp")
        assert len(session.scalars(select(StoredImage.name)).all()) == 2
    assert not list(settings.image_directory.glob("*.webp"))
    shown = client.get(
        f"/api/v1/artworks/{artwork_id}?thumbnail=true", headers=basic("una clave de prueba")
    )
    assert shown.status_code == 200 and shown.headers["content-type"] == "image/webp"
    with Image.open(io.BytesIO(shown.content)) as thumbnail:
        assert thumbnail.width <= 120
    assert client.get(f"/api/v1/artworks/{artwork_id}").status_code == 401
