"""Provisional photos of the demo products, for the local preview only.

Each demo product (frontend/demo/data.js) names its official page in
app/data/product_pages.json. `cardmatica product-images` reads the main picture
that page declares for sharing (og:image, else twitter:image, else the infobox
picture of a Yugipedia page) and keeps a small WebP copy in the image folder.

These photos belong to Konami and to each brand and have no licence here: the
API serves them only when the local image preview is on and the request comes
from a preview host, exactly like the provisional card artwork. Nothing is
fetched by the API itself.
"""

import io
import ipaddress
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup
from PIL import Image

from app.integrations.http import AccessDenied, ExternalError, PoliteHttpClient

PAGES_FILE = Path(__file__).resolve().parents[1] / "data/product_pages.json"
FOLDER = "products"
INDEX = "index.json"
KEY = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")
MAX_SIDE = 480


def load_pages(path: Path = PAGES_FILE) -> tuple[dict[str, str], set[str]]:
    """The page of each product key, and the image hosts allowed besides each page's own."""
    data = json.loads(path.read_text(encoding="utf-8"))
    pages = data["pages"]
    for key, url in pages.items():
        if not KEY.match(key) or urlsplit(url).scheme != "https":
            raise ValueError(f"Entrada inválida en {path.name}: {key}")
    return pages, set(data.get("image_hosts", []))


def picture_url(html: str, page_url: str) -> str | None:
    """The main picture a product page declares, as an absolute address."""
    soup = BeautifulSoup(html, "html.parser")
    for attribute, name in (("property", "og:image"), ("name", "twitter:image")):
        tag = soup.find("meta", attrs={attribute: name})
        if tag and tag.get("content", "").strip():
            return urljoin(page_url, tag["content"].strip())
    image = soup.select_one(".infobox img, .imagecolumn img")
    if image and image.get("src"):
        return urljoin(page_url, image["src"])
    return None


def _domain(host: str) -> str:
    return ".".join(host.split(".")[-2:])


def allowed_picture_host(picture: str, page: str, extra_hosts: set[str]) -> bool:
    """A picture may come from its page's own site (any subdomain) or a listed CDN."""
    parts = urlsplit(picture)
    host = parts.hostname or ""
    try:
        ipaddress.ip_address(host)
        return False  # Never a bare address: only named sites.
    except ValueError:
        pass
    if parts.scheme != "https" or parts.port not in (None, 443) or parts.username:
        return False
    return host in extra_hosts or _domain(host) == _domain(urlsplit(page).hostname or "")


def folder(settings) -> Path:
    return settings.image_directory.resolve() / FOLDER


def read_index(settings) -> dict:
    try:
        return json.loads((folder(settings) / INDEX).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def stored_file(settings, key: str) -> Path | None:
    """The saved photo of a product, if there is one inside the image folder."""
    if not KEY.match(key):
        return None
    entry = read_index(settings).get(key)
    root = folder(settings)
    path = (root / entry["file"]).resolve() if entry else None
    return path if path and path.is_relative_to(root) and path.is_file() else None


def shrink(content: bytes) -> bytes:
    """Decode and re-encode, so only a plain raster image is ever kept."""
    with Image.open(io.BytesIO(content)) as raster:
        if raster.format not in {"PNG", "JPEG", "WEBP", "GIF"} or (
            raster.width * raster.height > 40_000_000
        ):
            raise ValueError("Formato o tamaño de imagen no permitido")
        raster.load()
        raster = raster.convert("RGBA")
        raster.thumbnail((MAX_SIDE, MAX_SIDE))
        out = io.BytesIO()
        raster.save(out, "WEBP", quality=82)
        return out.getvalue()


async def download_all(settings, *, refresh=False, transport=None, pages_file=PAGES_FILE):
    """Fetch the photo of every product page; returns what was saved and what failed."""
    pages, extra_hosts = load_pages(pages_file)
    client = PoliteHttpClient("products", settings, transport=transport)
    client.check_policy()
    root = folder(settings)
    root.mkdir(parents=True, exist_ok=True)
    index = {} if refresh else read_index(settings)
    saved, failed = [], {}
    try:
        for key, page in pages.items():
            if key in index and not refresh and stored_file(settings, key):
                continue
            try:
                # The page's site, with and without "www.", for its own redirects.
                bare = urlsplit(page).hostname.removeprefix("www.")
                client.allowed_hosts |= {bare, f"www.{bare}"}
                response = await client.get(page, ttl=7 * 86400, refresh=refresh)
                picture = picture_url(response.text, page)
                if not picture:
                    raise ExternalError("La página no indica una foto principal")
                if not allowed_picture_host(picture, page, extra_hosts):
                    raise AccessDenied(f"Foto fuera del sitio del producto: {picture}")
                client.allowed_hosts.add(urlsplit(picture).hostname)
                image = await client.get(picture, ttl=30 * 86400, refresh=refresh)
                name = f"{key}.webp"
                (root / name).write_bytes(shrink(image.content))
                index[key] = {
                    "file": name,
                    "page": page,
                    "picture": picture,
                    "fetched": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                }
                saved.append(key)
            except (AccessDenied, ExternalError, ValueError, OSError) as error:
                failed[key] = str(error)
            except Exception as error:  # A broken page must not stop the rest.
                failed[key] = f"{type(error).__name__}: {error}"
    finally:
        await client.close()
        (root / INDEX).write_text(json.dumps(index, indent=2, sort_keys=True), encoding="utf-8")
    return {"saved": saved, "kept": len(index) - len(saved), "failed": failed}
