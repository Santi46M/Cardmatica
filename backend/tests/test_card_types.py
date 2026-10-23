"""Type line levels from the spellings each source uses."""

import pytest

from app.services.card_types import classify


@pytest.mark.parametrize(
    "card_type, subtypes, frame, pendulum, abilities, race",
    [
        ("Monster", ["Dragon", "Normal"], "Normal", False, [], "Dragon"),
        ("Monster", ["Dragon", "Effect"], "Effect", False, [], "Dragon"),
        ("Monster", ["Dragon", "XYZ"], "Xyz", False, [], "Dragon"),
        (
            "Monster",
            ["Dragon", "Synchro", "Tuner", "Effect"],
            "Synchro",
            False,
            ["Tuner"],
            "Dragon",
        ),
        ("Monster", ["Spellcaster", "Pendulum", "Effect"], "Effect", True, [], "Spellcaster"),
        ("Monster", ["Dragon", "Pendulum", "Normal"], "Normal", True, [], "Dragon"),
        ("Monster", ["Machine", "Tuner"], "Effect", False, ["Tuner"], "Machine"),
        ("Monster", ["Fairy", "Normal", "Tuner"], "Normal", False, ["Tuner"], "Fairy"),
        ("Monster", ["Zombie", "Flip", "Effect"], "Effect", False, ["Flip"], "Zombie"),
        ("Monster", ["Warrior", "Gemini"], "Effect", False, ["Gemini"], "Warrior"),
        ("Monster", ["Cyberse", "Link", "Effect"], "Link", False, [], "Cyberse"),
        ("Monster", ["Beast-Warrior", "Ritual", "Effect"], "Ritual", False, [], "Beast-Warrior"),
        ("Monster", ["Dragón", "Sincronía", "Efecto"], "Synchro", False, [], "Dragon"),
    ],
)
def test_monster_levels(card_type, subtypes, frame, pendulum, abilities, race):
    types = classify(card_type, subtypes)
    assert (types.kind, types.frame, types.pendulum, types.abilities, types.race) == (
        "Monster",
        frame,
        pendulum,
        abilities,
        race,
    )


@pytest.mark.parametrize(
    "card_type, subtypes, kind, prop",
    [
        ("Spell", ["Continuous", "Spell"], "Spell", "Continuous"),
        ("Spell Card", ["Quick Play"], "Spell", "Quick-Play"),
        ("Spell", ["Spell"], "Spell", "Normal"),
        ("Spell", ["Ritual"], "Spell", "Ritual"),
        ("Trap", ["Counter", "Trap"], "Trap", "Counter"),
        ("Trap Card", ["Continuous"], "Trap", "Continuous"),
        # Traps have no Field property: an unknown word falls back to Normal.
        ("Trap", ["Field"], "Trap", "Normal"),
    ],
)
def test_spell_and_trap_property(card_type, subtypes, kind, prop):
    types = classify(card_type, subtypes)
    assert (types.kind, types.property, types.frame) == (kind, prop, None)


def ingest_variant(factory, record, number, name, card_type, subtypes, **fields):
    from app.schemas.ingestion import CardRecord
    from app.services.ingestion import IngestionService

    variant = CardRecord.model_validate(
        {
            **record.model_dump(),
            "external_id": str(number),
            "konami_id": number,
            "passcode": str(number).zfill(8),
            "url": f"https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid={number}",
            "names": [{"language": "en", "name": name}],
            "card_type": card_type,
            "subtypes": subtypes,
            "printings": [],
            **fields,
        }
    )
    with factory.begin() as session:
        IngestionService(session).ingest(variant)


def names(client, **params):
    items = client.get("/api/v1/cards", params=params).json()["items"]
    return sorted(item["name"] for item in items)


def test_catalogue_filters_by_type_levels(client, factory, record):
    ingest_variant(
        factory,
        record,
        990101,
        "Synthetic Synchro",
        "Monster",
        ["Dragon", "Synchro", "Tuner", "Effect"],
        level=7,
    )
    ingest_variant(
        factory,
        record,
        990102,
        "Synthetic Pendulum",
        "Monster",
        ["Spellcaster", "Pendulum", "Effect"],
        attribute="DARK",
        level=4,
    )
    ingest_variant(
        factory, record, 990103, "Synthetic Field", "Spell", ["Field"], attribute=None, level=None
    )
    ingest_variant(
        factory,
        record,
        990104,
        "Synthetic Counter",
        "Trap",
        ["Counter"],
        attribute=None,
        level=None,
    )

    assert names(client, card_type="Monster", frame="Synchro") == ["Synthetic Synchro"]
    assert names(client, card_type="Monster", frame="Pendulum") == ["Synthetic Pendulum"]
    assert names(client, ability="Tuner") == ["Synthetic Synchro"]
    assert names(client, race="Spellcaster") == ["Synthetic Pendulum"]
    assert names(client, attribute="DARK") == ["Synthetic Pendulum"]
    assert names(client, card_type="Monster", level=7) == ["Synthetic Synchro"]
    assert names(client, card_type="Spell", property="Field") == ["Synthetic Field"]
    assert names(client, card_type="Trap", property="Counter") == ["Synthetic Counter"]

    card = client.get("/api/v1/cards", params={"frame": "Synchro"}).json()["items"][0]
    assert card["types"]["frame"] == "Synchro" and card["types"]["abilities"] == ["Tuner"]
    types = client.get("/api/v1/facets").json()["types"]
    assert types["spell"][:2] == ["Normal", "Quick-Play"] and types["trap"][-1] == "Counter"
    assert "Spellcaster" in types["races_present"] and "Zombie" not in types["races_present"]
