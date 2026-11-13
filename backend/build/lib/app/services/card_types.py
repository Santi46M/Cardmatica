"""Card type taxonomy: turn a card's loose type words into ordered levels.

Sources describe a card's type as a flat list ("Dragon", "Synchro", "Tuner",
"Effect" or "Continuous"), and each source spells it differently ("XYZ",
"Quick Play", "Spell Card"). This module sorts those words into levels:

    Monster -> frame (Normal, Effect, Ritual, Fusion, Synchro, Xyz, Link)
               + Pendulum, abilities (Tuner, Flip...), type/race, attribute
    Spell   -> property (Normal, Quick-Play, Continuous, Equip, Field, Ritual)
    Trap    -> property (Normal, Continuous, Counter)

Values are canonical English codes; the frontend shows them in Spanish
(frontend/js/card-types.js). The same lists, in this order, feed the filters.
"""

from dataclasses import dataclass, field

KINDS = ["Monster", "Spell", "Trap", "Skill"]

# Monster card frames, in the order the filters show them.
FRAMES = ["Normal", "Effect", "Ritual", "Fusion", "Synchro", "Xyz", "Link", "Token"]
# When several frame words appear, the most specific wins ("Synchro Tuner
# Effect" is a Synchro monster).
FRAME_PRECEDENCE = ["Link", "Xyz", "Synchro", "Fusion", "Ritual", "Token", "Effect", "Normal"]
# Abilities printed on the monster's type line; all of them except Tuner imply
# an Effect monster.
ABILITIES = ["Tuner", "Flip", "Gemini", "Spirit", "Toon", "Union"]
ATTRIBUTES = ["LIGHT", "DARK", "EARTH", "WATER", "FIRE", "WIND", "DIVINE"]
RACES = [
    "Aqua",
    "Beast",
    "Beast-Warrior",
    "Creator God",
    "Cyberse",
    "Dinosaur",
    "Divine-Beast",
    "Dragon",
    "Fairy",
    "Fiend",
    "Fish",
    "Illusion",
    "Insect",
    "Machine",
    "Plant",
    "Psychic",
    "Pyro",
    "Reptile",
    "Rock",
    "Sea Serpent",
    "Spellcaster",
    "Thunder",
    "Warrior",
    "Winged Beast",
    "Wyrm",
    "Zombie",
]
PROPERTIES = {
    "Spell": ["Normal", "Quick-Play", "Continuous", "Equip", "Field", "Ritual"],
    "Trap": ["Normal", "Continuous", "Counter"],
}


def _key(word: str) -> str:
    """Compare words ignoring case, spaces, hyphens and the words Card/Monster."""
    return "".join(ch for ch in word.casefold() if ch.isalnum())


# Every accepted spelling, mapped to its canonical code.
_ALIASES = {
    **{_key(value): value for value in FRAMES + ABILITIES + RACES},
    "xyz": "Xyz",
    "pendulum": "Pendulum",
    "quickplay": "Quick-Play",
    "continuous": "Continuous",
    "equip": "Equip",
    "field": "Field",
    "counter": "Counter",
    # Spanish spellings used by the Konami database in Spanish.
    "efecto": "Effect",
    "fusion": "Fusion",
    "fusión": "Fusion",
    "sincronia": "Synchro",
    "sincronía": "Synchro",
    "pendulo": "Pendulum",
    "péndulo": "Pendulum",
    "enlace": "Link",
    "cantante": "Tuner",
    "volteo": "Flip",
    "geminis": "Gemini",
    "géminis": "Gemini",
    "espiritu": "Spirit",
    "espíritu": "Spirit",
    "union": "Union",
    "unión": "Union",
    "dragon": "Dragon",
    "dragón": "Dragon",
    "guerrero": "Warrior",
    "lanzadordeconjuros": "Spellcaster",
    "juegorapido": "Quick-Play",
    "juegorápido": "Quick-Play",
    "continua": "Continuous",
    "equipo": "Equip",
    "campo": "Field",
    "contraefecto": "Counter",
}
# Words that only say what kind of card it is.
_KIND_WORDS = {"monster", "spell", "trap", "card", "skill", "spellcard", "trapcard"}


@dataclass
class CardTypes:
    kind: str | None
    frame: str | None = None
    pendulum: bool = False
    abilities: list[str] = field(default_factory=list)
    race: str | None = None
    property: str | None = None


def normalize_kind(card_type: str | None) -> str | None:
    if not card_type:
        return None
    word = _key(card_type)
    for kind in KINDS:
        if word.startswith(kind.casefold()):
            return kind
    return card_type


def classify(card_type: str | None, subtypes: list[str] | None) -> CardTypes:
    kind = normalize_kind(card_type)
    words = [_ALIASES.get(_key(word), word) for word in subtypes or []]
    words = [word for word in words if _key(word) not in _KIND_WORDS]
    if kind in PROPERTIES:
        options = PROPERTIES[kind]
        found = next((word for word in words if word in options), None)
        # A spell or trap with no property word is a Normal one.
        return CardTypes(kind=kind, property=found or "Normal")
    if kind != "Monster":
        return CardTypes(kind=kind)
    abilities = [ability for ability in ABILITIES if ability in words]
    frame = next((value for value in FRAME_PRECEDENCE if value in words), None)
    effect_ability = any(ability != "Tuner" for ability in abilities)
    if frame in (None, "Normal") and effect_ability:
        frame = "Effect"
    if frame is None and (abilities or "Pendulum" in words):
        # "Tuner Monster" alone is an effect Tuner; a bare Pendulum too.
        frame = "Effect"
    race = next((word for word in words if word in RACES), None)
    return CardTypes(
        kind=kind,
        frame=frame,
        pendulum="Pendulum" in words,
        abilities=abilities,
        race=race,
    )


def apply(card) -> None:
    """Copy the classification onto a Card row (its indexed filter columns)."""
    types = classify(card.card_type, card.subtypes)
    card.monster_frame = types.frame
    card.is_pendulum = types.pendulum
    card.monster_abilities = types.abilities
    card.monster_race = types.race
    card.card_property = types.property


def taxonomy() -> dict:
    """The levels in display order, for the filters."""
    return {
        "kinds": ["Monster", "Spell", "Trap"],
        "monster": {
            "frames": FRAMES[:-1] + ["Pendulum"],
            "abilities": ABILITIES,
            "races": RACES,
            "attributes": ATTRIBUTES,
        },
        "spell": PROPERTIES["Spell"],
        "trap": PROPERTIES["Trap"],
    }
