import secrets
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import Cookie, Depends, Header, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_session
from app.models.accounts import STAFF
from app.services import accounts

# Cookies of a signed-in browser (see app/api/auth.py).
SESSION_COOKIE = "cm_session"
CSRF_COOKIE = "cm_csrf"
CSRF_HEADER = "X-CSRF-Token"

SessionDep = Annotated[Session, Depends(get_session)]
bearer = HTTPBearer(auto_error=False)


def is_https(request: Request) -> bool:
    return request.headers.get("x-forwarded-proto", request.url.scheme) == "https"


def site_url(request: Request) -> str:
    """The site's public address: PUBLIC_BASE_URL, or the one this request came to."""
    configured = get_settings().public_base_url.rstrip("/")
    if configured:
        return configured
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "localhost")
    return f"{'https' if is_https(request) else 'http'}://{host}"


def same_origin(request: Request):
    """Refuse a change sent from another site (checked before any cookie is used)."""
    origin = request.headers.get("origin") or request.headers.get("referer")
    if not origin:
        return
    sender = urlsplit(origin)
    hosts = {request.headers.get("x-forwarded-host"), request.headers.get("host")}
    if sender.netloc in hosts:
        return
    # Behind a private development proxy (a Codespace) the Host header can be
    # rewritten; its public name is accepted when it is a configured preview host.
    settings = get_settings()
    if settings.deployment_mode == "local" and settings.is_preview_host(sender.hostname):
        return
    raise HTTPException(403, "Solicitud de otro sitio rechazada")


def current(
    session: SessionDep,
    token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
):
    found = accounts.session_user(session, token)
    if not found:
        raise HTTPException(401, "Inicia sesión para continuar")
    return found


def csrf(
    header: Annotated[str | None, Header(alias=CSRF_HEADER)] = None,
    cookie: Annotated[str | None, Cookie(alias=CSRF_COOKIE)] = None,
):
    if not header or not cookie or not secrets.compare_digest(header, cookie):
        raise HTTPException(403, "Falta el token de seguridad: recarga la página")


Current = Annotated[tuple, Depends(current)]


SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _staff_member(roles: tuple[str, ...], refused: str):
    """A staff account's session with one of these roles, or the ADMIN_TOKEN
    for scripts (worth an administrator; the dependency then gives None)."""

    def dependency(
        request: Request,
        session: SessionDep,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
        token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
        csrf_header: Annotated[str | None, Header(alias=CSRF_HEADER)] = None,
        csrf_cookie: Annotated[str | None, Cookie(alias=CSRF_COOKIE)] = None,
    ):
        if credentials:
            admin_token = get_settings().admin_token
            if len(admin_token) < 32:
                raise HTTPException(
                    503,
                    "Administración deshabilitada: configurar ADMIN_TOKEN de al menos 32 caracteres",
                )
            if not secrets.compare_digest(credentials.credentials, admin_token):
                raise HTTPException(
                    401,
                    "Credencial administrativa inválida",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return None
        found = accounts.session_user(session, token)
        if not found:
            raise HTTPException(
                401,
                "Inicia sesión con una cuenta del equipo",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user = found[0]
        if user.role not in roles:
            raise HTTPException(403, refused)
        if request.method not in SAFE_METHODS:
            same_origin(request)
            csrf(csrf_header, csrf_cookie)
        return user

    return dependency


# Administration: roles, deleting accounts, the catalogue (app/api/admin.py).
require_admin = _staff_member(("admin",), "Solo un administrador puede hacer esto")
# What moderators may do too: look after accounts and the home page's news.
require_staff = _staff_member(STAFF, "Tu cuenta no tiene permisos de administración")
