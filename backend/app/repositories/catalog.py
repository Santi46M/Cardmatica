from sqlalchemy import Text, exists, func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models import Archetype, Card, CardArchetype, CardName, CardPrinting, CardSet, Rarity


def printing_loads():
    return (
        joinedload(CardPrinting.card_set),
        joinedload(CardPrinting.rarity),
        selectinload(CardPrinting.images),
    )


class CatalogRepository:
    def __init__(self, session: Session):
        self.session = session

    def cards(
        self,
        *,
        page=1,
        page_size=24,
        q=None,
        market=None,
        card_type=None,
        subtype=None,
        rarity=None,
        set_id=None,
        archetype_id=None,
        product_type=None,
        sort="name",
        language="es",
    ):
        query = select(Card)
        conditions = [CardPrinting.card_id == Card.id]
        if market:
            conditions.append(CardPrinting.market == market)
        if rarity:
            conditions.append(Rarity.name == rarity)
        if set_id:
            conditions.append(CardPrinting.set_id == set_id)
        if product_type:
            conditions.append(CardSet.product_type == product_type)
        printing_query = (
            select(1).select_from(CardPrinting).join(CardSet).join(Rarity).where(*conditions)
        )
        if market or rarity or set_id or product_type:
            query = query.where(exists(printing_query))
        if card_type:
            query = query.where(Card.card_type == card_type)
        if subtype:
            query = query.where(
                Card.subtypes.cast(Text).contains('"' + subtype + '"', autoescape=True)
            )
        if archetype_id:
            query = query.where(
                exists(
                    select(1)
                    .select_from(CardArchetype)
                    .where(
                        CardArchetype.card_id == Card.id,
                        CardArchetype.archetype_id == archetype_id,
                        CardArchetype.relation == "member",
                    )
                )
            )
        if q:
            query = query.where(
                or_(
                    exists(
                        select(1).where(
                            CardName.card_id == Card.id, CardName.name.icontains(q, autoescape=True)
                        )
                    ),
                    exists(
                        printing_query.where(
                            or_(
                                CardPrinting.code.icontains(q, autoescape=True),
                                CardSet.name.icontains(q, autoescape=True),
                                Rarity.name.icontains(q, autoescape=True),
                            )
                        )
                    ),
                    exists(
                        select(1)
                        .select_from(CardArchetype)
                        .join(Archetype)
                        .where(
                            CardArchetype.card_id == Card.id,
                            CardArchetype.relation == "member",
                            Archetype.name.icontains(q, autoescape=True),
                        )
                    ),
                    Card.card_type.icontains(q, autoescape=True),
                )
            )
        total = self.session.scalar(select(func.count()).select_from(query.subquery()))
        if sort == "updated":
            ordering = (Card.updated_at.desc(), Card.id)
        else:
            localized = (
                select(CardName.name)
                .where(
                    CardName.card_id == Card.id,
                    CardName.language == language,
                    CardName.is_current.is_(True),
                )
                .order_by(CardName.is_official.desc(), CardName.name)
                .limit(1)
                .scalar_subquery()
            )
            name_order = func.lower(func.coalesce(localized, Card.display_name))
            ordering = (name_order.desc() if sort == "name_desc" else name_order.asc(), Card.id)
        cards = self.session.scalars(
            query.options(
                selectinload(Card.names), selectinload(Card.printings).options(*printing_loads())
            )
            .order_by(*ordering)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return cards, total

    def card(self, identifier):
        return self.session.scalar(
            select(Card)
            .where(Card.id == identifier)
            .options(
                selectinload(Card.names), selectinload(Card.printings).options(*printing_loads())
            )
        )

    def printings(self, card_id, *, page=1, page_size=24, market=None):
        query = select(CardPrinting).where(CardPrinting.card_id == card_id)
        if market:
            query = query.where(CardPrinting.market == market)
        total = self.session.scalar(select(func.count()).select_from(query.subquery()))
        rows = self.session.scalars(
            query.options(*printing_loads())
            .order_by(
                CardPrinting.release_date.desc().nullslast(), CardPrinting.code, CardPrinting.id
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return rows, total
