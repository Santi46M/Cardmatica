"""Synthetic responses only. Live-source evidence is recorded separately."""

import io
from datetime import date, timedelta

import httpx
import pytest
from PIL import Image
from pydantic import ValidationError
from sqlalchemy import func, select

from app.core.config import Settings
from app.integrations.http import AccessDenied, PoliteHttpClient
from app.integrations.ygoprodeck.client import YgoprodeckClient
from app.integrations.ygoprodeck.parser import parse_card
from app.models import (
    Archetype,
    Card,
    CardArchetype,
    CardArtwork,
    CardErratum,
    CardPrinting,
    CardTextVersion,
    DataConflict,
    SyncJob,
)
from app.schemas.catalog import JobRequest
from app.schemas.ingestion import GroupInput
from app.services.images import ImageService
from app.services.ingestion import IngestionService
from app.services.reconciliation import IdentityConflict


@pytest.fixture
def payload():
    return {
        "id": 12345678,
        "name": "Synthetic Primary Dragon",
        "type": "Xyz Pendulum Effect Monster",
        "race": "Dragon",
        "attribute": "LIGHT",
        "atk": 2500,
        "def": 2000,
        "level": 7,
        "scale": 4,
        "desc": "Synthetic primary text",
        "archetype": "Synthetic Archetype",
        "misc_info": [{"konami_id": 990001, "formats": ["tcg", "ocg", "master duel"]}],
        "card_sets": [
            {
                "set_name": "Synthetic Set",
                "set_code": "TST-EN001",
                "set_rarity": "Ultra Rare",
                "set_price": "9.99",
            },
            {"set_name": "Synthetic Set", "set_code": "TST-EN001", "set_rarity": "Super Rare"},
        ],
        "card_images": [
            {"id": 12345678, "image_url": "https://images.ygoprodeck.com/images/cards/12345678.jpg"}
        ],
        "card_prices": [{"ebay_price": "99.99"}],
    }


def test_parser_preserves_identity_and_printing_dimensions(payload):
    record = parse_card(payload, sets=[{"set_name": "Synthetic Set", "tcg_date": "2026-01-01"}])
    assert record.ygoprodeck_id == 12345678 and record.konami_id == 990001
    assert record.rank == 7 and record.level is None and record.pendulum_scale == 4
    assert record.available_markets == ["OCG", "TCG"]
    assert len(record.printings) == 2 and len(record.artworks) == 1
    assert all(
        not printing.images and printing.edition == "unknown" for printing in record.printings
    )
    assert record.printings[0].set_release_date == date(2026, 1, 1)
    assert (
        str(record.printings[0].set_source_url) == "https://db.ygoprodeck.com/api/v7/cardsets.php"
    )
    assert record.printings[0].release_date is None
    assert "price" not in record.model_dump_json(warnings="error")


def test_localized_name_does_not_relabel_english_printings(payload):
    record = parse_card(payload, language="fr")
    assert record.names[0].language == "fr"
    assert all(printing.language == "en" for printing in record.printings)
    payload["card_sets"][0]["set_code"] = "AMBIGUOUS"
    assert len(parse_card(payload).printings) == 1


def test_printing_language_allows_alphabetic_card_numbers(payload):
    for code in ("TST-ENA01", "TST-ENSV4", "TST-ENG55"):
        payload["card_sets"][0]["set_code"] = code
        record = parse_card(payload)
        assert record.printings[0].code == code and record.printings[0].language == "en"


def test_provider_identity_without_cid_is_idempotent(session, payload):
    payload.pop("misc_info")
    record = parse_card(payload)
    service = IngestionService(session)
    card = service.ingest(record)
    service.ingest(record)
    session.flush()
    assert card.konami_id is None and card.ygoprodeck_id == 12345678
    assert session.scalar(select(func.count()).select_from(Card)) == 1
    assert session.scalar(select(func.count()).select_from(CardPrinting)) == 2
    assert session.scalar(select(func.count()).select_from(CardArtwork)) == 1


def test_source_precedence_keeps_primary_current_text(session, payload, wiki_record):
    record = parse_card(payload)
    card = IngestionService(session).ingest(record)
    wiki_record.atk = "9999"
    wiki_record.texts[0].text = "Synthetic community explanation"
    IngestionService(session).ingest(wiki_record)
    assert card.atk == "2500"
    texts = session.scalars(
        select(CardTextVersion).where(CardTextVersion.is_current.is_(True))
    ).all()
    assert len(texts) == 1 and texts[0].source_slug == "ygoprodeck"
    assert not texts[0].is_official


def test_archived_official_information_retains_priority(session, payload, record):
    IngestionService(session).ingest(record)
    card = IngestionService(session).ingest(parse_card(payload))
    assert card.atk == record.atk
    current = session.scalars(
        select(CardTextVersion).where(CardTextVersion.is_current.is_(True))
    ).all()
    assert len(current) == 1 and current[0].is_official


def test_provider_updates_version_text_without_inventing_errata(session, payload):
    first = parse_card(payload)
    service = IngestionService(session)
    service.ingest(first)
    payload["desc"] = "Synthetic updated primary text"
    second = parse_card(payload)
    second.fetched_at = first.fetched_at + timedelta(hours=1)
    service.ingest(second)
    rows = session.scalars(select(CardTextVersion)).all()
    assert len(rows) == 2 and sum(row.is_current for row in rows) == 1
    assert session.scalar(select(func.count()).select_from(CardErratum)) == 0


def test_unchanged_refresh_rejects_later_arriving_stale_content(session, payload):
    first = parse_card(payload)
    service = IngestionService(session)
    card = service.ingest(first)
    unchanged = first.model_copy(
        update={"fetched_at": first.fetched_at + timedelta(hours=2)}, deep=True
    )
    service.ingest(unchanged)
    stale = first.model_copy(
        update={"fetched_at": first.fetched_at + timedelta(hours=1), "atk": "999"}, deep=True
    )
    service.ingest(stale)
    assert card.atk == "2500"


def test_provider_replaces_own_archetype_and_resolves_old_limitations(
    session, payload, wiki_record
):
    first = parse_card(payload)
    first.limitations.append("Synthetic resolved limitation")
    service = IngestionService(session)
    card = service.ingest(first)
    wiki_record.groups = [GroupInput(kind="archetype", name="Synthetic Wiki Group")]
    service.ingest(wiki_record)
    payload["archetype"] = "Synthetic Updated Group"
    updated = parse_card(payload)
    updated.fetched_at = wiki_record.fetched_at + timedelta(days=400)
    service.ingest(updated)
    groups = set(
        session.scalars(
            select(Archetype.name).join(CardArchetype).where(CardArchetype.card_id == card.id)
        )
    )
    assert groups == {"Synthetic Updated Group", "Synthetic Wiki Group"}
    issue = next(
        row
        for row in session.scalars(select(DataConflict))
        if row.details.get("message") == "Synthetic resolved limitation"
    )
    assert issue.status == "resolved"


def test_identity_conflict_does_not_merge_other_cid(session, payload):
    service = IngestionService(session)
    service.ingest(parse_card(payload))
    payload["misc_info"][0]["konami_id"] = 990009
    with pytest.raises(IdentityConflict):
        service.ingest(parse_card(payload))


def test_market_availability_does_not_invent_ocg_printings(factory, client, payload):
    with factory.begin() as session:
        card_id = IngestionService(session).ingest(parse_card(payload)).id
    result = client.get("/api/v1/cards", params={"market": "OCG"}).json()
    assert result["total"] == 1 and result["items"][0]["printing_count"] == 0
    assert (
        client.get(f"/api/v1/cards/{card_id}/printings", params={"market": "OCG"}).json()["total"]
        == 0
    )
    assert (
        client.get("/api/v1/cards", params={"q": "TST-EN001", "market": "TCG"}).json()["total"] == 1
    )


def test_artwork_preview_is_explicit_and_cannot_be_served_in_production(
    factory, client, settings, payload, monkeypatch
):
    with factory.begin() as session:
        card = IngestionService(session).ingest(parse_card(payload))
        card_id = card.id
        image = session.scalar(select(CardArtwork))
        image.local_path = "synthetic.png"
        image_id = image.id
    settings.image_directory.mkdir()
    (settings.image_directory / "synthetic.png").write_bytes(b"synthetic image bytes")
    monkeypatch.setattr(settings, "allow_local_image_preview", True)
    monkeypatch.setattr(settings, "deployment_mode", "production")
    assert client.get(f"/api/v1/artworks/{image_id}").status_code == 404
    monkeypatch.setattr(settings, "deployment_mode", "local")
    result = client.get(f"/api/v1/artworks/{image_id}")
    assert result.status_code == 200 and result.headers["X-Image-Usage"] == "local-preview-only"
    assert (
        client.get(f"/api/v1/artworks/{image_id}", headers={"Host": "public.example"}).status_code
        == 404
    )
    codespace = {"Host": "localhost:8000", "X-Forwarded-Host": "demo-8000.app.github.dev"}
    # A private development domain is only accepted once it is configured explicitly.
    assert client.get(f"/api/v1/artworks/{image_id}", headers=codespace).status_code == 404
    monkeypatch.setattr(settings, "local_preview_host_suffixes", [".app.github.dev"])
    assert client.get(f"/api/v1/artworks/{image_id}", headers=codespace).status_code == 200
    spoofed = {"Host": "localhost", "X-Forwarded-Host": "evil.example"}
    assert client.get(f"/api/v1/artworks/{image_id}", headers=spoofed).status_code == 404
    monkeypatch.setattr(settings, "deployment_mode", "production")
    assert client.get(f"/api/v1/artworks/{image_id}", headers=codespace).status_code == 404
    monkeypatch.setattr(settings, "deployment_mode", "local")
    detail = client.get(f"/api/v1/cards/{card_id}").json()
    assert detail["image"]["association"] == "card_artwork"
    assert not detail["name_is_official"] and detail["name_source"] == "ygoprodeck"
    assert detail["artworks"][0]["rights_status"] == "unverified"
    assert all(
        not row["images"]
        for row in client.get(f"/api/v1/cards/{card_id}/printings").json()["items"]
    )


async def test_artwork_download_is_cached_and_never_grants_rights(
    session, payload, settings, monkeypatch
):
    IngestionService(session).ingest(parse_card(payload))
    image = session.scalar(select(CardArtwork))
    raster = io.BytesIO()
    Image.new("RGB", (400, 600), "blue").save(raster, "PNG")
    calls = []

    class Source:
        http = None

        async def get(self, *args, **kwargs):
            calls.append(args[0])
            return httpx.Response(200, content=raster.getvalue())

    source = Source()
    source.http = source
    service = ImageService(settings, source)
    monkeypatch.setattr(settings, "deployment_mode", "production")
    with pytest.raises(AccessDenied):
        await service.download_artwork(image)
    monkeypatch.setattr(settings, "deployment_mode", "local")
    monkeypatch.setattr(settings, "allow_local_image_preview", True)
    assert await service.download_artwork(image)
    assert not await service.download_artwork(image)
    assert len(calls) == 1 and image.rights_status == "unverified"
    with Image.open(settings.image_directory / image.thumbnail_path) as thumbnail:
        assert thumbnail.width <= 120 and thumbnail.height <= 180


async def test_pagination_reuses_records_and_robots_cache(tmp_path, payload, monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        if request.url.path.endswith("cardsets.php"):
            return httpx.Response(200, json=[])
        offset = int(request.url.params.get("offset", "0"))
        return httpx.Response(
            200,
            json={
                "data": [payload],
                "meta": {"rows_remaining": 1 if offset == 0 else 0, "next_page_offset": offset + 1},
            },
        )

    settings = Settings(_env_file=None, cache_directory=tmp_path / "cache")
    http = PoliteHttpClient("ygoprodeck", settings, transport=httpx.MockTransport(handler))

    async def no_wait(*args):
        pass

    monkeypatch.setattr(http.store, "wait", no_wait)
    try:
        client = YgoprodeckClient(http)
        ids, cursor, done = await client.batch({})
        assert not done and cursor == {"api_offset": 1}
        assert (await client.card(ids[0])).ygoprodeck_id == payload["id"]
        assert (await client.batch(cursor))[2]
        assert len([call for call in calls if call.url.path == "/robots.txt"]) == 1
        assert len([call for call in calls if "id" in call.url.params]) == 0
    finally:
        await http.close()


def test_source_capabilities_are_validated():
    for options in ({"language": "es"}, {"mode": "banlist"}, {"mode": "errata"}):
        with pytest.raises(ValidationError):
            JobRequest.model_validate(
                {"source": "ygoprodeck", "mode": "card", "identifier": "12345678", **options}
            )
    with pytest.raises(ValidationError):
        Settings(_env_file=None, ygoprodeck_request_interval=0.01)


def test_preview_images_downloads_only_missing_artwork(factory, settings, payload, monkeypatch):
    from app.cli import preview_images

    with factory.begin() as session:
        IngestionService(session).ingest(parse_card(payload))
    calls = []

    class Runner:
        def __init__(self):
            self.factory = factory

        def enqueue(self, request):
            calls.append(request)
            with factory.begin() as session:
                job = SyncJob(source=request.source, mode=request.mode, status="completed")
                session.add(job)
                session.flush()
                return job.id

        def run(self, job_id):
            async def done():
                return None

            return done()

    with pytest.raises(ValueError):
        preview_images(10, Runner())
    monkeypatch.setattr(settings, "deployment_mode", "local")
    monkeypatch.setattr(settings, "allow_local_image_preview", True)
    assert preview_images(10, Runner()) == 0
    assert [(call.mode, call.identifier) for call in calls] == [("images", "12345678")]
    with factory.begin() as session:
        session.scalar(select(CardArtwork)).local_path = "synthetic.png"
    calls.clear()
    assert preview_images(10, Runner()) == 0 and calls == []


def test_card_texts_brings_only_the_missing_language(factory, settings, payload, monkeypatch):
    from app.cli import card_texts
    from app.services.catalog import card_summary

    with factory.begin() as session:
        IngestionService(session).ingest(parse_card(payload))
    calls = []

    class Runner:
        def __init__(self):
            self.factory = factory

        def enqueue(self, request):
            calls.append(request)
            with factory.begin() as session:
                job = SyncJob(source=request.source, mode=request.mode, status="completed")
                session.add(job)
                session.flush()
                return job.id

        def run(self, job_id):
            async def done():
                return None

            return done()

    # Portuguese comes from YGOPRODeck, card by card, for cards without it.
    assert card_texts("pt", 10, Runner()) == 0
    assert [(call.source, call.mode, call.language) for call in calls] == [
        ("ygoprodeck", "card", "pt")
    ]
    with factory.begin() as session:
        IngestionService(session).ingest(parse_card(payload, "pt"))
    calls.clear()
    assert card_texts("pt", 10, Runner()) == 0 and calls == []
    # Spanish only Yugipedia has: it must be enabled first.
    monkeypatch.setattr(settings, "yugipedia_enabled", False)
    with pytest.raises(ValueError, match="YUGIPEDIA_ENABLED"):
        card_texts("es", 10, Runner())
    monkeypatch.setattr(settings, "yugipedia_enabled", True)
    assert card_texts("es", 10, Runner()) == 0
    assert calls[0].source == "yugipedia" and calls[0].identifier == payload["name"]
    # A visitor whose language the card lacks reads its English name.
    with factory() as session:
        card = session.scalar(select(Card))
        assert card_summary(card, "de").name == payload["name"]
