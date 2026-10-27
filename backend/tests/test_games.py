"""Magic: The Gathering (Scryfall) and Pokémon (TCGdex) beside Yu-Gi-Oh!.

Synthetic objects shaped like each API's answers; no real card data.
"""

import copy

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from app.core.config import Settings
from app.integrations.http import PoliteHttpClient
from app.integrations.scryfall.client import ScryfallClient
from app.integrations.scryfall.parser import parse_card as parse_scryfall
from app.integrations.tcgdex.client import TcgdexClient
from app.integrations.tcgdex.parser import parse_card as parse_tcgdex
from app.models import Card, CardArtwork, CardPrinting, CardSet, SyncJob
from app.schemas.catalog import JobRequest
from app.services import rarities
from app.services.ingestion import IngestionService

ORACLE = "00000000-0000-4000-8000-000000000001"


@pytest.fixture
def magic():
    return {
        "object": "card",
        "id": "10000000-0000-4000-8000-000000000001",
        "oracle_id": ORACLE,
        "name": "Synthetic Spark Weaver",
        "lang": "en",
        "released_at": "2026-01-23",
        "layout": "normal",
        "mana_cost": "{1}{U}{R}",
        "cmc": 3.0,
        "type_line": "Legendary Creature — Elf Wizard",
        "oracle_text": "Synthetic rules text.",
        "power": "2",
        "toughness": "3",
        "colors": ["R", "U"],
        "keywords": ["Flying"],
        "legalities": {"standard": "legal", "modern": "legal", "alchemy": "legal"},
        "games": ["paper", "arena"],
        "finishes": ["nonfoil", "foil"],
        "set": "tst",
        "set_name": "Synthetic Expansion",
        "set_type": "expansion",
        "collector_number": "42",
        "rarity": "mythic",
        "digital": False,
        "image_uris": {
            "small": "https://cards.scryfall.io/small/front/1/0/synthetic.jpg",
            "normal": "https://cards.scryfall.io/normal/front/1/0/synthetic.jpg",
        },
    }


@pytest.fixture
def pokemon():
    return {
        "id": "tst01-001",
        "localId": "001",
        "name": "Synthetic Sproutling",
        "category": "Pokemon",
        "rarity": "Double rare",
        "hp": 60,
        "types": ["Grass"],
        "stage": "Basic",
        "suffix": "ex",
        "image": "https://assets.tcgdex.net/en/tst/tst01/001",
        "illustrator": "Synthetic Artist",
        "attacks": [{"cost": ["Grass"], "name": "Synthetic Vine", "damage": 10, "effect": "Draw."}],
        "weaknesses": [{"type": "Fire", "value": "×2"}],
        "retreat": 1,
        "regulationMark": "J",
        "legal": {"standard": True, "expanded": True},
        "variants": {"normal": True, "reverse": True, "holo": False, "firstEdition": False},
        "set": {"id": "tst01", "name": "Synthetic Bloom", "cardCount": {"official": 90}},
    }


SET_INFO = {
    "id": "tst01",
    "name": "Synthetic Bloom",
    "releaseDate": "2026-03-27",
    "serie": {"id": "tst", "name": "Synthetic Series"},
    "abbreviation": {"official": "SYB"},
    "cards": [{"id": "tst01-001", "localId": "001", "name": "Synthetic Sproutling"}],
}


# ---- Rarities ------------------------------------------------------------------


def test_each_game_reads_its_own_rarities():
    assert rarities.canonical("mythic", "magic") == "Mythic Rare"
    assert rarities.canonical("Special illustration rare", "pokemon") == "Special Illustration Rare"
    # The same abbreviation means another rarity in another game.
    assert rarities.canonical("SR") == "Super Rare"
    assert rarities.canonical("SR", "pokemon") == "Secret Rare"
    assert rarities.canonical("None", "pokemon") == rarities.UNKNOWN
    groups = rarities.groups(["Common", "Hyper rare", "Double rare", "Promo"], "pokemon")
    assert [group["family"] for group in groups] == ["basic", "ultra", "secret", "promo"]
    assert rarities.stored_names(["mythic", "Rare"], family="basic", game="magic") == [
        "mythic",
        "Rare",
    ]


# ---- Magic ---------------------------------------------------------------------


def test_scryfall_printing_becomes_a_card_of_magic(magic):
    record = parse_scryfall(magic)
    assert record.game == "magic" and record.game_key == f"mtg:{ORACLE}"
    assert record.card_type == "Creature"
    assert record.subtypes == ["Legendary", "Creature", "Elf", "Wizard"]
    assert record.colors == ["U", "R"] and record.mana_value == 3
    assert record.details["mana_cost"] == "{1}{U}{R}"
    # Only the formats people ask about.
    assert record.details["legalities"] == {"standard": "legal", "modern": "legal"}
    printing = record.printings[0]
    assert (printing.code, printing.market, printing.finishes) == (
        "TST-42",
        "MTG",
        ["nonfoil", "foil"],
    )
    assert printing.set_key == "scryfall:tst" and printing.product_type == "Expansion"
    assert "price" not in record.model_dump_json()


def test_scryfall_skips_what_is_not_a_paper_single(magic):
    for change in ({"layout": "token"}, {"digital": True}, {"games": ["arena"]}, {"lang": "ru"}):
        assert parse_scryfall({**magic, **change}) is None


def test_localized_printing_keeps_english_name_and_printed_text(magic):
    spanish = {
        **magic,
        "id": "10000000-0000-4000-8000-000000000002",
        "lang": "es",
        "printed_name": "Tejedora sintética",
        "printed_text": "Texto sintético.",
    }
    record = parse_scryfall(spanish)
    assert [(name.language, name.name) for name in record.names] == [
        ("en", "Synthetic Spark Weaver"),
        ("es", "Tejedora sintética"),
    ]
    assert {text.language for text in record.texts} == {"en", "es"}
    assert record.printings[0].language == "es"


def test_double_faced_card_reads_its_front(magic):
    faced = copy.deepcopy(magic)
    for key in ("mana_cost", "type_line", "oracle_text", "colors", "image_uris", "power"):
        faced.pop(key)
    faced["layout"] = "transform"
    faced["card_faces"] = [
        {
            "name": "Front",
            "mana_cost": "{G}",
            "type_line": "Creature — Human",
            "oracle_text": "Front text.",
            "colors": ["G"],
            "image_uris": {"normal": "https://cards.scryfall.io/normal/front/a.jpg"},
        },
        {"name": "Back", "type_line": "Creature — Werewolf", "oracle_text": "Back text."},
    ]
    record = parse_scryfall(faced)
    assert record.card_type == "Creature" and record.colors == ["G"]
    assert record.texts[0].text == "Front: Front text.\n\nBack: Back text."
    assert record.artworks[0].source_url.host == "cards.scryfall.io"


def test_printings_of_one_oracle_card_join_one_card(session, magic):
    service = IngestionService(session)
    service.ingest(parse_scryfall(magic))
    reprint = {
        **magic,
        "id": "10000000-0000-4000-8000-000000000003",
        "set": "rpt",
        "set_name": "Synthetic Reprint",
        "collector_number": "7",
        "rarity": "rare",
    }
    card = service.ingest(parse_scryfall(reprint))
    session.flush()
    assert session.scalar(select(func.count()).select_from(Card)) == 1
    assert card.game == "magic" and card.mana_value == 3 and card.monster_frame is None
    printings = session.scalars(select(CardPrinting).order_by(CardPrinting.code)).all()
    assert [(p.code, p.rarity.name, p.market) for p in printings] == [
        ("RPT-7", "Rare", "MTG"),
        ("TST-42", "Mythic Rare", "MTG"),
    ]
    assert {row.game for row in session.scalars(select(CardSet))} == {"magic"}


def test_a_magic_record_cannot_claim_a_yugioh_market(magic):
    record = parse_scryfall(magic)
    data = record.model_dump()
    data["printings"][0]["market"] = "TCG"
    with pytest.raises(ValidationError):
        type(record).model_validate(data)


async def test_scryfall_walks_its_search_newest_first(tmp_path, magic, monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        page = int(request.url.params["page"])
        return httpx.Response(
            200,
            json={"object": "list", "has_more": page == 1, "data": [magic]},
        )

    settings = Settings(_env_file=None, cache_directory=tmp_path / "cache")
    http = PoliteHttpClient("scryfall", settings, transport=httpx.MockTransport(handler))

    async def no_wait(*args):
        pass

    monkeypatch.setattr(http.store, "wait", no_wait)
    try:
        client = ScryfallClient(http, "e:tst")
        ids, cursor, done = await client.batch({}, language="es")
        assert ids == [magic["id"]] and cursor == {"api_page": 2} and not done
        assert (await client.card(ids[0])).game_key == f"mtg:{ORACLE}"
        assert (await client.batch(cursor, language="es"))[2]
        first = calls[0]
        assert first.url.params["q"] == "game:paper lang:es (e:tst)"
        assert first.url.params["order"] == "released" and first.url.params["dir"] == "desc"
        assert first.headers["Accept"].startswith("application/json")
        # A documented API: no robots.txt, and the card came from the page already read.
        assert all(call.url.path != "/robots.txt" for call in calls) and len(calls) == 2
    finally:
        await http.close()


# ---- Pokémon -------------------------------------------------------------------


def test_tcgdex_card_becomes_a_card_of_pokemon(pokemon):
    record = parse_tcgdex(pokemon, "en", set_info=SET_INFO)
    assert record.game == "pokemon" and record.game_key == "pkm:tst01-001"
    assert record.card_type == "Pokemon" and record.subtypes == ["Basic", "ex"]
    assert record.colors == ["Grass"] and record.hp == 60
    assert record.details["regulation_mark"] == "J" and record.details["number"] == "001/90"
    printing = record.printings[0]
    assert (printing.code, printing.market, printing.finishes) == (
        "SYB-001",
        "PKM",
        ["normal", "reverse"],
    )
    assert str(printing.release_date) == "2026-03-27"
    assert record.texts[0].text == "Synthetic Vine (Grass) 10: Draw."
    assert str(record.artworks[0].source_url).endswith("/001/high.png")


def test_spanish_card_reads_codes_from_english(pokemon):
    spanish = {
        **pokemon,
        "name": "Brotecito sintético",
        "rarity": "Doble rara",
        "types": ["Planta"],
        "attacks": [{"cost": ["Planta"], "name": "Látigo", "damage": 10}],
        "set": {**pokemon["set"], "name": "Flor sintética"},
    }
    record = parse_tcgdex(pokemon, "es", spanish, SET_INFO)
    assert record.printings[0].rarity == "Double rare" and record.colors == ["Grass"]
    assert [name.language for name in record.names] == ["en", "es"]
    assert record.printings[0].set_name == "Flor sintética"
    assert {text.language for text in record.texts} == {"en", "es"}


def test_japanese_cards_are_their_own_market(pokemon):
    record = parse_tcgdex(pokemon, "ja", set_info=SET_INFO)
    assert record.game_key == "pkm:ja:tst01-001"
    assert record.printings[0].market == "PKMJ"
    assert record.printings[0].set_key == "tcgdex:ja:tst01"


def test_pocket_sets_are_not_printed_cards(pokemon):
    assert parse_tcgdex(pokemon, "en", set_info={"serie": {"id": "tcgp"}}) is None


async def test_tcgdex_walks_sets_newest_first(tmp_path, pokemon, monkeypatch):
    calls = []
    newest = {**SET_INFO}
    pocket = {"id": "A9", "serie": {"id": "tcgp"}, "cards": []}

    def handler(request):
        calls.append(request.url.path)
        path = request.url.path
        if path.endswith("/sets"):
            return httpx.Response(200, json=[{"id": "tst01"}, {"id": "A9"}])
        if path.endswith("/sets/A9"):
            return httpx.Response(200, json=pocket)
        if path.endswith("/sets/tst01"):
            return httpx.Response(200, json=newest)
        if path.startswith("/v2/es/"):
            return httpx.Response(200, json={**pokemon, "name": "Brotecito"})
        return httpx.Response(200, json=pokemon)

    settings = Settings(_env_file=None, cache_directory=tmp_path / "cache")
    http = PoliteHttpClient("tcgdex", settings, transport=httpx.MockTransport(handler))

    async def no_wait(*args):
        pass

    monkeypatch.setattr(http.store, "wait", no_wait)
    try:
        client = TcgdexClient(http)
        ids, cursor, done = await client.batch({}, language="es")
        # The Pocket "set" listed last (the newest) is skipped.
        assert ids == ["tst01-001"] and cursor == {"set_index": 2} and done
        record = await client.card(ids[0], "es")
        assert record.names[-1].name == "Brotecito" and record.printings[0].code == "SYB-001"
        assert "/v2/en/cards/tst01-001" in calls and "/v2/es/cards/tst01-001" in calls
    finally:
        await http.close()


def test_new_sources_accept_their_languages_only():
    assert JobRequest(source="tcgdex", mode="initial", language="ja").language == "ja"
    assert JobRequest(source="scryfall", mode="initial", query="e:tst").query == "e:tst"
    for options in (
        {"source": "scryfall", "language": "fr"},
        {"source": "tcgdex", "language": "ko"},
        {"source": "ygoprodeck", "query": "e:tst"},
    ):
        with pytest.raises(ValidationError):
            JobRequest.model_validate({"mode": "initial", **options})


# ---- The catalogue of each game -------------------------------------------------


@pytest.fixture
def three_games(factory, magic, pokemon, payload_ygo):
    from app.integrations.ygoprodeck.parser import parse_card as parse_ygo

    with factory.begin() as session:
        service = IngestionService(session)
        service.ingest(parse_ygo(payload_ygo))
        service.ingest(parse_scryfall(magic))
        service.ingest(parse_tcgdex(pokemon, "en", set_info=SET_INFO))
        service.ingest(
            parse_tcgdex({**pokemon, "name": "Japanese Sprout"}, "ja", set_info=SET_INFO)
        )


@pytest.fixture
def payload_ygo():
    return {
        "id": 12345678,
        "name": "Synthetic Duel Dragon",
        "type": "Normal Monster",
        "race": "Dragon",
        "attribute": "LIGHT",
        "atk": 3000,
        "def": 2500,
        "level": 8,
        "desc": "Synthetic text",
        "card_sets": [{"set_name": "Synthetic Set", "set_code": "TST-EN001", "set_rarity": "Rare"}],
    }


def test_each_game_lists_only_its_cards(client, three_games):
    names = lambda params: [  # noqa: E731
        item["name"] for item in client.get("/api/v1/cards", params=params).json()["items"]
    ]
    assert names({"game": "magic"}) == ["Synthetic Spark Weaver"]
    assert names({"market": "MTG"}) == ["Synthetic Spark Weaver"]
    assert names({"market": "PKM"}) == ["Synthetic Sproutling"]
    assert names({"market": "PKMJ"}) == ["Japanese Sprout"]
    assert names({"market": "TCG"}) == ["Synthetic Duel Dragon"]
    # Rarity "Rare" exists in Yu-Gi-Oh! and Magic: the game decides which.
    assert names({"game": "yugioh", "rarity": "Rare"}) == ["Synthetic Duel Dragon"]
    assert names({"game": "magic", "subtype": "Creature", "color": "U", "mana_value": 3}) == [
        "Synthetic Spark Weaver"
    ]
    assert names({"game": "magic", "color": "G"}) == []
    assert names({"market": "PKM", "card_type": "Pokemon", "color": "Grass"}) == [
        "Synthetic Sproutling"
    ]
    item = client.get("/api/v1/cards", params={"game": "magic"}).json()["items"][0]
    assert item["game"] == "magic" and item["types"] is None
    assert item["details"] == {
        "type_line": "Legendary Creature — Elf Wizard",
        "mana_cost": "{1}{U}{R}",
    }
    detail = client.get(f"/api/v1/cards/{item['id']}").json()
    assert detail["details"]["legalities"]["standard"] == "legal"
    printing = client.get(f"/api/v1/cards/{item['id']}/printings").json()["items"][0]
    assert printing["finishes"] == ["nonfoil", "foil"] and printing["rarity_family"] == "basic"
    suggestions = client.get("/api/v1/suggest", params={"q": "Synthetic", "game": "pokemon"})
    assert [row["name"] for row in suggestions.json()] == ["Synthetic Sproutling"]


def test_facets_follow_the_game(client, three_games):
    magic = client.get("/api/v1/facets", params={"market": "MTG"}).json()
    assert magic["game"] == "magic" and magic["rarities"] == ["Mythic Rare"]
    assert magic["types"]["kinds_present"] == ["Creature"]
    assert magic["types"]["colors_present"] == ["U", "R"] and magic["types"]["mana_values"] == [3]
    assert magic["product_types"] == ["Expansion"]
    pokemon = client.get("/api/v1/facets", params={"game": "pokemon"}).json()
    assert pokemon["rarity_groups"] == [{"family": "ultra", "names": ["Double Rare"]}]
    assert "Basic" in pokemon["types"]["subtypes_present"]
    yugioh = client.get("/api/v1/facets", params={"market": "TCG"}).json()
    assert yugioh["game"] == "yugioh" and yugioh["rarities"] == ["Rare"]
    assert "monster" in yugioh["types"]


def test_recent_sets_are_per_market(client, three_games):
    sets = client.get("/api/v1/sets/recent", params={"market": "PKM"}).json()
    assert [(row["name"], row["game"]) for row in sets] == [("Synthetic Bloom", "pokemon")]
    listed = client.get("/api/v1/sets", params={"game": "magic"}).json()["items"]
    assert [row["name"] for row in listed] == ["Synthetic Expansion"]


def test_every_game_has_its_page(client, factory, three_games):
    cover = client.get("/")
    assert (
        "<title>Cardmática · Marketplace de cartas coleccionables del Mercosur</title>"
        in cover.text
    )
    for path, name in (("/magic", "Magic: The Gathering"), ("/pokemon", "Pokémon")):
        page = client.get(path)
        assert page.status_code == 200 and f"Cartas de {name} en el Mercosur" in page.text
        assert f'rel="canonical" href="http://testserver{path}"' in page.text
    with factory() as session:
        set_id = session.scalar(select(CardSet.id).where(CardSet.game == "magic"))
    assert "Synthetic Expansion · Set de Magic: The Gathering" in client.get(f"/set/{set_id}").text
    sitemap = client.get("/sitemap.xml").text
    assert all(
        f"http://testserver/{game}</loc>" in sitemap for game in ("yugioh", "magic", "pokemon")
    )


def test_preview_images_takes_one_picture_per_card(factory, settings, magic, monkeypatch):
    from app.cli import preview_images

    with factory.begin() as session:
        service = IngestionService(session)
        service.ingest(parse_scryfall(magic))
        reprint = {**magic, "id": "10000000-0000-4000-8000-000000000009", "collector_number": "9"}
        service.ingest(parse_scryfall(reprint))
        assert session.scalar(select(func.count()).select_from(CardArtwork)) == 2
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

    monkeypatch.setattr(settings, "deployment_mode", "local")
    monkeypatch.setattr(settings, "allow_local_image_preview", True)
    assert preview_images(10, Runner()) == 0
    assert [(call.source, call.mode) for call in calls] == [("scryfall", "images")]


def test_yugioh_banlists_stay_with_yugioh(client, factory, three_games):
    from datetime import date

    from app.services.banlists import BanlistFile, import_banlist

    with factory.begin() as session:
        for market in ("TCG", "OCG"):
            data = {
                "format": market,
                "effective_date": date(2026, 1, 1),
                "complete": True,
                "source_name": "Synthetic test list",
                "source_url": "https://example.com/synthetic-list",
                "retrieved_on": date(2026, 1, 2),
                "forbidden": [],
                "limited": [],
                "semi_limited": [],
            }
            import_banlist(session, BanlistFile.model_validate(data))
    cards = {item["game"]: item for item in client.get("/api/v1/cards").json()["items"]}
    # A complete list makes every Yu-Gi-Oh! card "unlimited"; not a Magic or Pokémon card.
    detail = lambda game: client.get(f"/api/v1/cards/{cards[game]['id']}").json()  # noqa: E731
    assert {row["format"] for row in detail("yugioh")["banlist_status"]} == {"TCG", "OCG"}
    assert detail("magic")["banlist_status"] == []
    assert detail("pokemon")["banlist_status"] == []
    listed = client.get("/api/v1/cards", params={"game": "magic", "market": "TCG"}).json()
    assert all(item["market_banlist"] is None for item in listed["items"])
