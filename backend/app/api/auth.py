"""Account endpoints: register, sign in and out, sessions and password.

Cookies:
- cm_session: the session token. HttpOnly, so page scripts cannot read it.
- cm_csrf: a random value the page copies into the X-CSRF-Token header on every
  request that changes something. Another site can make the browser send the
  cookies but cannot read cm_csrf, so it cannot forge that header.
"""

import secrets
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response
from sqlalchemy import select

from app.api.dependencies import SessionDep
from app.core.config import get_settings
from app.db.base import utcnow
from app.models.accounts import UserSession
from app.schemas.accounts import (
    LoginInput,
    PasswordChangeInput,
    RegisterInput,
    SessionView,
    UserView,
)
from app.services import accounts

SESSION_COOKIE = "cm_session"
CSRF_COOKIE = "cm_csrf"
CSRF_HEADER = "X-CSRF-Token"

router = APIRouter(prefix="/api/v1/auth", tags=["Cuentas"])


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


def limit_attempts(request: Request):
    key = f"auth:{request.client.host if request.client else 'unknown'}"
    if not accounts.limiter.allow(key, get_settings().auth_attempts_per_minute):
        raise HTTPException(429, "Demasiados intentos. Espera un minuto y vuelve a intentarlo.")


def set_cookies(request: Request, response: Response, new: accounts.NewSession):
    secure = is_https(request) or get_settings().deployment_mode == "production"
    max_age = get_settings().session_days * 86400 if new.persistent else None
    response.set_cookie(
        SESSION_COOKIE,
        new.token,
        max_age=max_age,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        CSRF_COOKIE,
        secrets.token_urlsafe(24),
        max_age=max_age,
        httponly=False,
        secure=secure,
        samesite="strict",
        path="/",
    )


def clear_cookies(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")


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


def fail(error: accounts.AccountError, status: int = 400):
    raise HTTPException(status, str(error))


@router.post(
    "/register",
    response_model=UserView,
    status_code=201,
    dependencies=[Depends(same_origin), Depends(limit_attempts)],
)
def register(payload: RegisterInput, request: Request, response: Response, session: SessionDep):
    if not payload.accept_terms:
        raise HTTPException(400, "Debes aceptar los términos y condiciones.")
    try:
        user = accounts.register(
            session,
            email=payload.email,
            password=payload.password,
            display_name=payload.display_name,
        )
    except accounts.AccountError as error:
        fail(error)
    new = accounts.start_session(
        session, user, remember=False, user_agent=request.headers.get("user-agent")
    )
    session.commit()
    set_cookies(request, response, new)
    return user_view(user)


@router.post(
    "/login", response_model=UserView, dependencies=[Depends(same_origin), Depends(limit_attempts)]
)
def login(payload: LoginInput, request: Request, response: Response, session: SessionDep):
    try:
        user = accounts.authenticate(session, payload.email, payload.password)
    except accounts.AccountError as error:
        # The failed-attempt counter must be saved even though the login fails.
        session.commit()
        fail(error, 401)
    new = accounts.start_session(
        session, user, remember=payload.remember, user_agent=request.headers.get("user-agent")
    )
    session.commit()
    set_cookies(request, response, new)
    return user_view(user)


@router.post("/logout", status_code=204, dependencies=[Depends(same_origin), Depends(csrf)])
def logout(found: Current, response: Response, session: SessionDep):
    accounts.end_session(session, found[1])
    session.commit()
    clear_cookies(response)
    response.status_code = 204
    return response


@router.get("/me", response_model=UserView)
def me(found: Current, session: SessionDep):
    user, row = found
    row.last_seen_at = utcnow()
    session.commit()
    return user_view(user)


@router.get("/sessions", response_model=list[SessionView])
def sessions(found: Current, session: SessionDep):
    user, row = found
    rows = session.scalars(
        select(UserSession)
        .where(UserSession.user_id == user.id)
        .order_by(UserSession.last_seen_at.desc())
    )
    return [
        SessionView(
            id=item.id,
            created_at=accounts.as_aware(item.created_at),
            last_seen_at=accounts.as_aware(item.last_seen_at),
            expires_at=accounts.as_aware(item.expires_at),
            user_agent=item.user_agent,
            current=item.id == row.id,
        )
        for item in rows
    ]


@router.post("/sessions/end-others", dependencies=[Depends(same_origin), Depends(csrf)])
def end_other_sessions(found: Current, session: SessionDep):
    user, row = found
    ended = accounts.end_all_sessions(session, user, keep=row)
    session.commit()
    return {"ended": ended}


@router.post("/password", status_code=204, dependencies=[Depends(same_origin), Depends(csrf)])
def password(payload: PasswordChangeInput, found: Current, session: SessionDep):
    user, row = found
    try:
        accounts.change_password(session, user, payload.current_password, payload.new_password)
    except accounts.AccountError as error:
        fail(error)
    # A new password signs out every other browser.
    accounts.end_all_sessions(session, user, keep=row)
    session.commit()
    return Response(status_code=204)


def user_view(user) -> UserView:
    return UserView(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        email_verified=user.email_verified_at is not None,
        created_at=accounts.as_aware(user.created_at),
    )
