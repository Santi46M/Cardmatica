"""Rarities: one name per foil treatment, grouped in families.

Sources spell the same rarity in many ways: "ScR", "SE", "Secret", "Secret
rare", "(ScR)"; the OCG calls a Common "Normal". Every spelling becomes the
name Cardmarket, TCGplayer and Yugipedia use (an English proper name, also on
Spanish-language marketplaces), with its Yugipedia abbreviation.

Families follow how TCGplayer and Yugipedia group them, and order the filter
from what every booster has to what is printed for one product:

    basic     Common to Secret Rare. Short Print and Super Short Print are
              Commons that appear less often (same card, same foil).
    premium   Ultimate, Ghost, Holographic, Collector's, Starlight
    secret    Secret Rare variants: Prismatic, Quarter Century, Platinum...
    gold      Gold Series and Platinum Rare
    parallel  A textured film over a base rarity (Duel Terminal, Battle Pack)
    special   Rarities of one product or event (Pharaoh's, Millennium,
              Kaiba Corporation, Rush Duel)
    other     Names this table does not know; kept as received, never lost

Magic: The Gathering and Pokémon have their own tables (same idea, their own
names): Magic's four rarities of every set plus the special and bonus sheets;
Pokémon's ladder from Common to the illustration and secret rarities, as
Cardmarket and TCGplayer name them. Every function takes the game; Yu-Gi-Oh!
is the default.

The frontend shows the family names in Spanish (frontend/js/rarities.js).
"""

from dataclasses import dataclass
from functools import cache
from typing import Literal, get_args

Family = Literal[
    "basic",
    "premium",
    "secret",
    "gold",
    "parallel",
    "special",
    "ultra",
    "illustration",
    "promo",
    "other",
]
FAMILIES = list(get_args(Family))
UNKNOWN = "Unknown"


@dataclass(frozen=True)
class RarityInfo:
    name: str
    code: str | None
    family: str
    rank: int


# (name, Yugipedia abbreviation, other spellings), family by family, from the
# most common to the most sought after. Case, spaces, punctuation and a missing
# final "Rare" never need their own spelling here.
_YUGIOH = {
    "basic": [
        ("Common", "C", ["Normal", "N"]),
        ("Short Print", "SP", []),
        ("Super Short Print", "SSP", []),
        ("Normal Rare", "NR", []),
        ("Rare", "R", []),
        ("Super Rare", "SR", []),
        ("Ultra Rare", "UR", []),
        ("Secret Rare", "ScR", ["SE"]),
    ],
    "premium": [
        ("Ultimate Rare", "UtR", ["UL", "Relief"]),
        ("Ghost Rare", "GR", []),
        ("Holographic Rare", "HGR", ["HR"]),
        ("Collector's Rare", "CR", ["Collector Rare"]),
        ("Prismatic Collector's Rare", "PCR", []),
        ("Prismatic Ultimate Rare", "PUR", []),
        ("Starlight Rare", "StR", []),
    ],
    "secret": [
        ("Prismatic Secret Rare", "PScR", ["PSE"]),
        ("Ultra Secret Rare", "UScR", []),
        ("Secret Ultra Rare", "ScUR", []),
        ("Extra Secret Rare", "EScR", ["EXSE"]),
        ("20th Secret Rare", "20ScR", ["20thSE"]),
        ("Platinum Secret Rare", "PlScR", []),
        ("Quarter Century Secret Rare", "QCScR", ["QCSR", "QCSE", "QCR"]),
        ("10000 Secret Rare", "10000ScR", ["Ten Thousand Secret Rare"]),
    ],
    "gold": [
        ("Gold Rare", "GUR", []),
        ("Gold Secret Rare", "GScR", []),
        ("Ghost/Gold Rare", "GGR", ["Gold Ghost Rare", "Ghost Gold Rare"]),
        ("Premium Gold Rare", "PGR", []),
        ("Platinum Rare", "PlR", []),
    ],
    "parallel": [
        ("Parallel Rare", None, []),
        ("Normal Parallel Rare", "NPR", ["NP", "Parallel Common"]),
        ("Rare Parallel Rare", "RPR", []),
        ("Super Parallel Rare", "SPR", []),
        ("Ultra Parallel Rare", "UPR", []),
        ("Secret Parallel Rare", "ScPR", []),
        ("Extra Secret Parallel Rare", "EScPR", []),
        ("Holographic Parallel Rare", "HGPR", []),
        ("Duel Terminal Normal Parallel Rare", "DNPR", []),
        ("Duel Terminal Normal Rare Parallel Rare", "DNRPR", []),
        ("Duel Terminal Rare Parallel Rare", "DRPR", []),
        ("Duel Terminal Super Parallel Rare", "DSPR", []),
        ("Duel Terminal Ultra Parallel Rare", "DUPR", []),
        ("Duel Terminal Secret Parallel Rare", "DScPR", []),
        ("Duel Terminal Technology Common", None, []),
        ("Duel Terminal Technology Ultra Rare", None, []),
        ("Holofoil Rare", "HFR", []),
        ("Starfoil Rare", "SFR", []),
        ("Shatterfoil Rare", "SHR", []),
        ("Mosaic Rare", "MSR", []),
    ],
    "special": [
        ("Ultra Rare (Pharaoh's Rare)", "URPR", ["Pharaoh's Rare"]),
        ("Ultra Pharaoh's Rare", None, []),
        ("Secret Pharaoh's Rare", None, []),
        ("Millennium Rare", "MLR", []),
        ("Millennium Super Rare", "MLSR", []),
        ("Millennium Ultra Rare", "MLUR", []),
        ("Millennium Secret Rare", "MLScR", []),
        ("Millennium Gold Rare", "MLGR", []),
        ("Kaiba Corporation Common", "KCC", []),
        ("Kaiba Corporation Rare", "KCR", []),
        ("Kaiba Corporation Super Rare", "KCSR", []),
        ("Kaiba Corporation Ultra Rare", "KCUR", []),
        ("Rush Rare", "RR", []),
        ("Gold Rush Rare", "GRR", []),
        ("Over Rush Rare", "ORR", []),
    ],
}


# Scryfall writes them in lowercase ("mythic"); every set has the first four.
_MAGIC = {
    "basic": [
        ("Common", "C", []),
        ("Uncommon", "U", []),
        ("Rare", "R", []),
        ("Mythic Rare", "M", ["Mythic"]),
    ],
    "special": [
        ("Special", "S", ["Timeshifted"]),
        ("Bonus", "B", []),
    ],
}

# TCGdex spells them "Double rare", "Illustration rare"; older eras add V, VMAX,
# LV.X and friends. Abbreviations are the usual ones of Cardmarket and the community.
_POKEMON = {
    "basic": [
        ("Common", "C", []),
        ("Uncommon", "U", []),
        ("Rare", "R", []),
        ("Holo Rare", "RH", ["Rare Holo", "Holofoil Rare"]),
    ],
    "ultra": [
        ("Double Rare", "RR", []),
        ("Ultra Rare", "UR", []),
        ("ACE SPEC Rare", "ACE", []),
        ("Holo Rare V", "V", ["Rare Holo V"]),
        ("Holo Rare VMAX", "VMAX", ["Rare Holo VMAX"]),
        ("Holo Rare VSTAR", "VSTAR", ["Rare Holo VSTAR"]),
        ("Rare Holo LV.X", "LV.X", []),
        ("Rare PRIME", "PRIME", ["Prime"]),
        ("LEGEND", "LEGEND", []),
        ("Radiant Rare", "RAD", []),
        ("Amazing Rare", "AR", []),
    ],
    "illustration": [
        ("Illustration Rare", "IR", []),
        ("Special Illustration Rare", "SIR", []),
        ("Full Art Trainer", "FA", []),
        ("Classic Collection", "CC", []),
    ],
    "secret": [
        ("Secret Rare", "SR", []),
        ("Hyper Rare", "HR", []),
        ("Mega Hyper Rare", "MHR", []),
        ("Mega Attack Rare", "MAR", []),
        ("Shiny Rare", "S", []),
        ("Shiny Ultra Rare", "SSR", []),
        ("Shiny Rare V", None, []),
        ("Shiny Rare VMAX", None, []),
        ("Pikachu Rare", None, []),
        ("Black White Rare", "BWR", []),
        ("RGB Rare", None, []),
        ("Futuristic Rare", None, []),
        ("Crown", None, ["Crown Rare"]),
    ],
    "promo": [
        ("Promo", "PR", []),
    ],
}

_TABLES = {"yugioh": _YUGIOH, "magic": _MAGIC, "pokemon": _POKEMON}


def _key(text: str) -> str:
    """Compare ignoring case, spaces, punctuation and the typographic apostrophe."""
    return "".join(ch for ch in text.casefold() if ch.isalnum())


def _build(table):
    infos, spellings = {}, {}
    rank = 0
    for family, rows in table.items():
        for name, code, aliases in rows:
            infos[name] = RarityInfo(name, code, family, rank)
            rank += 1
            for spelling in [name, *([code] if code else []), *aliases]:
                spellings[_key(spelling)] = name
    return infos, spellings


_BUILT = {game: _build(table) for game, table in _TABLES.items()}
# Abbreviations mean different rarities in each game ("SR" is Super Rare in
# Yu-Gi-Oh! and Secret Rare in Pokémon), so each game reads only its own.
_INFOS, _SPELLINGS = _BUILT["yugioh"]


def _tables(game):
    return _BUILT.get(game or "yugioh", _BUILT["yugioh"])


@cache
def canonical(value: str | None, game: str = "yugioh") -> str:
    """The rarity's usual name; an unrecognised one is kept, tidied, as received."""
    text = " ".join((value or "").split()).strip("() ")
    key = _key(text)
    # Basic Pokémon Energy has no rarity: TCGdex writes "None".
    if not key or key == "unknown" or (game == "pokemon" and key == "none"):
        return UNKNOWN
    spellings = _tables(game)[1]
    # "Secret" and "Quarter Century Secret" are the names without "Rare".
    return spellings.get(key) or spellings.get(key + "rare") or text


def info(value: str | None, game: str = "yugioh") -> RarityInfo:
    name = canonical(value, game)
    infos = _tables(game)[0]
    return infos.get(name) or RarityInfo(name, None, "other", len(infos))


def groups(names, game: str = "yugioh") -> list[dict]:
    """Names present in the catalogue, by family and in order; Unknown is left out."""
    found = sorted(
        {info(name, game) for name in names if canonical(name, game) != UNKNOWN},
        key=lambda item: (item.rank, item.name),
    )
    return [
        {"family": family, "names": [item.name for item in found if item.family == family]}
        for family in [*_TABLES.get(game, _YUGIOH), "other"]
        if any(item.family == family for item in found)
    ]


def stored_names(
    names, *, rarity: str | None = None, family: str | None = None, game: str = "yugioh"
) -> list[str]:
    """Spellings in the database that mean this rarity, or belong to this family."""
    return [
        name
        for name in names
        if (rarity is None or canonical(name, game) == canonical(rarity, game))
        and (family is None or info(name, game).family == family)
    ]
