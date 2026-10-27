"""HTML pages: the single-page app, the address of each card, set and archetype,
legal pages, 404, plus what search engines and browsers ask for (robots.txt,
sitemap.xml, icons).

Every page is sent with its own title, description and Open Graph tags, and
with absolute addresses in og:url, og:image and the canonical link, as link
previews (WhatsApp, Telegram, X) and search engines require. Its scripts and
stylesheet are linked by versioned address (app/core/assets.py).

Pages come in the visitor's language (app/core/languages.py): the static text
is translated here with the frontend's dictionary, which the page also loads
for what its scripts write; each language has its own address (?lang=pt) for
search engines, announced with hreflang links.
"""

import html
import re
from uuid import UUID
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, Response
from sqlalchemy import select

from app.api.dependencies import SessionDep, site_url
from app.core import assets, languages
from app.core.config import ROOT, get_settings
from app.core.security import content_security_policy
from app.models import Archetype, Card, CardSet

router = APIRouter(include_in_schema=False)
PAGES = ROOT / "frontend" / "pages"
ASSETS = ROOT / "frontend" / "assets"
INDEX = ROOT / "index.html"
LEGAL_PAGES = {"terminos", "privacidad", "normas", "cookies", "reembolsos", "aviso-legal"}
# One footer for every page: legal links, language and the cookie notice.
FOOTER = PAGES / "footer.html"
_FOOTER = re.compile(r'<footer class="site-footer">.*?</footer>', re.S)
# The legal notice's details (settings business_*), one <dd data-business="…">.
_BUSINESS = re.compile(r'<dd data-business="(\w+)"></dd>')
# Search engines read at most 50,000 addresses per sitemap file.
SITEMAP_LIMIT = 50000


page_language = languages.for_request


def tr(request: Request, text: str, **values) -> str:
    return languages.translate(page_language(request), text, **values)


# Visible text between tags, and the attributes people read.
_TEXT = re.compile(r">([^<>]*[^\s<>][^<>]*)<")
_ATTRIBUTE = re.compile(r'\b(placeholder|aria-label|title|alt|content)="([^"]+)"')


def translate_static(page: str, lang: str) -> str:
    """Translate the page's own text (not what its scripts write later)."""
    words = languages.dictionary(lang)
    if not words:
        return page

    def text(match):
        original = match.group(1)
        found = words.get(" ".join(original.split()))
        if found is None:
            return match.group(0)
        start = original[: len(original) - len(original.lstrip())]
        end = original[len(original.rstrip()) :]
        return f">{start}{html.escape(found, quote=False)}{end}<"

    def attribute(match):
        found = words.get(html.unescape(match.group(2)))
        return match.group(0) if found is None else f'{match.group(1)}="{html.escape(found)}"'

    # Inline scripts (the import map) are added later, so none is touched here.
    return _ATTRIBUTE.sub(attribute, _TEXT.sub(text, page))


def _business_detail(match) -> str:
    value = getattr(get_settings(), f"business_{match.group(1)}", "")
    if value:
        return f"<dd>{html.escape(value)}</dd>"
    # Not filled in yet: said in words (translated with the page) and marked.
    return (
        '<dd>Pendiente de completar<span class="prov" role="img" '
        'aria-label="Borrador provisional" title="Borrador provisional"></span></dd>'
    )


def _alternates(base: str, path: str) -> str:
    links = [
        f'<link rel="alternate" hreflang="{languages.HTML_LANG[code]}" href="{base}{path}'
        + ("" if code == languages.DEFAULT else f"?lang={code}")
        + '">'
        for code in languages.LANGUAGES
    ]
    links.append(f'<link rel="alternate" hreflang="x-default" href="{base}{path}">')
    return "\n    ".join(links)


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
    lang = page_language(request)
    # A legal page may have its own version in this language (terminos.pt.html).
    translated = file.with_name(f"{file.stem}.{lang}{file.suffix}")
    page = (translated if translated.is_file() else file).read_text(encoding="utf-8")
    page = _FOOTER.sub(lambda _: FOOTER.read_text(encoding="utf-8").strip(), page, count=1)
    page = _BUSINESS.sub(_business_detail, page)
    if lang != languages.DEFAULT:
        page = translate_static(page, lang)
    # The cover (/) shows no marketplace: its header is drawn without one, from
    # the start (styles.css, [data-screen="portal"]).
    view = ' data-screen="portal"' if path == "/" else ""
    page = page.replace('<html lang="es">', f'<html lang="{languages.HTML_LANG[lang]}"{view}>', 1)
    page = _meta(page, "property", "og:locale", languages.OG_LOCALE[lang])
    # The dictionary for what the scripts write, right after the code that uses
    # it; only the catalogue page has scripts that write text.
    if lang != languages.DEFAULT and "/frontend/demo/data.js" in page:
        page = page.replace(
            '<script src="/frontend/i18n.js"></script>',
            f'<script src="/frontend/i18n.js"></script><script src="/frontend/i18n/{lang}.js"></script>',
            1,
        )
    base = site_url(request)
    address = path if lang == languages.DEFAULT else f"{path}?lang={lang}"
    if title:
        title = html.escape(title)
        page = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", page, count=1, flags=re.S)
        page = _meta(page, "property", "og:title", title)
    if description:
        description = html.escape(description)
        page = _meta(page, "name", "description", description)
        page = _meta(page, "property", "og:description", description)
    page = _meta(page, "property", "og:url", f"{base}{address}")
    page = page.replace(
        'content="/frontend/assets/og-image.png"', f'content="{base}/frontend/assets/og-image.png"'
    )
    page = re.sub(
        r'<link rel="canonical" href="[^"]*">',
        f'<link rel="canonical" href="{base}{address}">\n    {_alternates(base, path)}',
        page,
        count=1,
    )
    page, import_map = assets.version_page(page)
    response = HTMLResponse(page, status_code=status_code)
    # The same address answers in each visitor's language.
    response.headers["Vary"] = "Accept-Language, Cookie"
    if languages.supported(request.query_params.get("lang")):
        response.set_cookie(
            languages.COOKIE, lang, max_age=365 * 86400, samesite="lax", httponly=False
        )
    if import_map:
        response.headers["Content-Security-Policy"] = content_security_policy(import_map)
    return response


def not_found_page(request: Request) -> HTMLResponse:
    return render(PAGES / "404.html", request, path=request.url.path, status_code=404)


# Each game has its own marketplace under its own address; "/" is the cover
# that leads to them (frontend/js/portal.js).
GAME_PAGES = {
    "yugioh": (
        "Cardmática · Cartas de Yu-Gi-Oh! en el Mercosur",
        "Catálogo de cartas de Yu-Gi-Oh! TCG y OCG con banlist, impresiones e historial de "
        "precios, para compradores y vendedores del Mercosur.",
    ),
    "magic": (
        "Cardmática · Cartas de Magic: The Gathering en el Mercosur",
        "Cartas sueltas, sobres y accesorios de Magic: The Gathering: impresiones, rarezas, "
        "acabados foil y formatos, para compradores y vendedores del Mercosur.",
    ),
    "pokemon": (
        "Cardmática · Cartas de Pokémon en el Mercosur",
        "Cartas sueltas, sobres y accesorios de Pokémon TCG, internacionales y japonesas: "
        "rarezas, variantes holo y formatos, para compradores y vendedores del Mercosur.",
    ),
}
GAME_NAMES = {"yugioh": "Yu-Gi-Oh!", "magic": "Magic: The Gathering", "pokemon": "Pokémon"}


@router.get("/")
def index(request: Request):
    return render(
        INDEX,
        request,
        path="/",
        title=tr(request, "Cardmática · Marketplace de cartas coleccionables del Mercosur"),
        description=tr(
            request,
            "Compra y vende cartas de Yu-Gi-Oh!, Magic: The Gathering y Pokémon en el Mercosur: impresiones, rarezas, historial de precios y vendedores de la región.",
        ),
    )


@router.get("/yugioh")
@router.get("/magic")
@router.get("/pokemon")
def game_page(request: Request):
    game = request.url.path.strip("/")
    title, description = GAME_PAGES[game]
    return render(
        INDEX,
        request,
        path=f"/{game}",
        title=tr(request, title),
        description=tr(request, description),
    )


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
    return render(
        INDEX, request, path=request.url.path, title=tr(request, "Tu cuenta · Cardmática")
    )


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
        title=tr(request, "{name} · Cartas sueltas · Cardmática", name=name),
        description=tr(
            request,
            "{name}: impresiones, rarezas, estado en la banlist e historial de precios en Cardmática.",
            name=name,
        ),
    )


@router.get("/set/{set_id}")
@router.get("/set/{set_id}/{slug}")
def set_page(set_id: UUID, request: Request, session: SessionDep, slug: str | None = None):
    row = session.get(CardSet, set_id)
    if not row:
        return not_found_page(request)
    title = (
        tr(
            request,
            "{name} · Set de Yu-Gi-Oh! {market} · Cardmática",
            name=row.name,
            market=row.market,
        )
        if row.game == "yugioh"
        else tr(
            request, "{name} · Set de {game} · Cardmática", name=row.name, game=GAME_NAMES[row.game]
        )
    )
    return render(
        INDEX,
        request,
        path=f"/set/{set_id}",
        title=title,
        description=tr(
            request, "{name}: cartas sueltas, cajas y sobres del set en Cardmática.", name=row.name
        ),
    )


@router.get("/arquetipo/{archetype_id}")
@router.get("/arquetipo/{archetype_id}/{slug}")
def archetype_page(
    archetype_id: UUID, request: Request, session: SessionDep, slug: str | None = None
):
    row = session.get(Archetype, archetype_id)
    if not row:
        return not_found_page(request)
    return render(
        INDEX,
        request,
        path=f"/arquetipo/{archetype_id}",
        title=tr(request, "Arquetipo {name} · Cardmática", name=row.name),
        description=tr(
            request, "Todas las cartas del arquetipo {name} en Cardmática.", name=row.name
        ),
    )


@router.get("/robots.txt")
def robots(request: Request):
    return PlainTextResponse(
        f"User-agent: *\nDisallow: /api/\nSitemap: {site_url(request)}/sitemap.xml\n"
    )


@router.get("/sitemap.xml")
def sitemap(request: Request, session: SessionDep):
    base = site_url(request)
    entries = [(f"{base}/", None)] + [(f"{base}/{name}", None) for name in GAME_PAGES]
    entries += [(f"{base}/{name}", None) for name in sorted(LEGAL_PAGES)]
    cards = session.execute(
        select(Card.id, Card.updated_at)
        .order_by(Card.display_name)
        .limit(SITEMAP_LIMIT - len(entries))
    )
    entries += [(f"{base}/carta/{card_id}", updated) for card_id, updated in cards]
    for path, model in (("set", CardSet), ("arquetipo", Archetype)):
        rows = session.execute(
            select(model.id, model.updated_at).limit(max(0, SITEMAP_LIMIT - len(entries)))
        )
        entries += [(f"{base}/{path}/{row_id}", updated) for row_id, updated in rows]
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
