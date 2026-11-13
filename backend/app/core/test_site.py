"""The test site (TEST_SITE=true, render.yaml).

Every answer tells search engines not to index it, and with TEST_SITE_PASSWORD
the browser asks for that password before showing anything (HTTP Basic: any
user name, that password). The host's health check (/health/...) always gets
through, or the host would think the site is down. Pages also say it is a test
site (app/api/pages.py).
"""

import base64
import binascii
import secrets

from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import get_settings

NOINDEX = (b"x-robots-tag", b"noindex, nofollow")
OPEN_PATHS = ("/health/",)


def _password_from(scope: Scope) -> str | None:
    for name, value in scope.get("headers", []):
        if name != b"authorization":
            continue
        kind, _, encoded = value.decode("latin-1").partition(" ")
        if kind.lower() != "basic":
            return None
        try:
            decoded = base64.b64decode(encoded, validate=True).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError):
            return None
        return decoded.partition(":")[2]
    return None


class TestSiteMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        settings = get_settings()
        if scope["type"] != "http" or not settings.test_site:
            return await self.app(scope, receive, send)
        password = settings.test_site_password
        if password and not scope["path"].startswith(OPEN_PATHS):
            given = _password_from(scope)
            if given is None or not secrets.compare_digest(given.encode(), password.encode()):
                response = PlainTextResponse(
                    "Versión de prueba de Cardmática: hace falta la contraseña.",
                    status_code=401,
                    headers={
                        "WWW-Authenticate": 'Basic realm="Cardmatica (prueba)", charset="UTF-8"'
                    },
                )
                response.headers.append(*(part.decode() for part in NOINDEX))
                return await response(scope, receive, send)

        async def send_noindex(message):
            if message["type"] == "http.response.start":
                message["headers"] = [*message.get("headers", []), NOINDEX]
            await send(message)

        await self.app(scope, receive, send_noindex)
