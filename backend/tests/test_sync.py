from app.ingestion.sync import SyncRunner
from app.integrations.http import AccessDenied, ExternalError
from app.models import Card, SyncError, SyncJob
from app.schemas.catalog import JobRequest
from app.schemas.ingestion import CardRecord
from sqlalchemy import func, select


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
                "konami_id": int(identifier),
                "external_id": identifier,
                "passcode": identifier.zfill(8),
                "url": f"https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid={identifier}",
            }
        )


async def test_checkpoint_resume_idempotence(factory, settings, record):
    source = FixtureSource(record)
    runner = SyncRunner(factory, settings, {"konami": source})
    job_id = runner.enqueue(JobRequest(source="konami", mode="initial", max_cards=1))
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
    runner = SyncRunner(factory, settings, {"konami": source})
    job_id = runner.enqueue(JobRequest(source="konami", mode="initial", max_cards=10))
    await runner.run(job_id)
    with factory() as session:
        assert session.get(SyncJob, job_id).status == "completed_with_errors"
        assert session.scalar(select(SyncError)).external_id == "990002"
    source.fail.clear()
    retry_id = runner.enqueue(JobRequest(source="konami", mode="retry", retry_job_id=job_id))
    await runner.run(retry_id)
    with factory() as session:
        assert session.get(SyncJob, retry_id).status == "completed"
        assert session.scalar(select(SyncError)).resolved_at is not None
        assert session.scalar(select(func.count()).select_from(Card)) == 3


async def test_policy_failure_is_persisted_without_network(factory, settings):
    runner = SyncRunner(factory, settings)
    job_id = runner.enqueue(JobRequest(source="konami", mode="card", identifier="990001"))
    assert not await runner.run(job_id)
    with factory() as session:
        assert session.get(SyncJob, job_id).status == "failed"
        assert session.scalar(select(SyncError)).code == AccessDenied.__name__


async def test_record_transaction_rolls_back_on_sync_failure(factory, settings, record):
    source = FixtureSource(record)
    source.fail.add("990001")
    runner = SyncRunner(factory, settings, {"konami": source})
    job_id = runner.enqueue(JobRequest(source="konami", mode="card", identifier="990001"))
    await runner.run(job_id)
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(Card)) == 0
        assert session.get(SyncJob, job_id).failures == 1
