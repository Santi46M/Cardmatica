from datetime import timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.ingestion.normalizers import digest
from app.models import DataConflict, DataSource, FieldObservation, SourceReference


def upsert(session: Session, model, values: dict, keys: list[str]):
    """Atomic conflict handling. Never overwrites a higher-authority value."""
    dialect = session.get_bind().dialect.name
    insert = pg_insert if dialect == "postgresql" else sqlite_insert
    statement = insert(model).values(**values).on_conflict_do_nothing(index_elements=keys)
    session.execute(statement)
    return session.scalar(select(model).filter_by(**{key: values[key] for key in keys}))


def conflict(session: Session, source: str, field: str, details: dict, card_id=None):
    return upsert(
        session,
        DataConflict,
        {
            "card_id": card_id,
            "source_slug": source,
            "field": field,
            "details": details,
            "fingerprint": digest([str(card_id), source, field, details]),
        },
        ["fingerprint"],
    )


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class ProvenanceRepository:
    def __init__(self, session: Session, reference: SourceReference, source: DataSource):
        self.session = session
        self.reference = reference
        self.source = source

    def select_value(self, entity_key: str, field: str, value, source_url=None) -> bool:
        if value is None or value == "" or value == []:
            return False
        current = self.session.execute(
            select(FieldObservation, SourceReference, DataSource)
            .join(SourceReference, FieldObservation.reference_id == SourceReference.id)
            .join(DataSource, SourceReference.source_id == DataSource.id)
            .where(
                FieldObservation.entity_key == entity_key,
                FieldObservation.field == field,
                FieldObservation.selected.is_(True),
            )
        ).first()
        accepted = True
        status = (
            "official"
            if self.source.slug == "konami"
            else ("provider" if self.source.slug == "ygoprodeck" else "community")
        )
        if current:
            observation, _, old_source = current
            accepted = self.source.authority > old_source.authority or (
                self.source.authority == old_source.authority
                and aware(self.reference.fetched_at) >= aware(observation.observed_at)
            )
            if observation.value != {"value": value} and old_source.id != self.source.id:
                conflict(
                    self.session,
                    self.source.slug,
                    field,
                    {
                        "entity": entity_key,
                        "selected": observation.value,
                        "incoming": value,
                        "selected_source": old_source.slug,
                    },
                    self.reference.card_id,
                )
            if accepted:
                observation.selected = False
        incoming = upsert(
            self.session,
            FieldObservation,
            {
                "reference_id": self.reference.id,
                "entity_key": entity_key,
                "source_url": str(source_url or self.reference.url),
                "field": field,
                "value": {"value": value},
                "value_hash": digest(value),
                "observed_at": self.reference.fetched_at,
                "selected": accepted,
                "status": status if accepted else "rejected_precedence",
            },
            ["reference_id", "entity_key", "field", "value_hash"],
        )
        if accepted:
            incoming.selected = True
            incoming.observed_at = self.reference.fetched_at
            incoming.source_url = str(source_url or self.reference.url)
            incoming.status = status
        self.session.flush()
        return accepted
