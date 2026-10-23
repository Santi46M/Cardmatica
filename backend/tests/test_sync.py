from datetime import date

from sqlalchemy import func, select

from app.ingestion.selection import pick_printings
from app.ingestion.sync import SyncRunner
from app.integrations.http import AccessDenied, ExternalError
from app.models import Card, CardPrinting, SyncError, SyncJob
from app.schemas.catalog import JobRequest
from app.schemas.ingestion import CardRecord, PrintingInput


class FixtureSource:
    def __init__(self, record):
        self.record = record
        self.calls = []
        self.fail = set()

    async def batch(self, cursor, **kwargs):
        return ["990001", "990002", "990003"], {}, True

    async def card(self, identifier, *args, **kwargs):
        self.calls.append(identifier)
        if identifier in self.fail:
            raise ExternalError("Simulated external failure")
        return CardRecord.model_validate(
            {
                **self.record.model_dump(),
                "source": "ygoprodeck",
                "ygoprodeck_id": int(identifier),
                "konami_id": int(identifier),
                "external_id": identifier,
                "passcode": identifier.zfill(8),
                "url": f"https://db.ygoprodeck.com/api/v7/cardinfo.php?id={identifier}",
            }
        )


async def test_checkpoint_resume_idempotence(factory, settings, record):
    source = FixtureSource(record)
    runner = SyncRunner(factory, settings, {"ygoprodeck": source})
    job_id = runner.enqueue(JobRequest(source="ygoprodeck", mode="initial", max_cards=1))
    assert await runner.run(job_id)
    with factory() as session:
        job = session.get(SyncJob, job_id)
        assert job.status == "paused"
        assert job.cursor["offset"] == 1
        assert session.scalar(select(func.count()).select_from(Card)) == 1
    assert await runner.run(job_id)
    assert source.calls == ["990001", "990002"]
    assert await runner.run(job_id)
    with factory() as session:
        assert session.get(SyncJob, job_id).status == "completed"
        assert session.scalar(select(func.count()).select_from(Card)) == 3
    assert not await runner.run(job_id)
    assert len(source.calls) == 3


async def test_failures_can_be_retried_without_duplicate_cards(factory, settings, record):
    source = FixtureSource(record)
    source.fail.add("990002")
    runner = SyncRunner(factory, settings, {"ygoprodeck": source})
    job_id = runner.enqueue(JobRequest(source="ygoprodeck", mode="initial", max_cards=10))
    await runner.run(job_id)
    with factory() as session:
        assert session.get(SyncJob, job_id).status == "completed_with_errors"
        assert session.scalar(select(SyncError)).external_id == "990002"
    source.fail.clear()
    retry_id = runner.enqueue(JobRequest(source="ygoprodeck", mode="retry", retry_job_id=job_id))
    await runner.run(retry_id)
    with factory() as session:
        assert session.get(SyncJob, retry_id).status == "completed"
        assert session.scalar(select(SyncError)).resolved_at is not None
        assert session.scalar(select(func.count()).select_from(Card)) == 3


async def test_policy_failure_is_persisted_without_network(factory, settings, monkeypatch):
    monkeypatch.setattr(settings, "ygoprodeck_enabled", False)
    runner = SyncRunner(factory, settings)
    job_id = runner.enqueue(JobRequest(source="ygoprodeck", mode="card", identifier="990001"))
    assert not await runner.run(job_id)
    with factory() as session:
        assert session.get(SyncJob, job_id).status == "failed"
        assert session.scalar(select(SyncError)).code == AccessDenied.__name__


async def test_record_transaction_rolls_back_on_sync_failure(factory, settings, record):
    source = FixtureSource(record)
    source.fail.add("990001")
    runner = SyncRunner(factory, settings, {"ygoprodeck": source})
    job_id = runner.enqueue(JobRequest(source="ygoprodeck", mode="card", identifier="990001"))
    await runner.run(job_id)
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(Card)) == 0
        assert session.get(SyncJob, job_id).failures == 1


def printing(code, rarity, released=None):
    return PrintingInput(
        code=code,
        set_key=code[:3],
        set_name=code[:3],
        rarity=rarity,
        language="en",
        market="TCG",
        set_release_date=released,
    )


def test_pick_printings_keeps_original_and_newest_other_rarity():
    printings = [
        printing("NEW-EN001", "Ultra Rare", date(2024, 1, 1)),
        printing("OLD-EN001", "Common", date(2002, 1, 1)),
        printing("MID-EN001", "Super Rare", date(2010, 1, 1)),
        printing("REP-EN001", "Common", date(2025, 1, 1)),
    ]
    chosen = pick_printings(printings, 2)
    assert [item.code for item in chosen] == ["OLD-EN001", "NEW-EN001"]
    assert len({item.rarity for item in chosen}) == 2
    # A card printed in a single rarity keeps one printing, never two of the same.
    assert len(pick_printings([printings[1], printings[3]], 2)) == 1
    assert pick_printings([], 2) == []


async def test_initial_sync_limits_printings_per_card(factory, settings, record):
    record = record.model_copy(
        update={
            "printings": [
                printing("AAA-EN001", "Common", date(2003, 1, 1)),
                printing("BBB-EN001", "Common", date(2005, 1, 1)),
                printing("CCC-EN001", "Secret Rare", date(2020, 1, 1)),
            ]
        }
    )
    runner = SyncRunner(factory, settings, {"ygoprodeck": FixtureSource(record)})
    job_id = runner.enqueue(
        JobRequest(source="ygoprodeck", mode="initial", max_cards=10, max_printings=2)
    )
    await runner.run(job_id)
    with factory() as session:
        codes = sorted(session.scalars(select(CardPrinting.code)).all())
    # Three cards, each with its original Common and the Secret Rare.
    assert codes.count("AAA-EN001") == 3 and codes.count("CCC-EN001") == 3
    assert "BBB-EN001" not in codes
