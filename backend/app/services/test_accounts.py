"""Accounts to try the test site with.

`cardmatica test-accounts` makes one of each kind with new random passwords,
shown once by the command. `cardmatica prepare-test-site` makes the test site's
accounts listed in the host's private settings (TEST_ACCOUNTS). No password is stored in the code.
"""

import secrets
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.models import User, UserProfile
from app.models.accounts import ROLES
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


def ensure_site_accounts(session: Session, settings) -> list[str]:
    """The test site's accounts, from its private settings (TEST_ACCOUNTS)."""
    made = []
    for entry in settings.test_accounts:
        role = entry.get("role", "user")
        if role not in ROLES:
            raise ValueError(f"Rol desconocido en TEST_ACCOUNTS: {role}")
        kind = entry.get("type", "buyer")
        if kind not in ("buyer", "seller", "both"):
            raise ValueError(f"Tipo de cuenta desconocido en TEST_ACCOUNTS: {kind}")
        account = TestAccount(
            entry["email"].split("@")[0],
            entry.get("name") or entry["email"],
            role,
            kind,
            entry.get("store"),
        )
        made.append(ensure(session, account, entry["email"], entry["password"]).email)
    return made
