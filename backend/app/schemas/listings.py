"""What a seller sends to put cards on sale, and how an offer is shown."""

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.market import CONDITIONS, CURRENCIES, LISTING_LANGUAGES

Condition = Literal[CONDITIONS]
Language = Literal[LISTING_LANGUAGES]
Currency = Literal[CURRENCIES]
PRICE = {"gt": 0, "max_digits": 14, "decimal_places": 2}
# A photo arrives as a data URL ("data:image/jpeg;base64,..."); the page shrinks
# it first, and a host like Vercel takes at most 4.5 MB per request.
PHOTO = {"max_length": 4_000_000, "pattern": r"^data:image/(png|jpeg|webp);base64,"}
QUANTITY = {"ge": 1, "le": 9999}


class ListingInput(BaseModel):
    printing_id: UUID
    condition: Condition = "NM"
    language: Language
    finish: str | None = Field(default=None, max_length=20)
    quantity: int = Field(**QUANTITY)
    price: Decimal = Field(**PRICE)
    currency: Currency = "EUR"
    comment: str | None = Field(default=None, max_length=200)
    photo: str | None = Field(default=None, **PHOTO)


class ListingChange(BaseModel):
    """Only what is sent changes."""

    condition: Condition | None = None
    quantity: int | None = Field(default=None, **QUANTITY)
    price: Decimal | None = Field(default=None, **PRICE)
    currency: Currency | None = None
    comment: str | None = Field(default=None, max_length=200)
    # A new photo in place of the one there was.
    photo: str | None = Field(default=None, **PHOTO)


class SellerView(BaseModel):
    id: UUID
    # The store's name, or the person's when they gave none.
    name: str
    country: str | None
    since: int


class ListingView(BaseModel):
    id: UUID
    seller: SellerView
    card_id: UUID
    card_name: str
    game: str
    printing_id: UUID
    code: str
    set_name: str
    rarity: str
    rarity_code: str | None
    rarity_family: str
    market: str
    condition: str
    language: str
    finish: str | None
    quantity: int
    price: Decimal
    currency: str
    comment: str | None
    # Where the seller's photo is shown, when there is one.
    photo_url: str | None
    updated_at: datetime
