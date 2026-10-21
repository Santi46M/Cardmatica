from datetime import datetime, timezone

from app.integrations.yugipedia.parser import parse_errata
from app.models import Archetype, CardArchetype, FieldObservation
from app.schemas.ingestion import GroupInput
from app.services.ingestion import IngestionService
from sqlalchemy import func, select


def test_complete_snapshot_retires_membership_and_keeps_observations(session, wiki_record):
    service = IngestionService(session)
    wiki_record.groups = [GroupInput(name="Synthetic Archetype", kind="archetype")]
    wiki_record.groups_complete = True
    service.ingest(wiki_record)
    assert session.scalar(select(func.count()).select_from(CardArchetype)) == 1
    wiki_record.groups = []
    wiki_record.fetched_at = datetime(2026, 3, 1, tzinfo=timezone.utc)
    service.ingest(wiki_record)
    assert session.scalar(select(func.count()).select_from(CardArchetype)) == 0
    assert session.scalar(select(func.count()).select_from(Archetype)) == 1
    assert session.scalar(select(func.count()).select_from(FieldObservation)) > 0


def test_whitespace_differences_do_not_become_errata():
    html = "<table><tr><th>Language</th><th>Old text</th><th>New text</th></tr><tr><td>en</td><td>Same  text</td><td>Same text</td></tr></table>"
    assert parse_errata(html)[0] == []
