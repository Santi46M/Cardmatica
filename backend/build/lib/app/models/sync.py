from datetime import datetime
from uuid import UUID

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Entity


class SyncJob(Entity, Base):
    __tablename__ = "sync_jobs"
    source: Mapped[str] = mapped_column(String(40), index=True)
    mode: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    parameters: Mapped[dict] = mapped_column(JSON, default=dict)
    cursor: Mapped[dict] = mapped_column(JSON, default=dict)
    processed: Mapped[int] = mapped_column(Integer, default=0)
    failures: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    worker_id: Mapped[str | None] = mapped_column(String(64))

    @classmethod
    def requested(cls, request) -> "SyncJob":
        """A pending job for a JobRequest (from the admin API or the CLI)."""
        return cls(
            source=request.source,
            mode=request.mode,
            parameters=request.model_dump(mode="json"),
            cursor={"since": request.since.isoformat()} if request.since else {},
        )


class SyncError(Entity, Base):
    __tablename__ = "sync_errors"
    job_id: Mapped[UUID] = mapped_column(ForeignKey("sync_jobs.id"), index=True)
    source: Mapped[str] = mapped_column(String(40))
    external_id: Mapped[str | None] = mapped_column(String(200))
    code: Mapped[str] = mapped_column(String(80))
    message: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
