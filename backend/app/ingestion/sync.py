import asyncio
import hashlib
import logging
from datetime import timedelta
from uuid import UUID, uuid4

from sqlalchemy import or_, select, text

from app.core.config import get_settings
from app.db.base import utcnow
from app.db.session import session_factory
from app.ingestion.selection import pick_printings
from app.integrations.http import AccessDenied, PoliteHttpClient
from app.integrations.ygoprodeck.client import YgoprodeckClient
from app.integrations.yugipedia.client import YugipediaClient
from app.models import CardArtwork, CardImage, SyncError, SyncJob
from app.repositories.ingestion import conflict
from app.schemas.catalog import JobRequest
from app.schemas.ingestion import BanlistInput
from app.services.images import ImageService, eligible_images
from app.services.ingestion import IngestionService
from app.services.reconciliation import IdentityConflict

logger = logging.getLogger(__name__)


class SyncRunner:
    def __init__(self, factory=None, settings=None, clients=None):
        self.factory = factory or session_factory()
        self.settings = settings or get_settings()
        self.clients = clients or {}
        self.worker_id = str(uuid4())

    def enqueue(self, request: JobRequest):
        with self.factory.begin() as session:
            job = SyncJob.requested(request)
            session.add(job)
            session.flush()
            return job.id

    def pending(self):
        with self.factory() as session:
            return list(
                session.scalars(
                    select(SyncJob.id)
                    .where(
                        or_(
                            SyncJob.status == "pending",
                            (SyncJob.status == "running") & (SyncJob.lease_until < utcnow()),
                        )
                    )
                    .order_by(SyncJob.created_at)
                    .limit(100)
                )
            )

    async def run(self, job_id: UUID):
        with self.factory() as session:
            job = session.get(SyncJob, job_id)
            if not job:
                raise ValueError("Trabajo inexistente")
            source = job.source
        engine = self.factory.kw["bind"]
        connection = engine.connect()
        lock_id = int.from_bytes(hashlib.sha256(source.encode()).digest()[:7], "big")
        locked = False
        http = None
        try:
            if engine.dialect.name == "postgresql":
                locked = bool(
                    connection.scalar(text("SELECT pg_try_advisory_lock(:id)"), {"id": lock_id})
                )
                connection.commit()
                if not locked:
                    return False
            with self.factory.begin() as session:
                job = session.scalar(select(SyncJob).where(SyncJob.id == job_id).with_for_update())
                if job.status in {"completed", "completed_with_errors"} or (
                    job.status == "running" and job.lease_until and job.lease_until > utcnow()
                ):
                    return False
                job.status = "running"
                job.worker_id = self.worker_id
                job.started_at = job.started_at or utcnow()
                job.finished_at = None
                job.lease_until = utcnow() + timedelta(minutes=15)
                request = JobRequest.model_validate(job.parameters)
            client = self.clients.get(source)
            if client is None:
                http = PoliteHttpClient(source, self.settings)
                http.check_policy()
                client = YgoprodeckClient(http) if source == "ygoprodeck" else YugipediaClient(http)
            await self._process(job_id, request, client)
            return True
        except Exception as exc:
            logger.exception("sync_job=%s source=%s failed", job_id, source)
            with self.factory.begin() as session:
                job = session.get(SyncJob, job_id)
                job.status = "failed"
                job.failures += 1
                job.finished_at = utcnow()
                job.lease_until = None
                session.add(
                    SyncError(
                        job_id=job_id,
                        source=source,
                        code=type(exc).__name__,
                        message=str(exc)[:2000],
                        payload={"phase": "job"},
                    )
                )
            return False
        finally:
            if http:
                await http.close()
            if locked:
                connection.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": lock_id})
                connection.commit()
            connection.close()

    async def _process(self, job_id, request, client):
        checked = 0
        while True:
            with self.factory() as session:
                job = session.get(SyncJob, job_id)
                cursor = dict(job.cursor)
            pending = cursor.get("pending")
            if pending is None:
                if request.mode in {"card", "errata"}:
                    pending, following, done = [request.identifier], {}, True
                elif request.mode == "banlist":
                    pending = await client.banlist(
                        language=request.language,
                        format=request.banlist_format,
                        effective_date=request.effective_date,
                    )
                    following, done = {}, True
                elif request.mode == "images":
                    pending = [{"identifier": request.identifier, "mode": "images_metadata"}]
                    following, done = {}, True
                elif request.mode == "retry":
                    with self.factory() as session:
                        parent = session.get(SyncJob, request.retry_job_id)
                        if not parent or parent.source != request.source:
                            raise ValueError(
                                "El trabajo a reintentar debe existir y usar la misma fuente"
                            )
                        errors = session.scalars(
                            select(SyncError).where(
                                SyncError.job_id == request.retry_job_id,
                                SyncError.resolved_at.is_(None),
                                SyncError.external_id.is_not(None),
                            )
                        ).all()
                        pending = [
                            {
                                "identifier": error.external_id,
                                "error_id": str(error.id),
                                **error.payload,
                            }
                            for error in errors
                        ]
                    following, done = {}, True
                else:
                    pending, following, done = await client.batch(
                        cursor, language=request.language, incremental=request.mode == "incremental"
                    )
                cursor = {
                    **cursor,
                    "pending": pending,
                    "offset": 0,
                    "following": following,
                    "done": done,
                }
                self._checkpoint(job_id, cursor)
            index = cursor.get("offset", 0)
            while index < len(pending):
                if checked >= request.max_cards:
                    self._finish(job_id, "paused")
                    return
                item = pending[index]
                identifier = item["identifier"] if isinstance(item, dict) else item
                mode = item.get("mode", "card") if isinstance(item, dict) else request.mode
                try:
                    if mode == "artwork":
                        with self.factory.begin() as session:
                            artwork = session.get(CardArtwork, UUID(identifier))
                            await ImageService(self.settings, client).download_artwork(artwork)
                    elif mode == "images":
                        with self.factory.begin() as session:
                            image = session.get(CardImage, UUID(identifier))
                            await ImageService(self.settings, client).download(image)
                    else:
                        kwargs = (
                            {"include_images": mode == "images_metadata"}
                            if request.source == "yugipedia"
                            else {}
                        )
                        record = await client.card(
                            identifier,
                            request.language,
                            refresh=request.mode != "initial",
                            **kwargs,
                        )
                        if record is None and mode in {"card", "errata", "images_metadata"}:
                            raise ValueError(
                                "La página indicada no contiene una carta CardTable2 reconocida"
                            )
                        if record and request.max_printings:
                            record.printings = pick_printings(
                                record.printings, request.max_printings
                            )
                        if record and mode == "banlist":
                            record.banlist = [BanlistInput.model_validate(item["banlist"])]
                        if record and mode == "errata":
                            if request.source != "yugipedia":
                                raise ValueError(
                                    "La documentación de erratas comunitarias usa Yugipedia"
                                )
                            record.errata, limitations = await client.errata(
                                identifier, refresh=True
                            )
                            record.limitations.extend(limitations)
                        if record:
                            with self.factory.begin() as session:
                                card = IngestionService(session).ingest(record)
                                if mode == "images_metadata":
                                    if request.source == "ygoprodeck":
                                        pending.extend(
                                            {"identifier": str(image.id), "mode": "artwork"}
                                            for image in session.scalars(
                                                select(CardArtwork).where(
                                                    CardArtwork.card_id == card.id
                                                )
                                            )
                                        )
                                    else:
                                        pending.extend(
                                            {"identifier": str(image.id), "mode": "images"}
                                            for image in session.scalars(
                                                eligible_images(session, card.konami_id)
                                            )
                                        )
                    with self.factory.begin() as session:
                        job = session.get(SyncJob, job_id)
                        job.processed += 1
                        if isinstance(item, dict) and item.get("error_id"):
                            error = session.get(SyncError, UUID(item["error_id"]))
                            error.resolved_at = utcnow()
                except AccessDenied:
                    raise
                except Exception as exc:
                    logger.warning(
                        "sync_job=%s identifier=%s error=%s", job_id, identifier, type(exc).__name__
                    )
                    with self.factory.begin() as session:
                        job = session.get(SyncJob, job_id)
                        job.failures += 1
                        session.add(
                            SyncError(
                                job_id=job_id,
                                source=request.source,
                                external_id=str(identifier),
                                code=type(exc).__name__,
                                message=str(exc)[:2000],
                                payload={
                                    "mode": mode,
                                    **(
                                        {"banlist": item["banlist"]}
                                        if isinstance(item, dict) and "banlist" in item
                                        else {}
                                    ),
                                },
                            )
                        )
                        if isinstance(exc, IdentityConflict):
                            conflict(
                                session,
                                request.source,
                                "identity",
                                {"external_id": str(identifier), "reason": str(exc)},
                            )
                checked += 1
                index += 1
                cursor["offset"] = index
                self._checkpoint(job_id, cursor)
            if cursor.get("done"):
                with self.factory() as session:
                    failed = session.get(SyncJob, job_id).failures > 0
                self._finish(job_id, "completed_with_errors" if failed else "completed")
                return
            self._checkpoint(job_id, cursor["following"])

    def _checkpoint(self, job_id, cursor):
        with self.factory.begin() as session:
            job = session.get(SyncJob, job_id)
            job.cursor = dict(cursor)
            job.lease_until = utcnow() + timedelta(minutes=15)

    def _finish(self, job_id, status):
        with self.factory.begin() as session:
            job = session.get(SyncJob, job_id)
            job.status = status
            job.finished_at = utcnow()
            job.lease_until = None


async def worker(*, once=False, poll_seconds=5):
    runner = SyncRunner()
    while True:
        for job_id in runner.pending():
            await runner.run(job_id)
        if once:
            return
        await asyncio.sleep(poll_seconds)
