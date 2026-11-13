"""Accounts to try the test site with, one of each kind (cardmatica test-accounts).

Each run creates them, or gives them back their role and type, with a new
random password: the passwords are shown once, by the command, and are never
stored in the code or anywhere else.
"""

import secrets
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.models import User, UserProfile
from app.services.accounts import end_all_sessions, normalize_email, register
from app.services.passwords import hash_password


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


def create(session: Session, domain: str) -> list[dict]:
    created = []
    for account in ACCOUNTS:
        email = normalize_email(f"{account.name}@{domain}")
        password = secrets.token_urlsafe(12)
        user = session.scalar(select(User).where(User.email == email))
        if user is None:
            user = register(
                session, email=email, password=password, display_name=account.display_name
            )
        else:
            user.password_hash = hash_password(password)
            user.password_changed_at = utcnow()
            user.blocked_at = None
            user.locked_until = None
            user.failed_logins = 0
            # The old password no longer opens anything.
            end_all_sessions(session, user)
        user.role = account.role
        user.email_verified_at = user.email_verified_at or utcnow()
        profile = session.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
        if profile is None:
            profile = UserProfile(user_id=user.id)
            session.add(profile)
        profile.account_role = account.account_type
        profile.store_name = account.store_name
        created.append(
            {
                "email": email,
                "password": password,
                "role": account.role,
                "type": account.account_type,
            }
        )
    return created
