"""Which stored card a source record is about.

A record names its card by identifiers (Konami's CID, YGOPRODeck's id, the
source's own page) and, failing those, by passcode corroborated with a
localized name and the card type. Two identifiers that point to different
cards stop the import: cards are never merged by guesswork.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingestion.normalizers import normalized_name
from app.models import Card, CardName, DataSource, SourceReference
from app.repositories.ingestion import conflict, upsert
from app.schemas.ingestion import CardRecord


class IdentityConflict(ValueError):
    pass


def different_cid(card: Card, record: CardRecord) -> bool:
    """Both have an official CID, and they differ."""
    return bool(card.konami_id and record.konami_id and card.konami_id != record.konami_id)


def resolve_card(session: Session, record: CardRecord, source: DataSource) -> Card:
    existing = by_identifiers(session, record, source)
    if not existing and record.passcode:
        existing = by_passcode(session, record)
    if not existing:
        existing = new_card(session, record)
    # Serialize cross-source field selection for the same card.
    existing = session.scalar(select(Card).where(Card.id == existing.id).with_for_update())
    if not existing.konami_id and record.konami_id:
        existing.konami_id = record.konami_id
    if record.ygoprodeck_id:
        if existing.ygoprodeck_id and existing.ygoprodeck_id != record.ygoprodeck_id:
            raise IdentityConflict("No se fusionan identificadores de YGOPRODeck distintos")
        existing.ygoprodeck_id = record.ygoprodeck_id
    return existing


def by_identifiers(session: Session, record: CardRecord, source: DataSource) -> Card | None:
    """The card the CID, the YGOPRODeck id and the source's page agree on."""
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
            if (existing and provider_card.id != existing.id) or different_cid(
                provider_card, record
            ):
                raise IdentityConflict(
                    "El ID de YGOPRODeck y el CID corresponden a cartas distintas"
                )
            existing = provider_card
    reference = session.scalar(
        select(SourceReference).where(
            SourceReference.source_id == source.id,
            SourceReference.external_id == record.external_id,
            SourceReference.language == record.language,
        )
    )
    if reference:
        mapped = session.get(Card, reference.card_id)
        if (existing and existing.id != mapped.id) or different_cid(mapped, record):
            raise IdentityConflict(
                "El CID y la correspondencia de fuente apuntan a cartas distintas"
            )
        existing = mapped
    return existing


def by_passcode(session: Session, record: CardRecord) -> Card | None:
    """A card with the same passcode, if exactly one also shares a localized name and type."""
    candidates = session.scalars(select(Card).where(Card.passcode == record.passcode)).all()
    incoming = {(name.language, normalized_name(name.name)) for name in record.names}
    verified = [
        candidate
        for candidate in candidates
        if candidate.card_type == record.card_type
        and any(
            (name.language, name.normalized) in incoming
            for name in session.scalars(select(CardName).where(CardName.card_id == candidate.id))
        )
    ]
    if len(verified) == 1:
        if different_cid(verified[0], record):
            raise IdentityConflict("El passcode no permite fusionar CIDs oficiales diferentes")
        return verified[0]
    if candidates:
        raise IdentityConflict("Passcode ambiguo o sin corroboración por nombre localizado y tipo")
    return None


def new_card(session: Session, record: CardRecord) -> Card:
    """A card seen for the first time; it needs a CID or a YGOPRODeck id."""
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
    return upsert(session, Card, {**identity, "display_name": record.names[0].name}, list(identity))
