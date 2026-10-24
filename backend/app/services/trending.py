"""Cards in fashion, for the home page: each list from what the catalogue knows.

    price_drops       last completed sale below the median of the previous ones
    back_in_play      a newer Forbidden & Limited List lifts or eases the card
    most_wanted       in the lists of deseados of several people (counted, never shown who)
    reprints          a new printing years after the card was last printed
    notable_printings recent printings in a high rarity (not the basic family)

Nothing is estimated or taken from outside sources: a list with no data is left
out, so a new catalogue may show only some of them.
"""

from datetime import date, datetime, time, timedelta, timezone
from statistics import median

from sqlalchemy import distinct, func, select
from sqlalchemy.orm import selectinload

from app.models import (
    BanlistList,
    BanlistListEntry,
    Card,
    CardName,
    CardPrinting,
    CardSet,
    PriceObservation,
)
from app.models.accounts import WantlistItem
from app.repositories.catalog import printing_loads
from app.services import rarities

# Recent means released in this window, ending today (or at the newest
# release the catalogue has, if it is older).
RECENT_DAYS = 180
# A reprint counts when the previous printing was at least this many years older.
REPRINT_GAP_YEARS = 3
# A price drop: at least this much below the median of at least this many sales.
PRICE_DROP = 0.10
PRICE_MIN_SALES = 3
PRICE_DAYS = 90
# Wanted by at least this many different lists, so no single person shows.
WANTED_MIN_LISTS = 2
STATUS_ORDER = {"forbidden": 0, "limited": 1, "semi_limited": 2, "unlimited": 3}


# A printing's release date: its own, or its set's.
RELEASED = func.coalesce(CardPrinting.release_date, CardSet.release_date)


def _recent_window(session, market, today):
    newest = session.scalar(
        select(func.max(RELEASED))
        .select_from(CardPrinting)
        .join(CardSet)
        .where(CardPrinting.market == market, RELEASED <= today)
    )
    end = min(today, newest) if newest else today
    return end - timedelta(days=RECENT_DAYS), end


def notable_printings(session, market, today, limit):
    start, end = _recent_window(session, market, today)
    rows = session.execute(
        select(CardPrinting, RELEASED)
        .join(CardSet)
        .where(CardPrinting.market == market, RELEASED.between(start, end))
        .options(*printing_loads())
    ).all()
    found, seen = [], set()
    # Higher rarities first among the same release.
    rows.sort(key=lambda row: (row[1], rarities.info(row[0].rarity.name).rank), reverse=True)
    for printing, when in rows:
        info = rarities.info(printing.rarity.name)
        ordinary = info.family == "basic" and info.name != "Secret Rare"
        if ordinary or printing.card_id in seen:
            continue
        seen.add(printing.card_id)
        found.append(
            (
                printing.card_id,
                {
                    "rarity": info.name,
                    "rarity_family": info.family,
                    "code": printing.code,
                    "set_name": printing.card_set.name,
                    "released": when.isoformat(),
                },
            )
        )
        if len(found) == limit:
            break
    return found


def reprints(session, market, today, limit):
    start, end = _recent_window(session, market, today)
    newest = (
        select(CardPrinting.card_id)
        .join(CardSet)
        .where(CardPrinting.market == market, RELEASED <= end)
        .group_by(CardPrinting.card_id)
        .having(func.max(RELEASED).between(start, end))
    )
    dates = {}
    for card_id, released in session.execute(
        select(CardPrinting.card_id, RELEASED)
        .join(CardSet)
        .where(CardPrinting.card_id.in_(newest), CardPrinting.market == market, RELEASED <= end)
    ):
        dates.setdefault(card_id, set()).add(released)
    found = []
    for card_id, released in dates.items():
        # The printing before the newest one decides the gap, not the very first.
        last, *older = sorted(released, reverse=True)
        if older and (last - older[0]).days >= REPRINT_GAP_YEARS * 365:
            found.append(
                (card_id, {"years": (last - older[0]).days // 365, "released": last.isoformat()})
            )
    found.sort(key=lambda item: (item[1]["released"], item[1]["years"]), reverse=True)
    return found[:limit]


def most_wanted(session, market, limit):
    lists = func.count(distinct(WantlistItem.wantlist_id)).label("lists")
    rows = session.execute(
        select(WantlistItem.card_id, lists)
        .where(WantlistItem.market == market)
        .group_by(WantlistItem.card_id)
        .having(lists >= WANTED_MIN_LISTS)
        .order_by(lists.desc())
        .limit(limit)
    ).all()
    return [(card_id, {"lists": count}) for card_id, count in rows]


def price_drops(session, market, today, limit):
    since = datetime.combine(today - timedelta(days=PRICE_DAYS), time.min, tzinfo=timezone.utc)
    rows = session.execute(
        select(CardPrinting.card_id, PriceObservation.currency, PriceObservation.price)
        .join(CardPrinting, PriceObservation.printing_id == CardPrinting.id)
        .where(CardPrinting.market == market, PriceObservation.observed_at >= since)
        .order_by(PriceObservation.observed_at)
    ).all()
    # Prices are compared only within one currency: no exchange rate is assumed.
    sales = {}
    for card_id, currency, price in rows:
        sales.setdefault((card_id, currency), []).append(price)
    found = []
    for (card_id, currency), prices in sales.items():
        *before, last = prices
        if len(before) < PRICE_MIN_SALES:
            continue
        usual = median(before)
        drop = (usual - last) / usual
        if drop >= PRICE_DROP:
            found.append(
                (
                    card_id,
                    {
                        "from": str(usual),
                        "to": str(last),
                        "currency": currency,
                        "drop": float(drop),
                    },
                )
            )
    found.sort(key=lambda item: item[1]["drop"], reverse=True)
    return found[:limit]


def back_in_play(session, market, today, limit):
    """Cards the newest list in force treats better than the list before it."""
    lists = session.scalars(
        select(BanlistList)
        .where(BanlistList.format == market, BanlistList.effective_date <= today)
        .order_by(BanlistList.effective_date.desc())
        .limit(2)
    ).all()
    if len(lists) < 2:
        return []
    current, previous = lists

    def statuses(row):
        return dict(
            session.execute(
                select(BanlistListEntry.normalized_name, BanlistListEntry.status).where(
                    BanlistListEntry.banlist_id == row.id
                )
            ).all()
        )

    now, before = statuses(current), statuses(previous)
    eased = {
        name: (status, now.get(name, "unlimited"))
        for name, status in before.items()
        if STATUS_ORDER[now.get(name, "unlimited")] > STATUS_ORDER[status]
        and (current.complete or name in now)
    }
    if not eased:
        return []
    cards = session.execute(
        select(CardName.card_id, CardName.normalized).where(
            CardName.language == "en", CardName.normalized.in_(eased)
        )
    ).all()
    found = {}
    for card_id, name in cards:
        old, new = eased[name]
        found.setdefault(
            card_id, {"from": old, "to": new, "since": current.effective_date.isoformat()}
        )
    return list(found.items())[:limit]


def trending(session, market, *, limit=8, today: date | None = None):
    """[(key, [(card, reason)])] with only the lists that have cards."""
    today = today or date.today()
    lists = [
        ("price_drops", price_drops(session, market, today, limit)),
        ("back_in_play", back_in_play(session, market, today, limit)),
        ("most_wanted", most_wanted(session, market, limit)),
        ("reprints", reprints(session, market, today, limit)),
        ("notable_printings", notable_printings(session, market, today, limit)),
    ]
    ids = {card_id for _, items in lists for card_id, _ in items}
    cards = {
        card.id: card
        for card in session.scalars(
            select(Card)
            .where(Card.id.in_(ids))
            .options(
                selectinload(Card.names),
                selectinload(Card.artworks),
                selectinload(Card.printings).options(*printing_loads()),
            )
        )
    }
    return [
        (key, [(cards[card_id], reason) for card_id, reason in items if card_id in cards])
        for key, items in lists
        if items
    ]
