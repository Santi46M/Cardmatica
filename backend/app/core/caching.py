"""Cache-Control for the site's own files.

Scripts and styles keep their names between versions, so the browser must
check with the server before reusing them ("no-cache" plus the ETag the
static file server already sends: an unchanged file costs a 304 with no
body). Icons and the Open Graph image change rarely and can be kept a day.
Catalogue answers may be reused for a minute; account and admin answers are
never stored.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

ASSET_SECONDS = 86400

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
            rule = next((value for prefix, value in RULES if path.startswith(prefix)), None)
            # Pages (HTML) are revalidated too, so a new version shows at once.
            response.headers["Cache-Control"] = rule or "no-cache"
        return response
