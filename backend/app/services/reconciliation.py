from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingestion.normalizers import normalized_name
from app.models import Card, CardName, DataSource, SourceReference
from app.repositories.ingestion import conflict, upsert
from app.schemas.ingestion import CardRecord


class IdentityConflict(ValueError):
    pass


def resolve_card(session: Session, record: CardRecord, source: DataSource) -> Card:
    reference = session.scalar(
        select(SourceReference).where(
            SourceReference.source_id == source.id,
            SourceReference.external_id == record.external_id,
            SourceReference.language == record.language,
        )
    )
    existing = (
        session.scalar(select(Card).where(Card.konami_id == record.konami_id))
        if record.konami_id
        else None
    )
    if record.ygoprodeck_id:
        provider_card = session.scalar(
            select(Card).where(Card.ygoprodeck_id == record.ygoprodeck_id)
        )
        if provider_card:
            if (existing and provider_card.id != existing.id) or (
                provider_card.konami_id
                and record.konami_id
                and provider_card.konami_id != record.konami_id
            ):
                raise IdentityConflict(
                    "El ID de YGOPRODeck y el CID corresponden a cartas distintas"
                )
            existing = provider_card
    if reference:
        mapped = session.get(Card, reference.card_id)
        if (existing and existing.id != mapped.id) or (
            mapped.konami_id and record.konami_id and mapped.konami_id != record.konami_id
        ):
            raise IdentityConflict(
                "El CID y la correspondencia de fuente apuntan a cartas distintas"
            )
        existing = mapped
    if not existing and record.passcode:
        candidates = session.scalars(select(Card).where(Card.passcode == record.passcode)).all()
        verified = []
        for candidate in candidates:
            names = session.scalars(select(CardName).where(CardName.card_id == candidate.id)).all()
            agrees = any(
                n.language == incoming.language and n.normalized == normalized_name(incoming.name)
                for n in names
                for incoming in record.names
            )
            if agrees and candidate.card_type == record.card_type:
                verified.append(candidate)
        if len(verified) == 1:
            candidate = verified[0]
            if candidate.konami_id and record.konami_id and candidate.konami_id != record.konami_id:
                raise IdentityConflict("El passcode no permite fusionar CIDs oficiales diferentes")
            existing = candidate
        elif candidates:
            raise IdentityConflict(
                "Passcode ambiguo o sin corroboración por nombre localizado y tipo"
            )
    if not existing:
        if not record.konami_id and not record.ygoprodeck_id:
            conflict(
                session,
                record.source,
                "identity",
                {
                    "external_id": record.external_id,
                    "reason": "Sin CID ni correspondencia corroborada; requiere revisión",
                },
            )
            raise IdentityConflict("No se vinculan cartas solo por similitud de nombre")
        identity = (
            {"konami_id": record.konami_id}
            if record.konami_id
            else {"ygoprodeck_id": record.ygoprodeck_id}
        )
        existing = upsert(
            session,
            Card,
            {**identity, "display_name": record.names[0].name},
            list(identity),
        )
    # Serialize cross-source field selection for the same card.
    existing = session.scalar(select(Card).where(Card.id == existing.id).with_for_update())
    if not existing.konami_id and record.konami_id:
        existing.konami_id = record.konami_id
    if record.ygoprodeck_id:
        if existing.ygoprodeck_id and existing.ygoprodeck_id != record.ygoprodeck_id:
            raise IdentityConflict("No se fusionan identificadores de YGOPRODeck distintos")
        existing.ygoprodeck_id = record.ygoprodeck_id
    return existing
