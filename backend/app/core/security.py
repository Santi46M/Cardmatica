"""HTTP security headers sent with every response.

The page uses only its own scripts, styles and images (no CDN, no inline
<script>), so the Content-Security-Policy can be strict. Inline style
attributes are still allowed because the demo store and charts set colours
with style="...".
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)

HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
}

# The interactive API docs load their scripts from a CDN; they keep the other
# headers but not the page's Content-Security-Policy.
DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")

# Browsers remember HTTPS-only for this long (one year).
HSTS_SECONDS = 31536000


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, hsts: bool):
        super().__init__(app)
        self.hsts = hsts

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        for name, value in HEADERS.items():
            response.headers.setdefault(name, value)
        if not request.url.path.startswith(DOCS_PATHS):
            response.headers.setdefault("Content-Security-Policy", CONTENT_SECURITY_POLICY)
        # HSTS only makes sense over HTTPS; behind a proxy the original scheme
        # arrives in X-Forwarded-Proto.
        scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
        if self.hsts and scheme == "https":
            response.headers.setdefault(
                "Strict-Transport-Security", f"max-age={HSTS_SECONDS}; includeSubDomains"
            )
        return response
