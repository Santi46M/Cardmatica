""" "Para vos" on the home page: the cards a person opened lately, and others
like them — members of the same archetypes, or printed in the same sets.

Everything starts from that person's own list of opened cards (their browser's,
or their account's), so each person sees their own; nothing is chosen by hand.
"""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Card, CardArchetype, CardPrinting
from app.repositories.catalog import in_market, printing_loads


def _load(session: Session, ids: list[UUID], market: str | None) -> list[Card]:
    """These cards, in this order, with what a tile needs."""
    if not ids:
        return []
    query = (
        select(Card)
        .where(Card.id.in_(ids))
        .options(
            selectinload(Card.names),
            selectinload(Card.artworks),
            selectinload(Card.printings).options(*printing_loads()),
        )
    )
    if market:
        query = query.where(in_market(market))
    found = {card.id: card for card in session.scalars(query)}
    return [found[card_id] for card_id in ids if card_id in found]


def _ranked(session: Session, shared, exclude: set[UUID], market: str | None, limit: int):
    """Card ids by how much they share with the viewed ones (most first), then name."""
    query = (
        select(shared.c.card_id)
        .join(Card, Card.id == shared.c.card_id)
        .where(shared.c.card_id.not_in(exclude))
        .group_by(shared.c.card_id, Card.display_name)
        .order_by(func.count().desc(), Card.display_name)
        .limit(limit)
    )
    if market:
        query = query.where(in_market(market))
    return list(session.scalars(query))


def for_you(session: Session, viewed: list[UUID], market: str | None, limit: int = 12):
    """(recent, same archetypes, same sets) as lists of cards."""
    recent = _load(session, list(dict.fromkeys(viewed)), market)
    seen = {card.id for card in recent}
    if not recent:
        return [], [], []
    archetypes = select(CardArchetype.archetype_id).where(
        CardArchetype.card_id.in_(seen), CardArchetype.relation == "member"
    )
    same_archetype = (
        select(CardArchetype.card_id)
        .where(CardArchetype.archetype_id.in_(archetypes), CardArchetype.relation == "member")
        .subquery()
    )
    related = _ranked(session, same_archetype, seen, market, limit)
    sets = select(CardPrinting.set_id).where(CardPrinting.card_id.in_(seen))
    if market:
        sets = sets.where(CardPrinting.market == market)
    same_set = select(CardPrinting.card_id).where(CardPrinting.set_id.in_(sets)).subquery()
    printed_together = _ranked(session, same_set, seen | set(related), market, limit)
    return (
        recent,
        _load(session, related, market),
        _load(session, printed_together, market),
    )
