"""Printing pictures, from most to least specific: the exact scan, then general artwork."""

from sqlalchemy import select

from app.integrations.yugipedia.images import match_scan
from app.models import CardPrinting
from app.schemas.ingestion import ImageInput, PrintingInput
from app.services.catalog import printing_view
from app.services.ingestion import IngestionService


def test_scans_with_modern_rarities_and_ocg_scans_without_edition(wiki_record):
    wiki_record.printings = [
        PrintingInput(
            code="TST-JP001",
            set_key="Synthetic OCG Set",
            set_name="Synthetic OCG Set",
            rarity="QCScR",
            language="ja",
            market="OCG",
        ),
        PrintingInput(
            code="TST-EN001",
            set_key="Synthetic Test Set",
            set_name="Synthetic Test Set",
            rarity="Quarter Century Secret Rare",
            language="en",
            market="TCG",
        ),
    ]
    info = {"url": "https://ms.yugipedia.com/synthetic.png"}
    ocg = match_scan(wiki_record, "File:SyntheticTestDragon-TST-JP-QCScR.png", info)
    assert ocg and ocg.code == "TST-JP001" and ocg.edition == "not_applicable"
    tcg = match_scan(wiki_record, "File:SyntheticTestDragon-TST-EN-QCScR-1E.png", info)
    assert tcg and tcg.code == "TST-EN001" and tcg.edition == "1st"
    # A TCG scan still needs its edition, and an unknown rarity never matches.
    assert match_scan(wiki_record, "File:SyntheticTestDragon-TST-EN-QCScR.png", info) is None
    assert match_scan(wiki_record, "File:SyntheticTestDragon-TST-EN-ZZZ-1E.png", info) is None


def test_a_scan_says_where_it_comes_from_and_needs_a_permission(session, wiki_record):
    wiki_record.printings[0].images = [
        ImageInput(
            file_title="File:SyntheticTestDragon-TST-EN-UR-1E.png",
            source_url="https://ms.yugipedia.com/synthetic.png",
        )
    ]
    IngestionService(session).ingest(wiki_record)
    view = printing_view(session.scalar(select(CardPrinting))).images[0]
    assert view.source == "yugipedia"
    # Without a documented permission it is not offered: the general artwork is shown.
    assert view.url is None and view.fallback_reason == "Derechos comerciales no verificados"
