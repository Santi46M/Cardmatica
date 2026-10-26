from collections import Counter
from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import func, select

from app.api.dependencies import SessionDep
from app.core.config import get_settings
from app.models import (
    Archetype,
    Card,
    CardArchetype,
    CardArtwork,
    CardImage,
    CardPrinting,
    CardSet,
    Rarity,
)
from app.repositories.catalog import CatalogRepository, printing_loads
from app.schemas.catalog import (
    ArchetypeView,
    BanlistListView,
    CardDetail,
    CardSuggestion,
    CardSummary,
    ErratumView,
    NamedView,
    Page,
    PriceHistoryView,
    PrintingView,
    SetView,
)
from app.services import product_images as product_photos
from app.services import rarities
from app.services.banlists import current_lists, list_view, statuses_for_cards
from app.services.card_types import ATTRIBUTES, RACES, taxonomy
from app.services.catalog import card_detail, card_summary, errata_views, printing_view
from app.services.prices import last_sales, price_history
from app.services.trending import trending

router = APIRouter(prefix="/api/v1", tags=["Catálogo"])
PageNumber = Annotated[int, Query(ge=1, le=1000000)]
PageSize = Annotated[int, Query(ge=1, le=100)]
Market = Literal["TCG", "OCG"]


@router.get("/cards", response_model=Page[CardSummary])
def cards(
    session: SessionDep,
    page: PageNumber = 1,
    page_size: PageSize = 24,
    q: Annotated[str | None, Query(max_length=200)] = None,
    market: Market | None = None,
    card_type: Literal["Monster", "Spell", "Trap", "Skill"] | None = None,
    subtype: Annotated[str | None, Query(max_length=60)] = None,
    frame: Annotated[str | None, Query(max_length=20)] = None,
    ability: Annotated[str | None, Query(max_length=20)] = None,
    race: Annotated[str | None, Query(max_length=40)] = None,
    attribute: Annotated[str | None, Query(max_length=20)] = None,
    level: Annotated[int | None, Query(ge=0, le=13)] = None,
    rank: Annotated[int | None, Query(ge=0, le=13)] = None,
    link_rating: Annotated[int | None, Query(ge=1, le=8)] = None,
    card_property: Annotated[str | None, Query(alias="property", max_length=20)] = None,
    rarity: Annotated[str | None, Query(max_length=100)] = None,
    rarity_family: rarities.Family | None = None,
    set_id: UUID | None = None,
    archetype_id: UUID | None = None,
    product_type: Annotated[str | None, Query(max_length=60)] = None,
    sort: Literal["name", "name_desc", "newest", "oldest", "updated"] = "name",
    language: Annotated[str, Query(min_length=2, max_length=12)] = "es",
):
    rows, total = CatalogRepository(session).cards(
        page=page,
        page_size=page_size,
        q=q.strip() if q else None,
        market=market,
        card_type=card_type,
        subtype=subtype,
        frame=frame,
        ability=ability,
        race=race,
        attribute=attribute,
        level=level,
        rank=rank,
        link_rating=link_rating,
        card_property=card_property,
        rarity_names=rarity_names(session, rarity, rarity_family),
        set_id=set_id,
        archetype_id=archetype_id,
        product_type=product_type,
        sort=sort,
        language=language,
    )
    sales = last_sales(session, [row.id for row in rows], market)
    bans = statuses_for_cards(session, rows, market)
    items = []
    for row in rows:
        item = card_summary(row, language, market)
        item.last_sale = sales.get(row.id)
        item.market_banlist = bans.get(row.id)
        items.append(item)
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/suggest", response_model=list[CardSuggestion])
def suggest(
    session: SessionDep,
    q: Annotated[str, Query(min_length=2, max_length=100)],
    market: Market | None = None,
    language: Annotated[str, Query(min_length=2, max_length=12)] = "es",
    limit: Annotated[int, Query(ge=1, le=10)] = 6,
):
    """Suggestions while typing in the search box."""
    rows = CatalogRepository(session).suggestions(q.strip(), market=market, limit=limit)
    suggestions = []
    for row in rows:
        summary = card_summary(row, language, market)
        image = summary.image
        suggestions.append(
            CardSuggestion(
                id=summary.id,
                name=summary.name,
                types=summary.types,
                thumbnail_url=image and (image.thumbnail_url or image.url),
            )
        )
    return suggestions


def rarity_names(session, rarity, family):
    """Stored spellings for a rarity or a family; None when neither is asked."""
    if not rarity and not family:
        return None
    stored = session.scalars(select(Rarity.name))
    return rarities.stored_names(stored, rarity=rarity or None, family=family)


@router.get("/trending")
def trending_cards(
    session: SessionDep,
    market: Market = "TCG",
    limit: Annotated[int, Query(ge=1, le=12)] = 8,
    language: Annotated[str, Query(min_length=2, max_length=12)] = "es",
):
    """Lists of cards in fashion for the home page (app/services/trending.py)."""
    return {
        "lists": [
            {
                "key": key,
                "items": [
                    {"card": card_summary(card, language, market), "reason": reason}
                    for card, reason in items
                ],
            }
            for key, items in trending(session, market, limit=limit)
        ]
    }


def require_card(session, card_id):
    row = CatalogRepository(session).card(card_id)
    if not row:
        raise HTTPException(404, "Carta inexistente")
    return row


def require_card_exists(session, card_id):
    if not session.scalar(select(Card.id).where(Card.id == card_id)):
        raise HTTPException(404, "Carta inexistente")


@router.get("/cards/{card_id}", response_model=CardDetail)
def card(
    card_id: UUID,
    session: SessionDep,
    language: Annotated[str, Query(min_length=2, max_length=12)] = "es",
):
    return card_detail(session, require_card(session, card_id), language)


@router.get("/cards/{card_id}/printings", response_model=Page[PrintingView])
def printings(
    card_id: UUID,
    session: SessionDep,
    page: PageNumber = 1,
    page_size: PageSize = 24,
    market: Market | None = None,
):
    require_card_exists(session, card_id)
    rows, total = CatalogRepository(session).printings(
        card_id, page=page, page_size=page_size, market=market
    )
    return Page(
        items=[printing_view(row) for row in rows], total=total, page=page, page_size=page_size
    )


@router.get("/cards/{card_id}/errata", response_model=list[ErratumView])
def errata(card_id: UUID, session: SessionDep):
    require_card_exists(session, card_id)
    return errata_views(session, card_id)


@router.get("/cards/{card_id}/price-history", response_model=PriceHistoryView)
def card_price_history(
    card_id: UUID,
    session: SessionDep,
    market: Market | None = None,
    printing_id: UUID | None = None,
    language: Annotated[str | None, Query(min_length=2, max_length=12)] = None,
    edition: Annotated[str | None, Query(max_length=80)] = None,
    days: Annotated[int, Query(ge=1, le=3650)] = 365,
    points: bool = True,
):
    """Sales completed on Cardmática; never external price guides."""
    require_card_exists(session, card_id)
    return price_history(
        session,
        card_id,
        market=market,
        printing_id=printing_id,
        language=language,
        edition=edition,
        days=days,
        include_points=points,
    )


@router.get("/banlists", response_model=list[BanlistListView])
def banlists(session: SessionDep):
    """Lists in force today for TCG and OCG, with their source."""
    return [list_view(session, row) for row in current_lists(session)]


@router.get("/printings/{printing_id}", response_model=PrintingView)
def printing(printing_id: UUID, session: SessionDep):
    row = session.scalar(
        select(CardPrinting).where(CardPrinting.id == printing_id).options(*printing_loads())
    )
    if not row:
        raise HTTPException(404, "Impresión inexistente")
    return printing_view(row)


@router.get("/archetypes", response_model=Page[NamedView])
def archetypes(
    session: SessionDep,
    page: PageNumber = 1,
    page_size: PageSize = 24,
    q: Annotated[str | None, Query(max_length=200)] = None,
):
    query = select(Archetype)
    if q:
        query = query.where(Archetype.name.icontains(q, autoescape=True))
    total = session.scalar(select(func.count()).select_from(query.subquery()))
    rows = session.scalars(
        query.order_by(Archetype.name, Archetype.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return Page(
        items=[NamedView.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/archetypes/{archetype_id}", response_model=ArchetypeView)
def archetype(archetype_id: UUID, session: SessionDep):
    row = session.get(Archetype, archetype_id)
    if not row:
        raise HTTPException(404, "Arquetipo inexistente")
    members = select(func.count(func.distinct(CardArchetype.card_id))).where(
        CardArchetype.archetype_id == archetype_id, CardArchetype.relation == "member"
    )
    return ArchetypeView(id=row.id, name=row.name, card_count=session.scalar(members) or 0)


@router.get("/archetypes/{archetype_id}/cards", response_model=Page[CardSummary])
def archetype_cards(
    archetype_id: UUID,
    session: SessionDep,
    page: PageNumber = 1,
    page_size: PageSize = 24,
    market: Market | None = None,
):
    if not session.get(Archetype, archetype_id):
        raise HTTPException(404, "Arquetipo inexistente")
    rows, total = CatalogRepository(session).cards(
        archetype_id=archetype_id, page=page, page_size=page_size, market=market
    )
    return Page(
        items=[card_summary(row, market=market) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


def set_card_counts(session, set_ids):
    """Cards of the catalogue printed in each set."""
    return dict(
        session.execute(
            select(CardPrinting.set_id, func.count(func.distinct(CardPrinting.card_id)))
            .where(CardPrinting.set_id.in_(set_ids))
            .group_by(CardPrinting.set_id)
        ).all()
    )


def set_view(row, card_count, code=None):
    return SetView.model_validate(row).model_copy(update={"card_count": card_count, "code": code})


def set_code(session, set_id) -> str | None:
    """The most common prefix of the set's printing codes ("BETB-EN001" → "BETB")."""
    codes = session.scalars(
        select(CardPrinting.code).where(CardPrinting.set_id == set_id).limit(200)
    ).all()
    prefixes = Counter(code.split("-")[0].upper() for code in codes if "-" in code)
    return prefixes.most_common(1)[0][0] if prefixes else None


@router.get("/sets", response_model=Page[SetView])
def sets(
    session: SessionDep,
    page: PageNumber = 1,
    page_size: PageSize = 24,
    q: Annotated[str | None, Query(max_length=200)] = None,
    market: Market | None = None,
):
    query = select(CardSet)
    if q:
        query = query.where(CardSet.name.icontains(q, autoescape=True))
    if market:
        query = query.where(CardSet.market == market)
    total = session.scalar(select(func.count()).select_from(query.subquery()))
    rows = session.scalars(
        query.order_by(CardSet.release_date.desc().nullslast(), CardSet.name, CardSet.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    counts = set_card_counts(session, [row.id for row in rows])
    return Page(
        items=[set_view(row, counts.get(row.id, 0)) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


# A set with fewer cards than this in the catalogue (a promo, a prize card) is
# not the "latest set" of the home banner, unless no set has more.
LATEST_SET_MIN_CARDS = 5


@router.get("/sets/latest", response_model=SetView)
def latest_set(session: SessionDep, market: Market = "TCG"):
    """The most recently released set of a market, for the home banner."""
    cards = func.count(func.distinct(CardPrinting.card_id)).label("cards")
    counts = select(CardPrinting.set_id, cards).group_by(CardPrinting.set_id).subquery()
    query = (
        select(CardSet, counts.c.cards)
        .join(counts, counts.c.set_id == CardSet.id)
        .where(
            CardSet.market == market,
            CardSet.release_date.is_not(None),
            CardSet.release_date <= date.today(),
        )
        .order_by(CardSet.release_date.desc(), counts.c.cards.desc(), CardSet.name)
        .limit(1)
    )
    row = session.execute(query.where(counts.c.cards >= LATEST_SET_MIN_CARDS)).first()
    row = row or session.execute(query).first()
    if not row:
        raise HTTPException(404, "Ningún set con fecha de lanzamiento")
    card_set, count = row
    return set_view(card_set, count, set_code(session, card_set.id))


@router.get("/sets/{set_id}", response_model=SetView)
def card_set(set_id: UUID, session: SessionDep):
    row = session.get(CardSet, set_id)
    if not row:
        raise HTTPException(404, "Set inexistente")
    return set_view(
        row, set_card_counts(session, [set_id]).get(set_id, 0), set_code(session, set_id)
    )


def present(session, column):
    return set(session.scalars(select(column).where(column.is_not(None)).distinct()))


def types_present(session):
    """What the catalogue has, so the filters never offer an empty choice."""
    races, attributes = present(session, Card.monster_race), present(session, Card.attribute)
    return {
        "races_present": [race for race in RACES if race in races],
        "attributes_present": [value for value in ATTRIBUTES if value in attributes],
        "levels": sorted(present(session, Card.level)),
        "ranks": sorted(present(session, Card.rank)),
        "link_ratings": sorted(present(session, Card.link_rating)),
    }


@router.get("/facets")
def facets(session: SessionDep, market: Market | None = None):
    """Filter options. Only what the catalogue has for this market is listed."""
    printings = select(CardPrinting.rarity_id)
    sets = select(CardSet.product_type).where(CardSet.product_type.is_not(None))
    if market:
        printings = printings.where(CardPrinting.market == market)
        sets = sets.where(CardSet.market == market)
    names = session.scalars(select(Rarity.name).where(Rarity.id.in_(printings.distinct())))
    groups = rarities.groups(names)
    return {
        "rarities": [name for group in groups for name in group["names"]],
        "rarity_groups": groups,
        "product_types": list(session.scalars(sets.distinct().order_by(CardSet.product_type))),
        # Ordered type levels, and the values the catalogue actually has.
        "types": {**taxonomy(), **types_present(session)},
    }


@router.get("/images/{image_id}", tags=["Imágenes"])
def image(image_id: UUID, session: SessionDep, thumbnail: bool = False):
    row = session.get(CardImage, image_id)
    if not row or row.rights_status != "approved" or not row.authorization_reference:
        raise HTTPException(404, "Imagen no disponible con permiso verificado")
    relative = row.thumbnail_path if thumbnail else row.local_path
    root = get_settings().image_directory.resolve()
    path = (root / relative).resolve() if relative else None
    if not path or not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(404, "Imagen pendiente de descarga autorizada")
    return FileResponse(
        path, media_type="image/png", headers={"Cache-Control": "private, no-cache"}
    )


def local_preview(request: Request) -> bool:
    """Whether provisional, unlicensed pictures may be shown for this request."""
    settings = get_settings()
    # Codespaces forwards the private port under its own domain.
    forwarded = request.headers.get("x-forwarded-host", "").split(",")[0].strip()
    host = forwarded.rsplit(":", 1)[0] if forwarded else request.url.hostname
    return settings.local_image_preview and settings.is_preview_host(host)


@router.get("/artworks/{image_id}", tags=["Imágenes"])
def artwork(image_id: UUID, request: Request, session: SessionDep, thumbnail: bool = False):
    row = session.get(CardArtwork, image_id)
    settings = get_settings()
    commercial = row and row.rights_status == "approved" and bool(row.authorization_reference)
    if not row or row.rights_status == "denied" or not (commercial or local_preview(request)):
        raise HTTPException(404, "Ilustración no disponible para este uso")
    relative = row.thumbnail_path if thumbnail else row.local_path
    root = settings.image_directory.resolve()
    path = (root / relative).resolve() if relative else None
    if not path or not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(404, "Ilustración pendiente de descarga")
    return FileResponse(
        path,
        media_type="image/png",
        headers={
            "Cache-Control": "private, no-cache",
            "X-Image-Association": "card-artwork",
            "X-Image-Usage": "commercial-permission-verified"
            if commercial
            else "local-preview-only",
        },
    )


# Not stored by browsers or proxies: they only exist on a private preview.
PREVIEW_ONLY = {"Cache-Control": "private, no-store", "X-Image-Usage": "local-preview-only"}


@router.get("/product-images", tags=["Imágenes"])
def product_images(request: Request):
    """Addresses of the provisional demo product photos; empty outside the local preview."""
    if not local_preview(request):
        return JSONResponse({"images": {}}, headers=PREVIEW_ONLY)
    keys = sorted(product_photos.read_index(get_settings()))
    return JSONResponse(
        {"images": {key: f"/api/v1/product-images/{key}" for key in keys}}, headers=PREVIEW_ONLY
    )


@router.get("/product-images/{key}", tags=["Imágenes"])
def product_image(key: str, request: Request):
    path = product_photos.stored_file(get_settings(), key) if local_preview(request) else None
    if not path:
        raise HTTPException(404, "Foto de producto no disponible para este uso")
    return FileResponse(path, media_type="image/webp", headers=PREVIEW_ONLY)
