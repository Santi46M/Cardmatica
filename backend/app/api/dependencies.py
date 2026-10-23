import secrets
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import Cookie, Depends, Header, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_session
from app.services import accounts

# Cookies of a signed-in browser (see app/api/auth.py).
SESSION_COOKIE = "cm_session"
CSRF_COOKIE = "cm_csrf"
CSRF_HEADER = "X-CSRF-Token"

SessionDep = Annotated[Session, Depends(get_session)]
bearer = HTTPBearer(auto_error=False)


def is_https(request: Request) -> bool:
    return request.headers.get("x-forwarded-proto", request.url.scheme) == "https"


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


def require_admin(
    request: Request,
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
    csrf_header: Annotated[str | None, Header(alias=CSRF_HEADER)] = None,
    csrf_cookie: Annotated[str | None, Cookie(alias=CSRF_COOKIE)] = None,
):
    """Administration: an admin account's session, or the ADMIN_TOKEN for scripts."""
    if credentials:
        admin_token = get_settings().admin_token
        if len(admin_token) < 32:
            raise HTTPException(
                503,
                "Administración deshabilitada: configurar ADMIN_TOKEN de al menos 32 caracteres",
            )
        if not secrets.compare_digest(credentials.credentials, admin_token):
            raise HTTPException(
                401, "Credencial administrativa inválida", headers={"WWW-Authenticate": "Bearer"}
            )
        return None
    found = accounts.session_user(session, token)
    if not found:
        raise HTTPException(
            401, "Inicia sesión como administrador", headers={"WWW-Authenticate": "Bearer"}
        )
    user = found[0]
    if user.role != "admin":
        raise HTTPException(403, "Tu cuenta no tiene permisos de administración")
    if request.method not in SAFE_METHODS:
        same_origin(request)
        csrf(csrf_header, csrf_cookie)
    return user
