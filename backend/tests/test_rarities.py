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
        # What YGOPRODeck sends in place of a rarity it does not have.
        ("2", "Unknown"),
        ("3", "Unknown"),
        ("New", "Unknown"),
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


def test_ygoprodeck_typing_slips_take_the_documented_rarity():
    from app.integrations.ygoprodeck.parser import rarity

    # Documented in app/integrations/ygoprodeck/corrections.py.
    assert rarity("LAVD-ENS14", "2") == "Common"
    # A real rarity from YGOPRODeck is always kept.
    assert rarity("LAVD-ENS14", "Ultra Rare") == "Ultra Rare"
    # Nothing documented: stored as it came, read as Unknown ("Sin documentar").
    assert rarities.canonical(rarity("BLMM-EN047", "New")) == "Unknown"
    assert rarity("BLMM-EN047", None) == "Unknown"


def test_the_migration_moves_printings_off_values_that_are_not_rarities(session):
    import importlib.util
    from uuid import uuid4

    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import select

    from app.core.config import ROOT
    from app.models import Card, CardPrinting, CardSet, Rarity

    card = Card(display_name="Speedroid Wing Synchron", card_type="Monster", subtypes=[])
    card_set = CardSet(source_key="LAVD", name="Legendary Arc-V Decks", language="en", market="TCG")
    two, new = Rarity(name="2"), Rarity(name="New")
    session.add_all([card, card_set, two, new])
    session.flush()

    def printing(code, rarity):
        row = CardPrinting(
            id=uuid4(),
            card_id=card.id,
            set_id=card_set.id,
            code=code,
            rarity_id=rarity.id,
            language="en",
            market="TCG",
        )
        session.add(row)
        return row

    fixed, unknown = printing("LAVD-ENS14", two), printing("LAVD-EN999", new)
    session.commit()

    path = ROOT / "backend/alembic/versions/023_rarity_placeholders.py"
    spec = importlib.util.spec_from_file_location("migration_023", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with session.bind.begin() as connection:
        # On Postgres each test has its own schema (tests/conftest.py); the
        # migration names its tables without one, as on the real database.
        schema = session.bind.get_execution_options().get("schema_translate_map", {}).get(None)
        if schema:
            connection.exec_driver_sql(f'SET LOCAL search_path TO "{schema}"')
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            migration.upgrade()  # running it again changes nothing
    session.expire_all()

    names = set(session.scalars(select(Rarity.name)))
    assert "2" not in names and "New" not in names
    assert session.get(CardPrinting, fixed.id).rarity.name == "Common"
    assert session.get(CardPrinting, unknown.id).rarity.name == "Unknown"
