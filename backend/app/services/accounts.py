"""Accounts: registration, login sessions, lockout and attempt limits.

A session is a random token in an HttpOnly cookie; the database keeps only
its SHA-256, so a leaked database cannot be used to sign in. Every request
that changes something also needs the CSRF token (app/api/auth.py).
"""

import hashlib
import secrets
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.base import utcnow
from app.models.accounts import User, UserSession
from app.services.passwords import hash_password, needs_rehash, password_problem, verify_password

TOKEN_BYTES = 32
# Same answer for "no such account" and "wrong password", so the login form
# cannot be used to find out who has an account.
WRONG_LOGIN = "Correo o contraseña incorrectos."
# Spent on unknown emails too, so both answers take as long.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


class AccountError(ValueError):
    """A problem the person can fix; the message is shown as is."""


def normalize_email(email: str) -> str:
    return email.strip().lower()


def as_aware(value: datetime | None) -> datetime | None:
    # SQLite returns naive datetimes; PostgreSQL keeps the zone.
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def register(session: Session, *, email: str, password: str, display_name: str) -> User:
    email = normalize_email(email)
    if problem := password_problem(password, email):
        raise AccountError(problem)
    if session.scalar(select(User.id).where(User.email == email)):
        raise AccountError("Ya existe una cuenta con ese correo.")
    now = utcnow()
    user = User(
        email=email,
        display_name=display_name.strip(),
        password_hash=hash_password(password),
        terms_accepted_at=now,
        password_changed_at=now,
    )
    session.add(user)
    session.flush()
    return user


def authenticate(session: Session, email: str, password: str) -> User:
    settings = get_settings()
    user = session.scalar(select(User).where(User.email == normalize_email(email)))
    if not user:
        verify_password(password, _DUMMY_HASH)
        raise AccountError(WRONG_LOGIN)
    now = utcnow()
    locked = as_aware(user.locked_until)
    if locked and locked > now:
        minutes = max(1, round((locked - now).total_seconds() / 60))
        raise AccountError(
            f"Demasiados intentos fallidos. Vuelve a intentarlo en {minutes} minutos."
        )
    if not verify_password(password, user.password_hash):
        user.failed_logins += 1
        if user.failed_logins >= settings.login_max_failures:
            user.locked_until = now + timedelta(minutes=settings.login_lock_minutes)
            user.failed_logins = 0
        raise AccountError(WRONG_LOGIN)
    user.failed_logins = 0
    user.locked_until = None
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    return user


@dataclass
class NewSession:
    token: str
    row: UserSession
    persistent: bool


def start_session(session: Session, user: User, *, remember: bool, user_agent: str | None):
    settings = get_settings()
    now = utcnow()
    lifetime = (
        timedelta(days=settings.session_days)
        if remember
        else timedelta(hours=settings.session_short_hours)
    )
    token = secrets.token_urlsafe(TOKEN_BYTES)
    row = UserSession(
        user_id=user.id,
        token_hash=token_hash(token),
        expires_at=now + lifetime,
        last_seen_at=now,
        user_agent=(user_agent or "")[:300] or None,
    )
    session.add(row)
    # Expired sessions of this user are cleaned up whenever a new one starts.
    session.execute(
        delete(UserSession).where(UserSession.user_id == user.id, UserSession.expires_at < now)
    )
    session.flush()
    return NewSession(token=token, row=row, persistent=remember)


def session_user(session: Session, token: str | None) -> tuple[User, UserSession] | None:
    if not token:
        return None
    row = session.scalar(select(UserSession).where(UserSession.token_hash == token_hash(token)))
    if not row or as_aware(row.expires_at) <= utcnow():
        return None
    return row.user, row


def end_session(session: Session, row: UserSession) -> None:
    session.delete(row)


def end_all_sessions(session: Session, user: User, keep: UserSession | None = None) -> int:
    query = delete(UserSession).where(UserSession.user_id == user.id)
    if keep is not None:
        query = query.where(UserSession.id != keep.id)
    return session.execute(query).rowcount


def change_password(session: Session, user: User, current: str, new: str) -> None:
    if not verify_password(current, user.password_hash):
        raise AccountError("La contraseña actual no es correcta.")
    if problem := password_problem(new, user.email):
        raise AccountError(problem)
    user.password_hash = hash_password(new)
    user.password_changed_at = utcnow()


class AttemptLimiter:
    """Allow at most `limit` attempts per key in any 60-second window.

    Kept in memory: enough for one server process. With several processes it
    should move to the database or a shared cache.
    """

    WINDOW_SECONDS = 60

    def __init__(self):
        self._attempts: dict[str, deque] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int) -> bool:
        now = time.monotonic()
        with self._lock:
            attempts = self._attempts.setdefault(key, deque())
            while attempts and now - attempts[0] > self.WINDOW_SECONDS:
                attempts.popleft()
            if len(attempts) >= limit:
                return False
            attempts.append(now)
            return True

    def clear(self):
        with self._lock:
            self._attempts.clear()


limiter = AttemptLimiter()
