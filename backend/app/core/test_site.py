"""The test site (TEST_SITE=true, docs/version-de-prueba.md).

Every answer tells search engines not to index it. With TEST_SITE_PASSWORD,
nothing is shown until the visitor enters that password on a page of its own
(the "key" of the site): it then leaves a cookie that lasts COOKIE_DAYS, made
from the password, so changing the password locks everyone out again.

The page replaces the browser's own user-and-password box (HTTP Basic), which
in-app browsers (WhatsApp, Instagram) and some phones never show. Scripts may
still send Basic credentials; the user name must be TEST_SITE_USER when it is
set. The host's health check (/health/...) always gets through, or the host
would think the site is down. Pages also say it is a test site (app/api/pages.py).
"""

import asyncio
import base64
import binascii
import hashlib
import hmac
import secrets
from http.cookies import SimpleCookie
from urllib.parse import parse_qs, quote

from starlette.responses import HTMLResponse, PlainTextResponse, RedirectResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import get_settings

NOINDEX = (b"x-robots-tag", b"noindex, nofollow")
OPEN_PATHS = ("/health/",)
GATE_PATH = "/entrar-a-la-prueba"
COOKIE = "cm_test_site"
COOKIE_DAYS = 30
# A wrong password waits this long: guessing one by one becomes impractical.
WRONG_WAIT_SECONDS = 1
MOST_FORM_BYTES = 4096


def _token(password: str) -> str:
    return hmac.new(password.encode(), b"cardmatica test site", hashlib.sha256).hexdigest()


def _same(given: str, expected: str) -> bool:
    return secrets.compare_digest(given.encode(), expected.encode())


def _header(scope: Scope, name: bytes) -> str:
    for key, value in scope.get("headers", []):
        if key == name:
            return value.decode("latin-1")
    return ""


def _basic(scope: Scope) -> tuple[str, str] | None:
    kind, _, encoded = _header(scope, b"authorization").partition(" ")
    if kind.lower() != "basic":
        return None
    try:
        decoded = base64.b64decode(encoded, validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return None
    user, _, password = decoded.partition(":")
    return user, password


def _let_in(scope: Scope, settings) -> bool:
    password = settings.test_site_password
    cookie = SimpleCookie(_header(scope, b"cookie")).get(COOKIE)
    if cookie and _same(cookie.value, _token(password)):
        return True
    given = _basic(scope)
    if given is None or not _same(given[1], password):
        return False
    return not settings.test_site_user or _same(given[0], settings.test_site_user)


def _safe_next(path: str) -> str:
    """Back to the page asked for, on this site only."""
    if not path.startswith("/") or path.startswith("//") or "\\" in path:
        return "/"
    return path


def _gate_page(next_path: str, wrong: bool) -> HTMLResponse:
    error = (
        '<p class="no" role="alert">Esa no es la contraseña. · Senha incorreta. · Wrong password.</p>'
        if wrong
        else ""
    )
    page = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Cardmática · versión de prueba</title>
<style>
    body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box;
           font: 16px/1.5 system-ui, "Segoe UI", sans-serif; color: #e8f1fb;
           background: radial-gradient(900px 520px at 12% -8%, rgba(70, 160, 225, .3), transparent), #07101c; }}
    main {{ width: min(380px, 100%); padding: 24px; border-radius: 14px; background: #0e1a2c;
           border: 1px solid rgba(255, 255, 255, .12); box-shadow: 0 12px 32px rgba(0, 0, 0, .4); }}
    h1 {{ margin: 0 0 4px; font-size: 22px; font-weight: 600; }}
    h1 b {{ color: #6fd3f2; }}
    p {{ margin: 0 0 16px; color: #9fb3c8; font-size: 14px; }}
    label {{ display: block; margin-bottom: 6px; font-size: 14px; }}
    input {{ width: 100%; box-sizing: border-box; padding: 12px; border-radius: 8px; font: inherit;
            border: 1px solid rgba(255, 255, 255, .2); background: #07101c; color: inherit; }}
    button {{ width: 100%; margin-top: 12px; padding: 12px; border: 0; border-radius: 8px; font: inherit;
             font-weight: 600; background: #2a8fd0; color: #fff; cursor: pointer; }}
    .no {{ color: #ff8a8a; }}
    small {{ display: block; margin-top: 14px; color: #7f93a8; font-size: 12px; }}
</style>
</head>
<body>
<main>
    <h1>Card<b>mática</b></h1>
    <p>Versión de prueba: escribe la contraseña que te compartieron.</p>
    {error}
    <form method="post" action="{GATE_PATH}">
        <input type="hidden" name="next" value="{quote(next_path, safe="/?=&%")}">
        <label for="password">Contraseña · Senha · Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
        <button type="submit">Entrar</button>
    </form>
    <small>Se recuerda en este navegador durante {COOKIE_DAYS} días.</small>
</main>
</body>
</html>"""
    return HTMLResponse(page, status_code=401, headers={"Cache-Control": "no-store"})


async def _read_form(receive: Receive) -> dict[str, str]:
    body = b""
    while True:
        message = await receive()
        body += message.get("body", b"")
        if len(body) > MOST_FORM_BYTES or not message.get("more_body"):
            break
    fields = parse_qs(body[:MOST_FORM_BYTES].decode("utf-8", "replace"))
    return {name: values[0] for name, values in fields.items()}


def _secure(scope: Scope) -> bool:
    return scope.get("scheme") == "https" or _header(scope, b"x-forwarded-proto") == "https"


class TestSiteMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        settings = get_settings()
        if scope["type"] != "http" or not settings.test_site:
            return await self.app(scope, receive, send)
        password = settings.test_site_password
        path = scope["path"]
        if password and not path.startswith(OPEN_PATHS):
            if path == GATE_PATH and scope["method"] == "POST":
                response = await self._enter(scope, receive, password)
            elif _let_in(scope, settings):
                response = None
            elif scope["method"] == "GET" and "text/html" in _header(scope, b"accept"):
                query = scope.get("query_string", b"").decode("latin-1")
                response = _gate_page(path + (f"?{query}" if query else ""), wrong=False)
            else:
                response = PlainTextResponse(
                    "Versión de prueba de Cardmática: hace falta la contraseña.", status_code=401
                )
            if response is not None:
                response.headers.append(*(part.decode() for part in NOINDEX))
                return await response(scope, receive, send)

        async def send_noindex(message):
            if message["type"] == "http.response.start":
                message["headers"] = [*message.get("headers", []), NOINDEX]
            await send(message)

        await self.app(scope, receive, send_noindex)

    async def _enter(self, scope: Scope, receive: Receive, password: str):
        form = await _read_form(receive)
        next_path = _safe_next(form.get("next", "/"))
        if not _same(form.get("password", "").strip(), password):
            await asyncio.sleep(WRONG_WAIT_SECONDS)
            return _gate_page(next_path, wrong=True)
        response = RedirectResponse(next_path, status_code=303)
        response.set_cookie(
            COOKIE,
            _token(password),
            max_age=COOKIE_DAYS * 86400,
            httponly=True,
            secure=_secure(scope),
            samesite="lax",
        )
        return response
