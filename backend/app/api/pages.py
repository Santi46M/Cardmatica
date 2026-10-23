"""HTML pages: the single-page app, a card's own address, legal pages, 404.

/carta/<id> serves the same page as / with the card's name in the title and
description, so a shared link or a search engine shows which card it is;
the page then opens that card (frontend/js/catalog.js).
"""

import html
import re
from uuid import UUID

from fastapi import APIRouter
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse
from sqlalchemy import select

from app.api.dependencies import SessionDep
from app.core.config import ROOT
from app.models import Card

router = APIRouter(include_in_schema=False)
PAGES = ROOT / "frontend" / "pages"
LEGAL_PAGES = {"terminos", "privacidad", "normas"}
SITE = "Cardmática"
DEFAULT_TITLE = re.compile(r"<title>.*?</title>", re.S)
DEFAULT_DESCRIPTION = re.compile(r'<meta name="description" content="[^"]*">')


def not_found_page() -> HTMLResponse:
    return HTMLResponse((PAGES / "404.html").read_text(encoding="utf-8"), status_code=404)


@router.get("/")
def index():
    return FileResponse(ROOT / "index.html")


@router.get("/styles.css")
def styles():
    return FileResponse(ROOT / "styles.css", media_type="text/css")


@router.get("/carta/{card_id}")
@router.get("/carta/{card_id}/{slug}")
def card_page(card_id: UUID, session: SessionDep, slug: str | None = None):
    name = session.scalar(select(Card.display_name).where(Card.id == card_id))
    if not name:
        return not_found_page()
    title = html.escape(f"{name} · Cartas sueltas · {SITE}")
    description = html.escape(
        f"{name}: impresiones, rarezas, estado en la banlist e historial de precios en {SITE}."
    )
    page = (ROOT / "index.html").read_text(encoding="utf-8")
    page = DEFAULT_TITLE.sub(f"<title>{title}</title>", page, count=1)
    page = DEFAULT_DESCRIPTION.sub(
        f'<meta name="description" content="{description}">'
        f'\n    <link rel="canonical" href="/carta/{card_id}">',
        page,
        count=1,
    )
    return HTMLResponse(page)


@router.get("/robots.txt")
def robots():
    return PlainTextResponse("User-agent: *\nDisallow: /api/\n")


# Last: one-word paths not matched above are legal pages or a 404.
@router.get("/{name}")
def legal_page(name: str):
    if name not in LEGAL_PAGES:
        return not_found_page()
    return FileResponse(PAGES / f"{name}.html", media_type="text/html")
