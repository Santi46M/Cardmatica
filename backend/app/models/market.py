from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Entity

__all__ = ["CURRENCIES", "PriceObservation"]

# Display currencies of the storefront; amounts are stored in the currency they were paid in.
CURRENCIES = ("EUR", "USD", "ARS", "BRL", "PYG", "UYU", "BOB")


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
        CheckConstraint(
            "currency IN (" + ",".join(f"'{code}'" for code in CURRENCIES) + ")",
            name="valid_currency",
        ),
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
