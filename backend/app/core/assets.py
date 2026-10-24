"""Versioned addresses for the site's scripts and stylesheet.

Pages link each script and the stylesheet as `<path>?v=<hash of its content>`.
A versioned address always holds the same bytes, so browsers keep it for a
year without asking again (caching.py); a changed file gets a new address and
is downloaded at once. There is no build step: the hash is read from the file
and recomputed only when the file changes.

The modules import each other by relative path ("./api.js"), which carries no
version, so pages with modules also get an import map that sends each module
to its versioned address. The map is the page's only inline script, and the
Content-Security-Policy allows exactly that script by its SHA-256.
"""

import base64
import hashlib
import json
import re
from pathlib import Path

from app.core.config import ROOT

FRONTEND = (ROOT / "frontend").resolve()
STYLESHEET = ROOT / "styles.css"
MODULES = FRONTEND / "js"
# A script or the stylesheet linked from a page. Icons and images keep their
# plain names and a shorter cache (caching.py).
_LINK = re.compile(r'(src|href)="(/frontend/[\w/-]+\.(?:js|css)|/styles\.css)"')
_FIRST_MODULE = re.compile(r'<link rel="modulepreload"|<script type="module"')
# path -> ((modification time, size), version)
_versions: dict[Path, tuple[tuple[int, int], str]] = {}


def file_for(url_path: str) -> Path | None:
    """The file behind a script or stylesheet address, or None."""
    if url_path == "/styles.css":
        return STYLESHEET
    if url_path.startswith("/frontend/") and url_path.endswith((".js", ".css")):
        path = (ROOT / url_path.lstrip("/")).resolve()
        if path.is_relative_to(FRONTEND) and path.is_file():
            return path
    return None


def version(path: Path) -> str:
    """The first 12 hex digits of the file's SHA-256."""
    stat = path.stat()
    key = (stat.st_mtime_ns, stat.st_size)
    cached = _versions.get(path)
    if cached and cached[0] == key:
        return cached[1]
    digest = hashlib.sha256(path.read_bytes()).hexdigest()[:12]
    _versions[path] = (key, digest)
    return digest


def versioned(url_path: str) -> str:
    path = file_for(url_path)
    return f"{url_path}?v={version(path)}" if path else url_path


def is_current(url_path: str, value: str | None) -> bool:
    """True when ?v= names the file as it is now (an old version is not kept)."""
    path = file_for(url_path) if value else None
    return bool(path) and value == version(path)


def import_map() -> str:
    imports = {
        f"/frontend/js/{module.name}": versioned(f"/frontend/js/{module.name}")
        for module in sorted(MODULES.glob("*.js"))
    }
    return json.dumps({"imports": imports}, separators=(",", ":"))


def script_source(script: str) -> str:
    """The Content-Security-Policy source that allows exactly this inline script."""
    digest = base64.b64encode(hashlib.sha256(script.encode("utf-8")).digest()).decode()
    return f"'sha256-{digest}'"


def version_page(page: str) -> tuple[str, str | None]:
    """Version the page's links and put the import map before its first module.

    Returns the page and the policy source for the map (None without modules).
    """
    page = _LINK.sub(lambda match: f'{match[1]}="{versioned(match[2])}"', page)
    first = _FIRST_MODULE.search(page)
    if not first:
        return page, None
    script = import_map()
    tag = f'<script type="importmap">{script}</script>\n    '
    return page[: first.start()] + tag + page[first.start() :], script_source(script)
