from sqlalchemy import Text, case, exists, func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models import Archetype, Card, CardArchetype, CardName, CardPrinting, CardSet, Rarity


def printing_loads():
    return (
        joinedload(CardPrinting.card_set),
        joinedload(CardPrinting.rarity),
        selectinload(CardPrinting.images),
    )


def in_market(market):
    """Cards sold in a market: listed for it, or with a printing there."""
    return or_(
        Card.available_markets.cast(Text).contains('"' + market + '"', autoescape=True),
        exists(select(1).where(CardPrinting.card_id == Card.id, CardPrinting.market == market)),
    )


# A printing code has letters, digits and a hyphen ("LOB-EN001", "RA03-SP").
def looks_like_code(text):
    return "-" in text and " " not in text.strip()


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
        frame=None,
        ability=None,
        race=None,
        attribute=None,
        level=None,
        card_property=None,
        rarity_names=None,
        set_id=None,
        archetype_id=None,
        product_type=None,
        sort="name",
        language="es",
    ):
        query = select(Card)
        printing_filters = []
        if market:
            printing_filters.append(CardPrinting.market == market)
        # Every stored spelling of the chosen rarity or family (app/services/rarities.py).
        if rarity_names is not None:
            printing_filters.append(Rarity.name.in_(rarity_names))
        if set_id:
            printing_filters.append(CardPrinting.set_id == set_id)
        if product_type:
            printing_filters.append(CardSet.product_type == product_type)
        printing_query = (
            select(1)
            .select_from(CardPrinting)
            .join(CardSet)
            .join(Rarity)
            .where(CardPrinting.card_id == Card.id, *printing_filters)
        )
        if market:
            query = query.where(in_market(market))
        if rarity_names is not None or set_id or product_type:
            # Evaluated once for the whole query. A per-card EXISTS made the planner
            # walk every printing of a common rarity for each card (seconds, not ms).
            matching_cards = (
                select(CardPrinting.card_id).join(CardSet).join(Rarity).where(*printing_filters)
            )
            query = query.where(Card.id.in_(matching_cards))
        if card_type:
            query = query.where(Card.card_type == card_type)
        if subtype:
            query = query.where(
                Card.subtypes.cast(Text).contains('"' + subtype + '"', autoescape=True)
            )
        # Type levels (app/services/card_types.py). "Pendulum" is a flag on top
        # of a frame, so it is filtered on its own column.
        if frame == "Pendulum":
            query = query.where(Card.is_pendulum.is_(True))
        elif frame:
            query = query.where(Card.monster_frame == frame)
        if ability:
            query = query.where(
                Card.monster_abilities.cast(Text).contains('"' + ability + '"', autoescape=True)
            )
        if race:
            query = query.where(Card.monster_race == race)
        if attribute:
            query = query.where(Card.attribute == attribute)
        if level is not None:
            query = query.where(
                or_(Card.level == level, Card.rank == level, Card.link_rating == level)
            )
        if card_property:
            query = query.where(Card.card_property == card_property)
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
                    # In a name, every word counts, in any order.
                    exists(
                        select(1).where(
                            CardName.card_id == Card.id,
                            *(CardName.name.icontains(word, autoescape=True) for word in q.split()),
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
                selectinload(Card.names),
                selectinload(Card.artworks),
                selectinload(Card.printings).options(*printing_loads()),
            )
            .order_by(*ordering)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return cards, total

    def suggestions(self, q, *, market=None, limit=6):
        """Cards for the search box. Every word typed must appear in the name, in
        any order ("dragón azul" finds "Dragón Blanco de Ojos Azules"). Names that
        start with the text come first, then names with a word that starts with
        it, then the rest; shorter names first. A printing code finds its card
        by prefix."""
        if looks_like_code(q):
            matches = (
                select(
                    CardPrinting.card_id,
                    func.min(0).label("rank"),
                    func.min(func.length(CardPrinting.code)).label("length"),
                )
                .where(CardPrinting.code.istartswith(q, autoescape=True))
                .group_by(CardPrinting.card_id)
            )
        else:
            name = func.lower(CardName.name)
            needle = q.lower()
            rank = case(
                (name.startswith(needle, autoescape=True), 0),
                (name.contains(" " + needle, autoescape=True), 1),
                else_=2,
            )
            matches = (
                select(
                    CardName.card_id,
                    func.min(rank).label("rank"),
                    func.min(func.length(CardName.name)).label("length"),
                )
                .where(
                    CardName.is_current.is_(True),
                    *(CardName.name.icontains(word, autoescape=True) for word in q.split()),
                )
                .group_by(CardName.card_id)
            )
        matches = matches.subquery()
        query = select(Card).join(matches, matches.c.card_id == Card.id)
        if market:
            query = query.where(in_market(market))
        return self.session.scalars(
            query.options(
                selectinload(Card.names),
                selectinload(Card.artworks),
                selectinload(Card.printings).options(*printing_loads()),
            )
            .order_by(matches.c.rank, matches.c.length, Card.display_name)
            .limit(limit)
        ).all()

    def card(self, identifier):
        return self.session.scalar(
            select(Card)
            .where(Card.id == identifier)
            .options(
                selectinload(Card.names),
                selectinload(Card.artworks),
                selectinload(Card.printings).options(*printing_loads()),
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
