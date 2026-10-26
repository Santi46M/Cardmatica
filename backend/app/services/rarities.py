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

The frontend shows the family names in Spanish (frontend/js/rarities.js).
"""

from dataclasses import dataclass
from functools import cache
from typing import Literal, get_args

Family = Literal["basic", "premium", "secret", "gold", "parallel", "special", "other"]
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
_TABLE = {
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


def _key(text: str) -> str:
    """Compare ignoring case, spaces, punctuation and the typographic apostrophe."""
    return "".join(ch for ch in text.casefold() if ch.isalnum())


def _build():
    infos, spellings = {}, {}
    rank = 0
    for family, rows in _TABLE.items():
        for name, code, aliases in rows:
            infos[name] = RarityInfo(name, code, family, rank)
            rank += 1
            for spelling in [name, *([code] if code else []), *aliases]:
                spellings[_key(spelling)] = name
    return infos, spellings


_INFOS, _SPELLINGS = _build()


@cache
def canonical(value: str | None) -> str:
    """The rarity's usual name; an unrecognised one is kept, tidied, as received."""
    text = " ".join((value or "").split()).strip("() ")
    key = _key(text)
    if not key or key == "unknown":
        return UNKNOWN
    # "Secret" and "Quarter Century Secret" are the names without "Rare".
    return _SPELLINGS.get(key) or _SPELLINGS.get(key + "rare") or text


def info(value: str | None) -> RarityInfo:
    name = canonical(value)
    return _INFOS.get(name) or RarityInfo(name, None, "other", len(_INFOS))


def groups(names) -> list[dict]:
    """Names present in the catalogue, by family and in order; Unknown is left out."""
    found = sorted(
        {info(name) for name in names if canonical(name) != UNKNOWN},
        key=lambda item: (item.rank, item.name),
    )
    return [
        {"family": family, "names": [item.name for item in found if item.family == family]}
        for family in FAMILIES
        if any(item.family == family for item in found)
    ]


def stored_names(names, *, rarity: str | None = None, family: str | None = None) -> list[str]:
    """Spellings in the database that mean this rarity, or belong to this family."""
    return [
        name
        for name in names
        if (rarity is None or canonical(name) == canonical(rarity))
        and (family is None or info(name).family == family)
    ]
