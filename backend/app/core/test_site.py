"""The test site (TEST_SITE=true, render.yaml).

Every answer tells search engines not to index it, and with TEST_SITE_PASSWORD
the browser asks for a user name and that password before showing anything
(HTTP Basic; the user name must be TEST_SITE_USER when it is set). The host's health check (/health/...) always gets
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


def _credentials(scope: Scope) -> tuple[str, str] | None:
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
        user, _, password = decoded.partition(":")
        return user, password
    return None


def _same(given: str, expected: str) -> bool:
    return secrets.compare_digest(given.encode(), expected.encode())


class TestSiteMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        settings = get_settings()
        if scope["type"] != "http" or not settings.test_site:
            return await self.app(scope, receive, send)
        password = settings.test_site_password
        if password and not scope["path"].startswith(OPEN_PATHS):
            given = _credentials(scope)
            expected_user = settings.test_site_user
            if (
                given is None
                or not _same(given[1], password)
                or (expected_user and not _same(given[0], expected_user))
            ):
                response = PlainTextResponse(
                    "Versión de prueba de Cardmática: hace falta el usuario y la contraseña.",
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
