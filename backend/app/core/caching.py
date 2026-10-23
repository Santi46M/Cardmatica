"""Cache-Control for the site's own files.

Scripts and styles keep their names between versions, so the browser must
check with the server before reusing them ("no-cache" plus the ETag the
static file server already sends: an unchanged file costs a 304 with no
body). Icons and the Open Graph image change rarely and can be kept a day.
API answers are never stored by shared caches.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

ASSET_SECONDS = 86400

RULES = (
    ("/frontend/assets/", f"public, max-age={ASSET_SECONDS}"),
    ("/favicon.ico", f"public, max-age={ASSET_SECONDS}"),
    ("/frontend/", "no-cache"),
    ("/styles.css", "no-cache"),
    ("/api/", "private, no-store"),
)


class CacheControlMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if "cache-control" not in response.headers:
            path = request.url.path
            rule = next((value for prefix, value in RULES if path.startswith(prefix)), None)
            # Pages (HTML) are revalidated too, so a new version shows at once.
            response.headers["Cache-Control"] = rule or "no-cache"
        return response
