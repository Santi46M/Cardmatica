import pytest

from app.services import rarities
from app.services.rarities import canonical


@pytest.mark.parametrize(
    ("spelling", "name"),
    [
        ("ScR", "Secret Rare"),
        ("(ScR)", "Secret Rare"),
        ("secret  rare", "Secret Rare"),
        ("Secret", "Secret Rare"),
        ("SE", "Secret Rare"),
        ("c", "Common"),
        ("Normal", "Common"),
        ("Collectors Rare", "Collector's Rare"),
        ("Collector’s Rare", "Collector's Rare"),
        ("QCSR", "Quarter Century Secret Rare"),
        ("QCScR", "Quarter Century Secret Rare"),
        ("Quarter Century Secret", "Quarter Century Secret Rare"),
        ("Gold Ghost Rare", "Ghost/Gold Rare"),
        ("UL", "Ultimate Rare"),
        ("", "Unknown"),
        ("unknown", "Unknown"),
        # A name the table does not know is kept, tidied, as received.
        ("  Mystery   Rare ", "Mystery Rare"),
    ],
)
def test_every_spelling_has_one_name(spelling, name):
    assert canonical(spelling) == name


def test_families_in_order_with_only_what_is_present():
    names = ["Ultra Rare", "Common", "QCSR", "Quarter Century Secret Rare", "Unknown", "Gold Rare"]
    names += ["Short Print", "Starlight Rare", "Mystery Rare"]
    assert rarities.groups(names) == [
        {"family": "basic", "names": ["Common", "Short Print", "Ultra Rare"]},
        {"family": "premium", "names": ["Starlight Rare"]},
        {"family": "secret", "names": ["Quarter Century Secret Rare"]},
        {"family": "gold", "names": ["Gold Rare"]},
        {"family": "other", "names": ["Mystery Rare"]},
    ]


def test_stored_spellings_for_a_rarity_or_family():
    stored = ["ScR", "Secret Rare", "Gold Rare", "Premium Gold Rare", "Common"]
    assert rarities.stored_names(stored, rarity="Secret") == ["ScR", "Secret Rare"]
    assert rarities.stored_names(stored, family="gold") == ["Gold Rare", "Premium Gold Rare"]
    assert rarities.stored_names(stored, rarity="Starlight Rare") == []
    info = rarities.info("ScR")
    assert (info.name, info.code, info.family) == ("Secret Rare", "ScR", "basic")
