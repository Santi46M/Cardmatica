from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Entity, utcnow


class DataSource(Entity, Base):
    __tablename__ = "data_sources"
    slug: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    authority: Mapped[int] = mapped_column(Integer)
    policy_url: Mapped[str] = mapped_column(Text)


class SourceReference(Entity, Base):
    __tablename__ = "source_references"
    __table_args__ = (UniqueConstraint("source_id", "external_id", "language"),)
    source_id: Mapped[UUID] = mapped_column(ForeignKey("data_sources.id"), index=True)
    card_id: Mapped[UUID] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), index=True)
    external_id: Mapped[str] = mapped_column(String(200))
    language: Mapped[str] = mapped_column(String(12))
    url: Mapped[str] = mapped_column(Text)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    revision: Mapped[str | None] = mapped_column(String(100))
    content_hash: Mapped[str] = mapped_column(String(64))
    validation_status: Mapped[str] = mapped_column(String(40), default="validated_identifier")


class FieldObservation(Entity, Base):
    """An immutable observation; selected=False retains rejected/conflicting values."""

    __tablename__ = "field_observations"
    __table_args__ = (
        UniqueConstraint("reference_id", "entity_key", "field", "value_hash"),
        Index("ix_observations_entity_field", "entity_key", "field"),
    )
    reference_id: Mapped[UUID] = mapped_column(ForeignKey("source_references.id"), index=True)
    entity_key: Mapped[str] = mapped_column(String(200))
    source_url: Mapped[str | None] = mapped_column(Text)
    field: Mapped[str] = mapped_column(String(100))
    value: Mapped[dict] = mapped_column(JSON)
    value_hash: Mapped[str] = mapped_column(String(64))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    selected: Mapped[bool] = mapped_column(default=False)
    status: Mapped[str] = mapped_column(String(40))


class DataConflict(Entity, Base):
    __tablename__ = "data_conflicts"
    __table_args__ = (UniqueConstraint("fingerprint"),)
    card_id: Mapped[UUID | None] = mapped_column(ForeignKey("cards.id"), index=True)
    source_slug: Mapped[str] = mapped_column(String(40))
    fingerprint: Mapped[str] = mapped_column(String(64))
    field: Mapped[str] = mapped_column(String(100))
    details: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(30), default="open")
