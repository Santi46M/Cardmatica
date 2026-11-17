from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Entity

__all__ = ["CONDITIONS", "CURRENCIES", "LISTING_LANGUAGES", "Listing", "PriceObservation"]

# Display currencies of the storefront; amounts are stored in the currency they were paid in.
CURRENCIES = ("EUR", "USD", "ARS", "BRL", "PYG", "UYU", "BOB")
# Condition of a card, best to worst, as Cardmarket grades them.
CONDITIONS = ("MT", "NM", "EX", "GD", "LP", "PL", "PO")
# Languages a card is sold in.
LISTING_LANGUAGES = ("ES", "EN", "PT", "FR", "DE", "IT", "JP", "KO", "ZH")


def _sql_in(column: str, values) -> str:
    return f"{column} IN (" + ",".join(f"'{value}'" for value in values) + ")"


class PriceObservation(Entity, Base):
    """A completed sale of one printing on Cardmática.

    Never imported from external price guides: the source policy forbids it.
    Rows are written when an order is completed (or by an administrator while the
    order backend does not exist yet) and feed the price history of each card.
    """

    __tablename__ = "price_observations"
    __table_args__ = (
        CheckConstraint("price > 0", name="positive_price"),
        CheckConstraint("quantity > 0", name="positive_quantity"),
        CheckConstraint(_sql_in("currency", CURRENCIES), name="valid_currency"),
        Index("ix_price_observations_printing_time", "printing_id", "observed_at"),
    )
    printing_id: Mapped[UUID] = mapped_column(
        ForeignKey("card_printings.id", ondelete="CASCADE"), index=True
    )
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    price: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(3))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    condition: Mapped[str | None] = mapped_column(String(4))
    source_reference: Mapped[str | None] = mapped_column(Text)


class Listing(Entity, Base):
    """Copies of one printing that a seller has for sale (their stock, "Mi stock").

    The price is the seller's, in the currency they chose; the storefront shows
    it converted to the visitor's. Selling is open to accounts whose profile
    says seller (UserProfile.account_role), see app/services/listings.py.
    """

    __tablename__ = "listings"
    __table_args__ = (
        CheckConstraint("price > 0", name="positive_price"),
        CheckConstraint("quantity > 0", name="positive_quantity"),
        CheckConstraint(_sql_in("currency", CURRENCIES), name="valid_currency"),
        CheckConstraint(_sql_in("condition", CONDITIONS), name="valid_condition"),
        CheckConstraint(_sql_in("language", LISTING_LANGUAGES), name="valid_language"),
    )
    seller_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    printing_id: Mapped[UUID] = mapped_column(
        ForeignKey("card_printings.id", ondelete="CASCADE"), index=True
    )
    condition: Mapped[str] = mapped_column(String(2))
    language: Mapped[str] = mapped_column(String(2))
    # Magic foil or etched, Pokémon holo or reverse... one of the printing's finishes.
    finish: Mapped[str | None] = mapped_column(String(20))
    quantity: Mapped[int] = mapped_column(Integer)
    price: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(3))
    comment: Mapped[str | None] = mapped_column(String(200))
    # The seller's own photo of the copy, by its name in the image store
    # (app/services/image_store.py). Required above PHOTO_FROM_USD.
    photo: Mapped[str | None] = mapped_column(String(300))
