"""User accounts and their login sessions."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Entity

__all__ = [
    "ROLES",
    "AccountToken",
    "User",
    "UserProfile",
    "UserSession",
    "Wantlist",
    "WantlistItem",
]

# Who can do what. "admin" replaces the shared ADMIN_TOKEN once an admin panel exists.
ROLES = ("user", "moderator", "admin")


class User(Entity, Base):
    __tablename__ = "users"
    # Stored lowercase and trimmed, so "Ana@Mail.com" and "ana@mail.com" are one account.
    email: Mapped[str] = mapped_column(String(254), unique=True)
    display_name: Mapped[str] = mapped_column(String(60))
    # "scrypt$n$r$p$salt$hash" (app/services/passwords.py); never the password itself.
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20), default="user")
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    terms_accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Declared on signing up: the site is for adults (migration 014).
    adult_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Failed logins in a row; the account locks for a while after too many.
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sessions: Mapped[list["UserSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class UserSession(Entity, Base):
    """One signed-in browser. The cookie holds a random token; only its hash is stored."""

    __tablename__ = "user_sessions"
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    user: Mapped[User] = relationship(back_populates="sessions")


class UserProfile(Entity, Base):
    """What used to live in the browser: profile details and preferences.

    The profile columns stay empty until the person fills in the form; the
    preferences (currency, market, catalogue view) can be saved before that.
    """

    __tablename__ = "user_profiles"
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    account_role: Mapped[str | None] = mapped_column(String(10))
    full_name: Mapped[str | None] = mapped_column(String(120))
    store_name: Mapped[str | None] = mapped_column(String(80))
    country: Mapped[str | None] = mapped_column(String(40))
    address: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(30))
    payment_methods: Mapped[list] = mapped_column(JSON, default=list)
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)


class Wantlist(Entity, Base):
    __tablename__ = "wantlists"
    __table_args__ = (UniqueConstraint("user_id", "client_id"),)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # The id the page gave the list, kept so the page can refer to it.
    client_id: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(60))
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    items: Mapped[list["WantlistItem"]] = relationship(
        back_populates="wantlist", cascade="all, delete-orphan", order_by="WantlistItem.position"
    )


class WantlistItem(Entity, Base):
    __tablename__ = "wantlist_items"
    wantlist_id: Mapped[UUID] = mapped_column(
        ForeignKey("wantlists.id", ondelete="CASCADE"), index=True
    )
    client_id: Mapped[str] = mapped_column(String(40))
    card_id: Mapped[UUID] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), index=True)
    printing_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("card_printings.id", ondelete="SET NULL")
    )
    market: Mapped[str] = mapped_column(String(8))
    language: Mapped[str] = mapped_column(String(4), default="")
    edition: Mapped[str] = mapped_column(String(20), default="")
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    position: Mapped[int] = mapped_column(Integer, default=0)
    # Price alert: notify when a sale at or below this amount appears.
    alert_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    alert_currency: Mapped[str | None] = mapped_column(String(3))
    seen_sale_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    wantlist: Mapped[Wantlist] = relationship(back_populates="items")


class AccountToken(Entity, Base):
    """A single-use link sent by email: confirm the address or reset the password."""

    __tablename__ = "account_tokens"
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    purpose: Mapped[str] = mapped_column(String(20))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
