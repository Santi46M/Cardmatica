"""Sellers' stock (Listing): putting copies of a printing on sale, changing
them, taking them off, and the offers buyers see.

Anyone whose profile says seller ("seller" or "both") may sell; a blocked
account's offers, or those of someone who stopped selling, are not shown.
"""

import base64
import binascii
import hashlib
import io
from decimal import Decimal
from uuid import UUID

from PIL import Image, ImageOps
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.currencies import convert
from app.models import Card, CardPrinting, CardSet, Rarity, User, UserProfile
from app.models.market import Listing
from app.schemas.listings import ListingChange, ListingInput, ListingView, SellerView
from app.services import image_store, rarities

SELLING = ("seller", "both")
CENTS = Decimal("0.01")
# Above this price, in US dollars, a copy needs the seller's photo.
PHOTO_FROM_USD = Decimal("10")
# The photo kept: enough to see the card's state, light to load.
PHOTO_SIZE = (1200, 1200)
PHOTO_PIXELS = 40_000_000
# The most offers one answer brings.
MOST = 2000


class ListingError(ValueError):
    """A request the seller can fix (shown to them as it is)."""


def can_sell(session: Session, user: User) -> bool:
    role = session.scalar(select(UserProfile.account_role).where(UserProfile.user_id == user.id))
    return role in SELLING and user.blocked_at is None


def _offers():
    return (
        select(Listing, CardPrinting, Card, CardSet, Rarity, User, UserProfile)
        .join(CardPrinting, CardPrinting.id == Listing.printing_id)
        .join(Card, Card.id == CardPrinting.card_id)
        .join(CardSet, CardSet.id == CardPrinting.set_id)
        .join(Rarity, Rarity.id == CardPrinting.rarity_id)
        .join(User, User.id == Listing.seller_id)
        .outerjoin(UserProfile, UserProfile.user_id == User.id)
    )


def _view(row) -> ListingView:
    listing, printing, card, card_set, rarity, user, profile = row
    return ListingView(
        id=listing.id,
        seller=SellerView(
            id=user.id,
            name=(profile and profile.store_name) or user.display_name,
            country=profile.country if profile else None,
            since=user.created_at.year,
        ),
        card_id=card.id,
        card_name=card.display_name,
        game=card.game,
        printing_id=printing.id,
        code=printing.code,
        set_name=card_set.name,
        rarity=rarity.name,
        rarity_code=rarities.info(rarity.name, card.game).code,
        rarity_family=rarities.info(rarity.name, card.game).family,
        market=printing.market,
        condition=listing.condition,
        language=listing.language,
        finish=listing.finish,
        quantity=listing.quantity,
        price=Decimal(listing.price).quantize(CENTS),
        currency=listing.currency,
        comment=listing.comment,
        # The version changes with the photo, so a browser never shows an old one.
        photo_url=f"/api/v1/listings/{listing.id}/photo?v={listing.photo[8:20]}"
        if listing.photo
        else None,
        updated_at=listing.updated_at,
    )


def offers(
    session: Session,
    *,
    game: str | None = None,
    card_id: UUID | None = None,
    seller_id: UUID | None = None,
) -> list[ListingView]:
    """What is on sale, by card and printing (the page sorts prices across currencies)."""
    query = _offers().where(User.blocked_at.is_(None), UserProfile.account_role.in_(SELLING))
    if game:
        query = query.where(Card.game == game)
    if card_id:
        query = query.where(Card.id == card_id)
    if seller_id:
        query = query.where(User.id == seller_id)
    query = query.order_by(Card.display_name, CardPrinting.code, Listing.price).limit(MOST)
    return [_view(row) for row in session.execute(query)]


def mine(session: Session, user: User) -> list[ListingView]:
    query = _offers().where(Listing.seller_id == user.id)
    query = query.order_by(Card.display_name, CardPrinting.code, Listing.created_at)
    return [_view(row) for row in session.execute(query)]


def _one(session: Session, user: User, listing_id: UUID) -> ListingView:
    row = session.execute(_offers().where(Listing.id == listing_id, Listing.seller_id == user.id))
    return _view(row.one())


def _check_finish(printing: CardPrinting, finish: str | None):
    if finish and finish not in (printing.finishes or []):
        raise ListingError("Esa impresión no existe con ese acabado")


def needs_photo(price: Decimal, currency: str) -> bool:
    return convert(price, currency, "USD") > PHOTO_FROM_USD


def _save_photo(session: Session, listing: Listing, data_url: str):
    """Keeps the photo as WebP, without its metadata (a phone's GPS position)."""
    try:
        content = base64.b64decode(data_url.split(",", 1)[1], validate=True)
        with Image.open(io.BytesIO(content)) as raster:
            if (
                raster.format not in {"PNG", "JPEG", "WEBP"}
                or raster.width * raster.height > PHOTO_PIXELS
            ):
                raise ListingError("La foto debe ser PNG, JPEG o WebP")
            raster = ImageOps.exif_transpose(raster).convert("RGB")
    except (binascii.Error, IndexError, OSError) as error:
        raise ListingError("No se pudo leer la foto") from error
    raster.thumbnail(PHOTO_SIZE)
    output = io.BytesIO()
    raster.save(output, "WEBP", quality=82)
    photo = output.getvalue()
    name = f"listing-{hashlib.sha256(photo).hexdigest()}.webp"
    settings = get_settings()
    image_store.save(session, settings, name, photo)
    if listing.photo and listing.photo != name:
        image_store.delete(session, settings, listing.photo)
    listing.photo = name


def _check_photo(listing: Listing):
    if not listing.photo and needs_photo(listing.price, listing.currency):
        raise ListingError(
            f"Las cartas de más de {PHOTO_FROM_USD} USD necesitan una foto de la copia que vendes"
        )


def photo(session: Session, listing_id: UUID) -> tuple[str, bytes] | None:
    listing = session.get(Listing, listing_id)
    if listing is None or not listing.photo:
        return None
    content = image_store.read(session, get_settings(), listing.photo)
    return (listing.photo, content) if content is not None else None


def add(session: Session, user: User, data: ListingInput) -> ListingView:
    if not can_sell(session, user):
        raise PermissionError("Para vender, elige «Vendedor» en tu perfil")
    printing = session.get(CardPrinting, data.printing_id)
    if printing is None:
        raise ListingError("Esa impresión no está en el catálogo")
    _check_finish(printing, data.finish)
    listing = Listing(seller_id=user.id, **data.model_dump(exclude={"photo"}))
    listing.comment = (listing.comment or "").strip() or None
    if data.photo:
        _save_photo(session, listing, data.photo)
    _check_photo(listing)
    session.add(listing)
    session.flush()
    return _one(session, user, listing.id)


def _own(session: Session, user: User, listing_id: UUID) -> Listing:
    listing = session.get(Listing, listing_id)
    if listing is None or listing.seller_id != user.id:
        raise LookupError("No tienes esa oferta en tu stock")
    return listing


def change(session: Session, user: User, listing_id: UUID, data: ListingChange) -> ListingView:
    listing = _own(session, user, listing_id)
    for field, value in data.model_dump(exclude_unset=True, exclude={"photo"}).items():
        if value is None and field != "comment":
            continue
        setattr(listing, field, value)
    listing.comment = (listing.comment or "").strip() or None
    if data.photo:
        _save_photo(session, listing, data.photo)
    _check_photo(listing)
    session.flush()
    return _one(session, user, listing.id)


def remove(session: Session, user: User, listing_id: UUID) -> None:
    listing = _own(session, user, listing_id)
    image_store.delete(session, get_settings(), listing.photo)
    session.delete(listing)


def forget_photos(session: Session, user: User) -> None:
    """Before an account goes: its listings go by cascade, their photos here."""
    for name in session.scalars(select(Listing.photo).where(Listing.seller_id == user.id)):
        image_store.delete(session, get_settings(), name)
