"""TCGdex card objects → catalogue records of the Pokémon TCG.

A Pokémon card is one card of one set (TCGdex's id "me03-001"): a reprint in
another set is another card, as Cardmarket and TCGplayer sell them. The card's
identity is "pkm:<id>"; Japanese sets are numbered apart ("pkm:ja:<id>") and
form their own market, as the OCG does for Yu-Gi-Oh!.

TCGdex translates the type, stage and rarity words into the language asked,
so a record in Spanish or Portuguese is read from the English object (its
words are the codes) with the names and texts of that language.

https://tcgdex.dev/reference/card
"""

from pydantic import HttpUrl

from app.schemas.ingestion import (
    ArtworkInput,
    CardRecord,
    NameInput,
    PrintingInput,
    TextInput,
)

API = "https://api.tcgdex.net/v2/"
# International languages read with their English object; Japanese on its own.
LANGUAGES = {"en", "es", "pt", "ja"}
ENERGY_TYPES = [
    "Grass",
    "Fire",
    "Water",
    "Lightning",
    "Psychic",
    "Fighting",
    "Darkness",
    "Metal",
    "Fairy",
    "Dragon",
    "Colorless",
]
# The finishes a printing comes in (TCGdex's variants), in the order they are shown.
FINISHES = ["normal", "holo", "reverse", "firstEdition"]
# TCG Pocket is a phone game: its "sets" are not printed cards.
DIGITAL_SERIES = {"tcgp"}


def market_of(language: str) -> str:
    return "PKMJ" if language == "ja" else "PKM"


def game_key(card_id: str, language: str) -> str:
    return f"pkm:ja:{card_id}" if language == "ja" else f"pkm:{card_id}"


def card_text(data: dict) -> str:
    """Abilities, attacks and the card's effect, one paragraph each, as printed."""
    parts = []
    for ability in data.get("abilities") or []:
        parts.append(
            f"[{ability.get('type') or 'Ability'}] {ability.get('name')}: {ability.get('effect') or ''}"
        )
    for attack in data.get("attacks") or []:
        cost = " ".join(attack.get("cost") or [])
        damage = f" {attack['damage']}" if attack.get("damage") not in (None, "") else ""
        effect = f": {attack['effect']}" if attack.get("effect") else ""
        parts.append(f"{attack.get('name')}{f' ({cost})' if cost else ''}{damage}{effect}")
    if data.get("effect"):
        parts.append(data["effect"])
    if data.get("item"):
        parts.append(f"{data['item'].get('name')}: {data['item'].get('effect')}")
    return "\n\n".join(part.strip() for part in parts if part and part.strip())


def subtypes_of(data: dict) -> list[str]:
    """Stage or trainer/energy kind first, then the rule box (ex, V, VMAX...)."""
    words = [data.get("stage"), data.get("trainerType"), data.get("energyType"), data.get("suffix")]
    return list(dict.fromkeys(word for word in words if word))


def parse_card(data: dict, language: str = "en", localized: dict | None = None, set_info=None):
    """data: the card in English (or the Japanese object); localized: the same
    card in `language` for its names and texts. set_info: the set's own object
    (release date, abbreviation, series). None for cards that are not printed."""
    set_info = set_info or {}
    if (set_info.get("serie") or {}).get("id") in DIGITAL_SERIES or language not in LANGUAGES:
        return None
    words = localized or data
    card_id = data["id"]
    set_brief = data.get("set") or {}
    code_prefix = ((set_info.get("abbreviation") or {}).get("official") or set_brief["id"]).upper()
    variants = data.get("variants") or {}
    finishes = [name for name in FINISHES if variants.get(name)]
    names = [NameInput(language=language, name=words["name"])]
    if language not in ("en", "ja"):
        names.insert(0, NameInput(language="en", name=data["name"]))
    texts = []
    if language not in ("en", "ja") and (english := card_text(data)):
        texts.append(TextInput(language="en", text=english, current=True))
    if text := card_text(words):
        texts.append(TextInput(language=language, text=text, current=True))
    weaknesses = [w.get("type") for w in data.get("weaknesses") or [] if w.get("type")]
    resistances = [r.get("type") for r in data.get("resistances") or [] if r.get("type")]
    details = {
        key: value
        for key, value in {
            "stage": data.get("stage"),
            "suffix": data.get("suffix"),
            "trainer_type": data.get("trainerType"),
            "energy_type": data.get("energyType"),
            "evolves_from": data.get("evolveFrom"),
            "weaknesses": weaknesses,
            "resistances": resistances,
            "retreat": data.get("retreat"),
            "regulation_mark": data.get("regulationMark"),
            "legal": data.get("legal"),
            "dex_ids": data.get("dexId"),
            "illustrator": data.get("illustrator"),
        }.items()
        if value not in (None, "", [], {})
    }
    released = set_info.get("releaseDate")
    total = (set_brief.get("cardCount") or {}).get("official")
    number = f"{data['localId']}/{total}" if total and str(data["localId"]).isdigit() else None
    if number:
        details["number"] = number
    printing = PrintingInput(
        code=f"{code_prefix}-{data['localId']}",
        set_key=f"tcgdex:{'ja:' if language == 'ja' else ''}{set_brief['id']}",
        set_name=(localized or data).get("set", {}).get("name")
        or set_brief.get("name")
        or set_brief["id"],
        rarity=data.get("rarity") or "Unknown",
        language=language,
        market=market_of(language),
        release_date=released,
        set_release_date=released,
        set_source_url=HttpUrl(f"{API}{'ja' if language == 'ja' else 'en'}/sets/{set_brief['id']}"),
        product_type=(set_info.get("serie") or {}).get("name"),
        finishes=finishes,
    )
    image = words.get("image") or data.get("image")
    artworks = (
        [
            ArtworkInput(
                external_id=f"{language}:{card_id}",
                source_url=f"{image}/high.png",
                small_source_url=f"{image}/low.png",
            )
        ]
        if image
        else []
    )
    types = data.get("types") or []
    return CardRecord(
        source="tcgdex",
        game="pokemon",
        game_key=game_key(card_id, language),
        external_id=card_id,
        url=f"{API}{language}/cards/{card_id}",
        language=language,
        names=names,
        card_type=data.get("category"),
        subtypes=subtypes_of(data),
        colors=[value for value in ENERGY_TYPES if value in types],
        hp=data.get("hp"),
        details=details,
        available_markets=[market_of(language)],
        printings=[printing],
        artworks=artworks,
        texts=texts,
        limitations=[
            "TCGdex no concede derechos de The Pokémon Company sobre el arte ni el texto.",
        ],
    )
