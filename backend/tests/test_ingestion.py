from datetime import datetime, timezone

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from app.ingestion.normalizers import normalized_name, rarity_name
from app.models import (
    Archetype,
    BanlistEntry,
    Card,
    CardArchetype,
    CardErratum,
    CardImage,
    CardName,
    CardPrinting,
    CardSeries,
    CardTextVersion,
    DataConflict,
    FieldObservation,
    SourceReference,
)
from app.schemas.ingestion import (
    BanlistInput,
    ErratumInput,
    GroupInput,
    ImageInput,
    NameInput,
    TextInput,
)
from app.services.ingestion import IngestionService
from app.services.reconciliation import IdentityConflict


def count(session, model):
    return session.scalar(select(func.count()).select_from(model))


def test_normalization_preserves_accents_and_exact_identity():
    assert normalized_name("  DRAGÓN\u3000Azul  ") == "dragón azul"
    assert normalized_name("Dragon") != normalized_name("Dragón")
    assert rarity_name("UR") == "Ultra Rare"


def test_idempotent_insert_and_update(session, record):
    service = IngestionService(session)
    card = service.ingest(record)
    session.commit()
    observations = count(session, FieldObservation)
    assert service.ingest(record).id == card.id
    session.commit()
    assert (
        count(session, Card) == count(session, CardPrinting) == count(session, SourceReference) == 1
    )
    assert count(session, FieldObservation) == observations
    changed = record.model_copy(
        update={"atk": "3100", "fetched_at": datetime(2026, 2, 1, tzinfo=timezone.utc)}
    )
    assert service.ingest(changed).atk == "3100"
    session.commit()
    assert count(session, Card) == 1


@pytest.mark.parametrize("wiki_first", [False, True])
def test_official_fields_win_in_both_orders(session, record, wiki_record, wiki_first):
    wiki_record.atk = "9999"
    wiki_record.names = [NameInput(language="en", name="Community alias")]
    wiki_record.texts = [TextInput(language="en", text="Community text", current=True)]
    service = IngestionService(session)
    for incoming in [wiki_record, record] if wiki_first else [record, wiki_record]:
        card = service.ingest(incoming)
    session.commit()
    assert card.atk == "3000"
    assert card.display_name == "Synthetic Test Dragon"
    assert count(session, Card) == 1
    current = session.scalar(select(CardTextVersion).where(CardTextVersion.is_current.is_(True)))
    assert current.text == "Synthetic official test text."
    assert current.is_official
    assert count(session, DataConflict) >= 1


def test_stale_official_record_cannot_revert(session, record):
    service = IngestionService(session)
    service.ingest(
        record.model_copy(
            update={"atk": "3200", "fetched_at": datetime(2026, 3, 1, tzinfo=timezone.utc)}
        )
    )
    card = service.ingest(record)
    assert card.atk == "3200"


def test_names_are_not_universal_identifiers(session, record):
    service = IngestionService(session)
    first = service.ingest(record)
    other = record.model_copy(
        update={"konami_id": 990002, "external_id": "990002", "passcode": "99000002"}, deep=True
    )
    second = service.ingest(other)
    assert first.id != second.id
    assert count(session, Card) == 2


def test_name_only_match_is_rejected(session, record, wiki_record):
    service = IngestionService(session)
    service.ingest(record)
    wiki_record.konami_id = None
    wiki_record.passcode = None
    with pytest.raises(IdentityConflict):
        service.ingest(wiki_record)


def test_passcode_requires_corroboration_and_never_merges_different_cids(
    session, record, wiki_record
):
    service = IngestionService(session)
    card = service.ingest(record)
    wiki_record.konami_id = None
    assert service.ingest(wiki_record).id == card.id
    wiki_record.external_id = "other"
    wiki_record.konami_id = 990009
    with pytest.raises(IdentityConflict):
        service.ingest(wiki_record)


def test_source_mapping_cannot_change_card_identity(session, record, wiki_record):
    service = IngestionService(session)
    service.ingest(record)
    service.ingest(wiki_record)
    wiki_record.konami_id = 990099
    with pytest.raises(IdentityConflict):
        service.ingest(wiki_record)


def test_text_history_is_not_automatically_an_erratum(session, record, wiki_record):
    service = IngestionService(session)
    service.ingest(record)
    changed = record.model_copy(
        update={"fetched_at": datetime(2026, 2, 1, tzinfo=timezone.utc)}, deep=True
    )
    changed.texts = [
        TextInput(language="en", text="New synthetic official text", current=True),
        TextInput(language="es", text="Traducción sintética", current=True),
    ]
    service.ingest(changed)
    assert count(session, CardErratum) == 0
    wiki_record.errata = [
        ErratumInput(
            key="documented-1",
            language="en",
            old_text="Old documented text",
            new_text="New documented text",
            explanation="Synthetic documentation",
        )
    ]
    service.ingest(wiki_record)
    session.commit()
    assert count(session, CardErratum) == 1
    current = session.scalars(
        select(CardTextVersion).where(CardTextVersion.is_current.is_(True))
    ).all()
    assert len(current) == 2
    assert {text.language for text in current} == {"en", "es"}
    assert all(text.is_official for text in current)


def test_archetypes_series_and_support_are_separate(session, wiki_record):
    wiki_record.groups = [
        GroupInput(name="Synthetic Archetype", kind="archetype"),
        GroupInput(name="Synthetic Theme", kind="series"),
        GroupInput(name="Supported Archetype", kind="archetype", relation="supports"),
    ]
    IngestionService(session).ingest(wiki_record)
    session.commit()
    assert count(session, Archetype) == 2
    assert count(session, CardSeries) == 1
    assert set(session.scalars(select(CardArchetype.relation))) == {"member", "supports"}


def test_images_are_per_printing_and_never_approved_by_availability(session, wiki_record):
    original = wiki_record.printings[0]
    original.images = [
        ImageInput(
            file_title="File:Test-TST-EN-UR-1E.png",
            source_url="https://ms.yugipedia.com/test-ur.png",
        )
    ]
    other = original.model_copy(update={"rarity": "Super Rare", "images": []}, deep=True)
    wiki_record.printings.append(other)
    IngestionService(session).ingest(wiki_record)
    session.commit()
    assert count(session, CardPrinting) == 2
    assert count(session, CardImage) == 1
    image = session.scalar(select(CardImage))
    assert image.printing.rarity.name == "Ultra Rare"
    assert image.rights_status == "unverified"
    assert image.local_path is None


def test_unknown_printing_dimensions_do_not_accept_generic_image(session, wiki_record):
    wiki_record.printings[0].edition = "unknown"
    wiki_record.printings[0].images = [
        ImageInput(file_title="File:Generic.png", source_url="https://ms.yugipedia.com/generic.png")
    ]
    IngestionService(session).ingest(wiki_record)
    session.commit()
    assert count(session, CardImage) == 0
    assert session.scalar(select(DataConflict)).field == "image_mapping"


def test_rights_and_source_validation(record):
    with pytest.raises(ValidationError):
        ImageInput(
            file_title="File:Test.png",
            source_url="https://ms.yugipedia.com/test.png",
            rights_status="approved",
        )
    with pytest.raises(ValidationError):
        record.model_validate({**record.model_dump(), "external_id": "wrong"})


def test_only_official_banlists_are_applied(session, record, wiki_record):
    entry = BanlistInput(format="TCG", effective_date="2026-01-01", status="limited")
    record.banlist = [entry]
    service = IngestionService(session)
    service.ingest(record)
    wiki_record.banlist = [entry.model_copy(update={"status": "forbidden"})]
    service.ingest(wiki_record)
    assert session.scalar(select(BanlistEntry)).status == "limited"


def test_transaction_rollback_removes_all_partial_writes(factory, record):
    with pytest.raises(RuntimeError), factory.begin() as session:
        IngestionService(session).ingest(record)
        raise RuntimeError("simulate failed unit of work")
    with factory() as session:
        assert (
            count(session, Card) == count(session, CardName) == count(session, SourceReference) == 0
        )
