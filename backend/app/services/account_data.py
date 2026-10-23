"""Profile, preferences and wantlists stored with the account.

Wantlists travel as one document in the shape the page already uses
(frontend/js/wantlists.js) and are stored as rows: saving replaces the
person's lists in one transaction, and reading fills in the card names, codes
and rarities from the catalogue, so they never go stale.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.base import utcnow
from app.models import Card, CardPrinting, CardSet, Rarity
from app.models.accounts import User, UserProfile, Wantlist, WantlistItem
from app.schemas.accounts import (
    AccountData,
    Preferences,
    PriceAlert,
    ProfileData,
    WantlistData,
    WantlistItemData,
    WantlistsData,
)
from app.services.accounts import AccountError, as_aware


def _profile_row(session: Session, user: User) -> UserProfile:
    row = session.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    if not row:
        row = UserProfile(user_id=user.id, payment_methods=[], preferences={})
        session.add(row)
    return row


def account_data(session: Session, user: User) -> AccountData:
    row = session.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    profile = None
    if row and row.full_name:
        profile = ProfileData(
            role=row.account_role,
            name=row.full_name,
            store=row.store_name or "",
            country=row.country,
            address=row.address,
            phone=row.phone,
            payments=row.payment_methods,
        )
    return AccountData(profile=profile, preferences=Preferences(**(row.preferences if row else {})))


def save_profile(session: Session, user: User, data: ProfileData) -> None:
    row = _profile_row(session, user)
    row.account_role = data.role
    row.full_name = data.name.strip()
    row.store_name = data.store.strip() if data.role != "buyer" else None
    row.country = data.country
    row.address = data.address.strip()
    row.phone = data.phone.strip()
    row.payment_methods = list(dict.fromkeys(data.payments))


def save_preferences(session: Session, user: User, data: Preferences) -> None:
    row = _profile_row(session, user)
    # Only the preferences sent change; the rest keep their saved value.
    row.preferences = {**(row.preferences or {}), **data.model_dump(exclude_none=True)}


def wantlists(session: Session, user: User) -> WantlistsData:
    lists = session.scalars(
        select(Wantlist)
        .where(Wantlist.user_id == user.id)
        .order_by(Wantlist.position)
        .options(selectinload(Wantlist.items))
    ).all()
    card_ids = {item.card_id for wantlist in lists for item in wantlist.items}
    printing_ids = {item.printing_id for wantlist in lists for item in wantlist.items}
    cards = {card.id: card for card in session.scalars(select(Card).where(Card.id.in_(card_ids)))}
    printings = {
        row.id: row
        for row in session.execute(
            select(
                CardPrinting.id,
                CardPrinting.code,
                CardSet.name.label("set_name"),
                Rarity.name.label("rarity"),
            )
            .join(CardSet)
            .join(Rarity)
            .where(CardPrinting.id.in_(printing_ids - {None}))
        )
    }
    active = next((wantlist.client_id for wantlist in lists if wantlist.is_active), None)

    def item_view(item: WantlistItem) -> WantlistItemData:
        card = cards[item.card_id]
        printing = printings.get(item.printing_id)
        return WantlistItemData(
            id=item.client_id,
            cardId=item.card_id,
            printingId=item.printing_id,
            market=item.market,
            language=item.language,
            edition=item.edition,
            quantity=item.quantity,
            alert=PriceAlert(amount=item.alert_amount, currency=item.alert_currency)
            if item.alert_amount is not None
            else None,
            seenSaleAt=as_aware(item.seen_sale_at),
            addedAt=as_aware(item.added_at),
            name=card.display_name,
            cardType=card.card_type,
            subtypes=card.subtypes or [],
            code=printing.code if printing else None,
            setName=printing.set_name if printing else None,
            rarity=printing.rarity if printing else None,
        )

    return WantlistsData(
        lists=[
            WantlistData(
                id=wantlist.client_id,
                name=wantlist.name,
                createdAt=as_aware(wantlist.created_at),
                items=[item_view(item) for item in wantlist.items],
            )
            for wantlist in lists
        ],
        active=active,
    )


def save_wantlists(session: Session, user: User, data: WantlistsData) -> WantlistsData:
    card_ids = {item.cardId for wantlist in data.lists for item in wantlist.items}
    known = set(session.scalars(select(Card.id).where(Card.id.in_(card_ids))))
    if card_ids - known:
        raise AccountError("Una de las cartas de la wantlist ya no está en el catálogo.")
    printing_ids = {
        item.printingId for wantlist in data.lists for item in wantlist.items if item.printingId
    }
    known_printings = set(
        session.scalars(select(CardPrinting.id).where(CardPrinting.id.in_(printing_ids)))
    )
    for row in session.scalars(select(Wantlist).where(Wantlist.user_id == user.id)):
        session.delete(row)
    session.flush()
    now = utcnow()
    for position, wantlist in enumerate(data.lists):
        session.add(
            Wantlist(
                user_id=user.id,
                client_id=wantlist.id,
                name=wantlist.name.strip(),
                position=position,
                is_active=wantlist.id == data.active,
                created_at=wantlist.createdAt or now,
                items=[
                    WantlistItem(
                        client_id=item.id,
                        card_id=item.cardId,
                        printing_id=item.printingId if item.printingId in known_printings else None,
                        market=item.market,
                        language=item.language,
                        edition=item.edition,
                        quantity=item.quantity,
                        position=index,
                        alert_amount=item.alert.amount if item.alert else None,
                        alert_currency=item.alert.currency if item.alert else None,
                        seen_sale_at=item.seenSaleAt,
                        added_at=item.addedAt or now,
                    )
                    for index, item in enumerate(wantlist.items)
                ],
            )
        )
    session.flush()
    return wantlists(session, user)
