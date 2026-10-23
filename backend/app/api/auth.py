"""Account endpoints: register, sign in and out, sessions and password.

Cookies:
- cm_session: the session token. HttpOnly, so page scripts cannot read it.
- cm_csrf: a random value the page copies into the X-CSRF-Token header on every
  request that changes something. Another site can make the browser send the
  cookies but cannot read cm_csrf, so it cannot forge that header.
"""

import logging
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select

from app.api.dependencies import (
    CSRF_COOKIE,
    SESSION_COOKIE,
    Current,
    SessionDep,
    csrf,
    is_https,
    same_origin,
    site_url,
)
from app.core.config import get_settings
from app.db.base import utcnow
from app.models.accounts import UserSession
from app.schemas.accounts import (
    LoginInput,
    PasswordChangeInput,
    PasswordResetInput,
    PasswordResetRequest,
    RegisterInput,
    SessionView,
    TokenInput,
    UserView,
)
from app.services import accounts

router = APIRouter(prefix="/api/v1/auth", tags=["Cuentas"])
LAST_SEEN_EVERY = timedelta(minutes=5)
logger = logging.getLogger(__name__)


def send_confirmation(session, user, request: Request) -> None:
    # A failing mail server must not undo the registration; the link can be resent.
    try:
        accounts.send_confirmation(session, user, site_url(request))
    except OSError as error:
        logger.error("No se pudo enviar el correo de confirmación: %s", type(error).__name__)


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
    send_confirmation(session, user, request)
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
    # Every page load asks /me; the activity time is written at most every few minutes.
    now = utcnow()
    if now - accounts.as_aware(row.last_seen_at) > LAST_SEEN_EVERY:
        row.last_seen_at = now
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


@router.post(
    "/confirm-email/request",
    status_code=204,
    dependencies=[Depends(same_origin), Depends(csrf), Depends(limit_attempts)],
)
def resend_confirmation(found: Current, request: Request, session: SessionDep):
    user = found[0]
    if user.email_verified_at:
        raise HTTPException(409, "Tu correo ya está confirmado.")
    send_confirmation(session, user, request)
    session.commit()
    return Response(status_code=204)


@router.post(
    "/confirm-email",
    response_model=UserView,
    dependencies=[Depends(same_origin), Depends(limit_attempts)],
)
def confirm_email(payload: TokenInput, session: SessionDep):
    try:
        user = accounts.confirm_email(session, payload.token)
    except accounts.AccountError as error:
        fail(error)
    session.commit()
    return user_view(user)


@router.post(
    "/password-reset/request",
    status_code=202,
    dependencies=[Depends(same_origin), Depends(limit_attempts)],
)
def request_password_reset(payload: PasswordResetRequest, request: Request, session: SessionDep):
    try:
        accounts.request_password_reset(session, payload.email, site_url(request))
    except OSError as error:
        logger.error("No se pudo enviar el correo de recuperación: %s", type(error).__name__)
    session.commit()
    # The same answer whether or not the account exists.
    return {"message": "Si existe una cuenta con ese correo, te enviamos un enlace."}


@router.post(
    "/password-reset",
    status_code=204,
    dependencies=[Depends(same_origin), Depends(limit_attempts)],
)
def reset_password(payload: PasswordResetInput, response: Response, session: SessionDep):
    try:
        accounts.reset_password(session, payload.token, payload.new_password)
    except accounts.AccountError as error:
        fail(error)
    session.commit()
    clear_cookies(response)
    response.status_code = 204
    return response


def user_view(user) -> UserView:
    return UserView(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        email_verified=user.email_verified_at is not None,
        created_at=accounts.as_aware(user.created_at),
    )
