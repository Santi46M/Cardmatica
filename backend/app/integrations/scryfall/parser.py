"""Scryfall card objects → catalogue records of Magic: The Gathering.

One Scryfall card object is one printing: a set, a collector number and a
language. Every printing of the same card shares its oracle id, which becomes
the card's identity in the catalogue (game_key "mtg:<oracle id>"), so a card
gathers all its printings, as Cardmarket and TCGplayer list them.

What a card is (cost, types, colours, rules text, formats) is the same in every
printing; what changes is the set, number, rarity, language and finishes
(nonfoil, foil, etched), which are sold as one product with an offer per finish.

https://scryfall.com/docs/api/cards
"""

from pydantic import HttpUrl

from app.schemas.ingestion import (
    ArtworkInput,
    CardRecord,
    NameInput,
    PrintingInput,
    TextInput,
)

API = "https://api.scryfall.com/"
# Languages of the Mercosur and Japanese, as Scryfall writes them.
LANGUAGES = {"en": "en", "es": "es", "pt": "pt", "ja": "ja"}
# A card's main types, from the one that names it best ("Artifact Creature" is a creature).
MAIN_TYPES = [
    "Creature",
    "Planeswalker",
    "Battle",
    "Instant",
    "Sorcery",
    "Artifact",
    "Enchantment",
    "Land",
    "Kindred",
]
SUPERTYPES = {"Basic", "Legendary", "Snow", "World", "Ongoing", "Host"}
COLORS = ["W", "U", "B", "R", "G"]
# Formats people ask about; Scryfall lists many more.
FORMATS = ["standard", "pioneer", "modern", "legacy", "vintage", "commander", "pauper"]
# Kinds of set, as Scryfall's set_type, in words.
SET_TYPES = {
    "core": "Core Set",
    "expansion": "Expansion",
    "masters": "Masters",
    "draft_innovation": "Draft Innovation",
    "commander": "Commander",
    "starter": "Starter",
    "box": "Box Set",
    "duel_deck": "Duel Deck",
    "from_the_vault": "From the Vault",
    "premium_deck": "Premium Deck",
    "spellbook": "Spellbook",
    "funny": "Un-set",
    "promo": "Promo",
    "masterpiece": "Masterpiece",
    "alchemy": "Alchemy",
    "planechase": "Planechase",
    "archenemy": "Archenemy",
    "vanguard": "Vanguard",
    "arsenal": "Arsenal",
    "memorabilia": "Memorabilia",
    "minigame": "Minigame",
    "eternal": "Eternal",
}
# Objects that are not cards sold on their own in the singles market.
SKIPPED_LAYOUTS = {"token", "double_faced_token", "emblem", "art_series", "vanguard", "planar"}


def type_words(type_line: str) -> tuple[str | None, list[str]]:
    """("Creature", ["Legendary", "Creature", "Elf", "Druid"]) from its type line."""
    first = type_line.split("//")[0]
    left, _, right = first.partition("—")
    words = left.split() + right.split()
    main = next((kind for kind in MAIN_TYPES if kind in left.split()), None)
    return main, list(dict.fromkeys(words))


def rules_text(data: dict, key: str) -> str:
    """The rules text of every face, the faces separated as on the card."""
    faces = data.get("card_faces")
    if faces:
        parts = []
        for face in faces:
            name = face.get("printed_name") or face.get("name")
            text = face.get(key) or face.get("oracle_text") or ""
            parts.append(f"{name}: {text}".strip())
        return "\n\n".join(parts)
    return data.get(key) or ""


def image_of(data: dict) -> dict | None:
    return data.get("image_uris") or ((data.get("card_faces") or [{}])[0].get("image_uris"))


def parse_card(data: dict) -> CardRecord | None:
    """A printing as a catalogue record; None for objects that are not single cards."""
    language = LANGUAGES.get(data.get("lang", ""))
    oracle = data.get("oracle_id") or (data.get("card_faces") or [{}])[0].get("oracle_id")
    if (
        not language
        or not oracle
        or data.get("digital")
        or data.get("layout") in SKIPPED_LAYOUTS
        or "paper" not in data.get("games", ["paper"])
    ):
        return None
    face = (data.get("card_faces") or [{}])[0]
    type_line = data.get("type_line") or face.get("type_line") or ""
    main, words = type_words(type_line)
    colors = data.get("colors")
    if colors is None:
        colors = face.get("colors") or []
    names = [NameInput(language="en", name=data["name"])]
    printed = data.get("printed_name") or face.get("printed_name")
    if language != "en" and printed:
        names.append(NameInput(language=language, name=printed))
    texts = []
    if text := rules_text(data, "oracle_text"):
        texts.append(TextInput(language="en", text=text, current=True))
    if language != "en" and (printed_text := rules_text(data, "printed_text")):
        texts.append(TextInput(language=language, text=printed_text, current=True))
    legalities = data.get("legalities") or {}
    details = {
        key: value
        for key, value in {
            "mana_cost": data.get("mana_cost", face.get("mana_cost")),
            "type_line": type_line,
            "power": data.get("power", face.get("power")),
            "toughness": data.get("toughness", face.get("toughness")),
            "loyalty": data.get("loyalty", face.get("loyalty")),
            "defense": data.get("defense", face.get("defense")),
            "keywords": data.get("keywords") or None,
            "legalities": {name: legalities[name] for name in FORMATS if name in legalities}
            or None,
        }.items()
        if value not in (None, "", [])
    }
    set_code = data["set"].upper()
    released = data.get("released_at")
    printing = PrintingInput(
        code=f"{set_code}-{data['collector_number']}",
        set_key=f"scryfall:{data['set']}",
        set_name=data["set_name"],
        rarity=data.get("rarity") or "Unknown",
        language=language,
        market="MTG",
        release_date=released,
        set_release_date=released,
        set_source_url=HttpUrl(f"{API}sets/{data['set']}"),
        product_type=SET_TYPES.get(data.get("set_type", ""), None),
        finishes=[value for value in data.get("finishes", []) if value],
    )
    image = image_of(data)
    artworks = (
        [
            ArtworkInput(
                external_id=data["id"],
                source_url=image["normal"],
                small_source_url=image.get("small"),
            )
        ]
        if image and image.get("normal")
        else []
    )
    return CardRecord(
        source="scryfall",
        game="magic",
        game_key=f"mtg:{oracle}",
        external_id=data["id"],
        url=f"{API}cards/{data['id']}",
        language=language,
        names=names,
        card_type=main,
        subtypes=words,
        colors=[color for color in COLORS if color in colors],
        mana_value=int(data.get("cmc") or 0),
        details=details,
        available_markets=["MTG"],
        printings=[printing],
        artworks=artworks,
        texts=texts,
        limitations=[
            "Scryfall no concede derechos de Wizards of the Coast sobre el arte ni el texto.",
            "Las imágenes de Scryfall no pueden recortarse ni ocultar el copyright y el artista.",
        ],
    )
