"""HTML pages: the single-page app, a card's own address, legal pages, 404,
plus what search engines and browsers ask for (robots.txt, sitemap.xml, icons).

Every page is sent with its own title, description and Open Graph tags, and
with absolute addresses in og:url, og:image and the canonical link, as link
previews (WhatsApp, Telegram, X) and search engines require.
"""

import html
import re
from uuid import UUID
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, Response
from sqlalchemy import select

from app.api.dependencies import SessionDep, site_url
from app.core.config import ROOT
from app.models import Card

router = APIRouter(include_in_schema=False)
PAGES = ROOT / "frontend" / "pages"
ASSETS = ROOT / "frontend" / "assets"
INDEX = ROOT / "index.html"
LEGAL_PAGES = {"terminos", "privacidad", "normas"}
SITE = "Cardmática"
# Search engines read at most 50,000 addresses per sitemap file.
SITEMAP_LIMIT = 50000


def _meta(page: str, attribute: str, name: str, value: str) -> str:
    pattern = re.compile(rf'<meta {attribute}="{re.escape(name)}" content="[^"]*">')
    return pattern.sub(f'<meta {attribute}="{name}" content="{value}">', page, count=1)


def render(
    file,
    request: Request,
    *,
    path: str,
    title: str | None = None,
    description: str | None = None,
    status_code: int = 200,
) -> HTMLResponse:
    page = file.read_text(encoding="utf-8")
    base = site_url(request)
    if title:
        title = html.escape(title)
        page = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", page, count=1, flags=re.S)
        page = _meta(page, "property", "og:title", title)
    if description:
        description = html.escape(description)
        page = _meta(page, "name", "description", description)
        page = _meta(page, "property", "og:description", description)
    page = _meta(page, "property", "og:url", f"{base}{path}")
    page = page.replace(
        'content="/frontend/assets/og-image.png"', f'content="{base}/frontend/assets/og-image.png"'
    )
    page = re.sub(
        r'<link rel="canonical" href="[^"]*">',
        f'<link rel="canonical" href="{base}{path}">',
        page,
        count=1,
    )
    return HTMLResponse(page, status_code=status_code)


def not_found_page(request: Request) -> HTMLResponse:
    return render(PAGES / "404.html", request, path=request.url.path, status_code=404)


@router.get("/")
def index(request: Request):
    return render(INDEX, request, path="/")


@router.get("/styles.css")
def styles():
    return FileResponse(ROOT / "styles.css", media_type="text/css")


@router.get("/favicon.ico")
def favicon():
    return FileResponse(ASSETS / "favicon.ico", media_type="image/x-icon")


# Links from account emails open the page, which shows the matching form.
@router.get("/verificar")
@router.get("/restablecer")
def account_link(request: Request):
    return render(INDEX, request, path=request.url.path, title=f"Tu cuenta · {SITE}")


@router.get("/carta/{card_id}")
@router.get("/carta/{card_id}/{slug}")
def card_page(card_id: UUID, request: Request, session: SessionDep, slug: str | None = None):
    name = session.scalar(select(Card.display_name).where(Card.id == card_id))
    if not name:
        return not_found_page(request)
    return render(
        INDEX,
        request,
        path=f"/carta/{card_id}",
        title=f"{name} · Cartas sueltas · {SITE}",
        description=f"{name}: impresiones, rarezas, estado en la banlist e historial de precios en {SITE}.",
    )


@router.get("/robots.txt")
def robots(request: Request):
    return PlainTextResponse(
        f"User-agent: *\nDisallow: /api/\nSitemap: {site_url(request)}/sitemap.xml\n"
    )


@router.get("/sitemap.xml")
def sitemap(request: Request, session: SessionDep):
    base = site_url(request)
    entries = [(f"{base}/", None)] + [(f"{base}/{name}", None) for name in sorted(LEGAL_PAGES)]
    cards = session.execute(
        select(Card.id, Card.updated_at)
        .order_by(Card.display_name)
        .limit(SITEMAP_LIMIT - len(entries))
    )
    entries += [(f"{base}/carta/{card_id}", updated) for card_id, updated in cards]
    urls = "".join(
        f"<url><loc>{xml_escape(loc)}</loc>"
        + (f"<lastmod>{updated.date().isoformat()}</lastmod>" if updated else "")
        + "</url>"
        for loc, updated in entries
    )
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>'
    )
    return Response(body, media_type="application/xml")


# Last: one-word paths not matched above are legal pages or a 404.
@router.get("/{name}")
def legal_page(name: str, request: Request):
    if name not in LEGAL_PAGES:
        return not_found_page(request)
    return render(PAGES / f"{name}.html", request, path=f"/{name}")
