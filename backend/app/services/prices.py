from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, select

from app.models import CardPrinting, PriceObservation, Rarity
from app.schemas.catalog import PriceHistoryView, PriceObservationInput, PricePoint

MAX_POINTS = 5000


def as_utc(value: datetime) -> datetime:
    # SQLite (test adapter) returns naive values; everything is stored in UTC.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def point(observation, printing, rarity) -> PricePoint:
    return PricePoint(
        printing_id=printing.id,
        code=printing.code,
        rarity=rarity,
        language=printing.language,
        edition=printing.edition,
        observed_at=as_utc(observation.observed_at),
        price=observation.price,
        currency=observation.currency,
        quantity=observation.quantity,
        condition=observation.condition,
    )


def price_history(
    session, card_id, *, market=None, printing_id=None, days=365, now=None
) -> PriceHistoryView:
    """Sales recorded on Cardmática. The last sale ignores the window on purpose:
    a card nobody is selling still shows when and for how much it last sold."""
    now = now or datetime.now(timezone.utc)
    base = (
        select(PriceObservation, CardPrinting, Rarity.name)
        .join(CardPrinting, PriceObservation.printing_id == CardPrinting.id)
        .join(Rarity, CardPrinting.rarity_id == Rarity.id)
        .where(CardPrinting.card_id == card_id)
    )
    if market:
        base = base.where(CardPrinting.market == market)
    if printing_id:
        base = base.where(CardPrinting.id == printing_id)
    last = session.execute(
        base.order_by(PriceObservation.observed_at.desc(), PriceObservation.id).limit(1)
    ).first()
    rows = session.execute(
        base.where(PriceObservation.observed_at >= now - timedelta(days=days))
        .order_by(PriceObservation.observed_at, PriceObservation.id)
        .limit(MAX_POINTS)
    ).all()
    return PriceHistoryView(
        card_id=card_id,
        market=market,
        printing_id=printing_id,
        days=days,
        points=[point(*row) for row in rows],
        last_sale=point(*last) if last else None,
    )


def record_sale(session, data: PriceObservationInput) -> PricePoint | None:
    printing = session.get(CardPrinting, data.printing_id)
    if not printing:
        return None
    row = PriceObservation(
        printing_id=printing.id,
        observed_at=data.observed_at.astimezone(timezone.utc),
        price=data.price,
        currency=data.currency,
        quantity=data.quantity,
        condition=data.condition,
        source_reference=data.source_reference,
    )
    session.add(row)
    session.flush()
    rarity = session.scalar(select(Rarity.name).where(Rarity.id == printing.rarity_id))
    return point(row, printing, rarity)


def last_sales(session, card_ids, market=None) -> dict:
    """Latest sale per card for a page of the catalogue, in one query."""
    if not card_ids:
        return {}
    scope = [CardPrinting.card_id.in_(card_ids)]
    if market:
        scope.append(CardPrinting.market == market)
    latest = (
        select(CardPrinting.card_id, func.max(PriceObservation.observed_at).label("at"))
        .join(PriceObservation, PriceObservation.printing_id == CardPrinting.id)
        .where(*scope)
        .group_by(CardPrinting.card_id)
        .subquery()
    )
    rows = session.execute(
        select(PriceObservation, CardPrinting, Rarity.name)
        .join(CardPrinting, PriceObservation.printing_id == CardPrinting.id)
        .join(Rarity, CardPrinting.rarity_id == Rarity.id)
        .join(
            latest,
            and_(
                CardPrinting.card_id == latest.c.card_id,
                PriceObservation.observed_at == latest.c.at,
            ),
        )
        .where(*scope)
        .order_by(PriceObservation.id)
    ).all()
    result = {}
    for observation, printing, rarity in rows:
        result.setdefault(printing.card_id, point(observation, printing, rarity))
    return result
