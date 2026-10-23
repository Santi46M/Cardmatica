"""User accounts and their login sessions."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Entity

__all__ = ["ROLES", "User", "UserSession"]

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
