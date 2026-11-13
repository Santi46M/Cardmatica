"""Cache-Control for the site's own files.

Pages link scripts and the stylesheet by versioned address (assets.py): the
current version of a file is kept for a year and never checked again. Any
other address of a script or style, such as an old version, must be checked
with the server before reuse ("no-cache" plus the ETag the static file server
sends: an unchanged file costs a 304 with no body). Icons and the Open Graph
image change rarely and can be kept a day. Catalogue answers may be reused
for a minute; account and admin answers are never stored.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core import assets

ASSET_SECONDS = 86400
VERSIONED = "public, max-age=31536000, immutable"

# Catalogue answers are public and change slowly: browsers and proxies may
# reuse them for a minute. Anything about a person never leaves their browser.
CATALOG_SECONDS = 60

# First match wins. Card images set their own (rights can be withdrawn).
RULES = (
    ("/frontend/assets/", f"public, max-age={ASSET_SECONDS}"),
    ("/favicon.ico", f"public, max-age={ASSET_SECONDS}"),
    ("/frontend/", "no-cache"),
    ("/styles.css", "no-cache"),
    ("/api/v1/auth", "private, no-store"),
    ("/api/v1/account", "private, no-store"),
    ("/api/v1/admin", "private, no-store"),
    ("/api/v1/analytics", "private, no-store"),
    ("/api/", f"public, max-age={CATALOG_SECONDS}"),
)


class CacheControlMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # Only successful reads are worth keeping; errors and changes are not.
        if request.method not in ("GET", "HEAD") or response.status_code >= 400:
            response.headers.setdefault("Cache-Control", "no-store")
        elif "cache-control" not in response.headers:
            path = request.url.path
            if assets.is_current(path, request.query_params.get("v")):
                rule = VERSIONED
            else:
                rule = next((value for prefix, value in RULES if path.startswith(prefix)), None)
            # Pages (HTML) are revalidated too, so a new version shows at once.
            response.headers["Cache-Control"] = rule or "no-cache"
        return response
