"""Accounts to try the test site with.

`cardmatica test-accounts` makes one of each kind with new random passwords,
shown once by the command. `cardmatica prepare-test-site` makes the test site's
two accounts, an administrator and a plain one, with the passwords kept in the
host's private settings. No password is stored in the code.
"""

import secrets
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.models import User, UserProfile
from app.services.accounts import end_all_sessions, normalize_email, register
from app.services.passwords import hash_password, verify_password


@dataclass(frozen=True)
class TestAccount:
    name: str  # the part before the @
    display_name: str
    role: str  # user, moderator or admin
    account_type: str  # buyer, seller or both
    store_name: str | None = None


ACCOUNTS = (
    TestAccount("prueba-admin", "Admin de prueba", "admin", "buyer"),
    TestAccount("prueba-moderador", "Moderador de prueba", "moderator", "buyer"),
    TestAccount("prueba-vendedor", "Vendedor de prueba", "user", "seller", "Tienda de prueba"),
    TestAccount("prueba-comprador", "Comprador de prueba", "user", "buyer"),
)


def ensure(session: Session, account: TestAccount, email: str, password: str) -> User:
    """The account with this role, type and password, made if it is missing."""
    email = normalize_email(email)
    user = session.scalar(select(User).where(User.email == email))
    if user is None:
        user = register(session, email=email, password=password, display_name=account.display_name)
    elif not verify_password(password, user.password_hash):
        user.password_hash = hash_password(password)
        user.password_changed_at = utcnow()
        # The old password no longer opens anything.
        end_all_sessions(session, user)
    user.blocked_at = None
    user.locked_until = None
    user.failed_logins = 0
    user.role = account.role
    user.email_verified_at = user.email_verified_at or utcnow()
    profile = session.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    if profile is None:
        profile = UserProfile(user_id=user.id)
        session.add(profile)
    profile.account_role = account.account_type
    profile.store_name = account.store_name
    return user


def create(session: Session, domain: str) -> list[dict]:
    """One of each kind, each with a new random password."""
    created = []
    for account in ACCOUNTS:
        email = f"{account.name}@{domain}"
        password = secrets.token_urlsafe(12)
        user = ensure(session, account, email, password)
        created.append(
            {
                "email": user.email,
                "password": password,
                "role": account.role,
                "type": account.account_type,
            }
        )
    return created


# The test site's pair (TEST_ADMIN_* and TEST_USER_*, app/core/config.py).
SITE_PAIR = (
    ("admin", TestAccount("admin", "Admin de prueba", "admin", "buyer")),
    ("user", TestAccount("usuario", "Usuario de prueba", "user", "buyer")),
)


def ensure_site_pair(session: Session, settings) -> list[str]:
    """The administrator and the plain account of the test site, from its settings."""
    made = []
    for key, account in SITE_PAIR:
        email = getattr(settings, f"test_{key}_email")
        password = getattr(settings, f"test_{key}_password")
        if email and password:
            made.append(ensure(session, account, email, password).email)
    return made
