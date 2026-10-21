from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import func, select

from app.api.dependencies import SessionDep
from app.core.config import get_settings
from app.models import Archetype, Card, CardImage, CardPrinting, CardSet, Rarity
from app.repositories.catalog import CatalogRepository, printing_loads
from app.schemas.catalog import (
    CardDetail,
    CardSummary,
    ErratumView,
    NamedView,
    Page,
    PrintingView,
    SetView,
)
from app.services.catalog import card_detail, card_summary, errata_views, printing_view

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
    rarity: Annotated[str | None, Query(max_length=100)] = None,
    set_id: UUID | None = None,
    archetype_id: UUID | None = None,
    product_type: Annotated[str | None, Query(max_length=60)] = None,
    sort: Literal["name", "name_desc", "updated"] = "name",
    language: Annotated[str, Query(min_length=2, max_length=12)] = "es",
):
    rows, total = CatalogRepository(session).cards(
        page=page,
        page_size=page_size,
        q=q.strip() if q else None,
        market=market,
        card_type=card_type,
        subtype=subtype,
        rarity=rarity,
        set_id=set_id,
        archetype_id=archetype_id,
        product_type=product_type,
        sort=sort,
        language=language,
    )
    return Page(
        items=[card_summary(row, language, market) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


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
    return Page(
        items=[SetView.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/facets")
def facets(session: SessionDep):
    return {
        "rarities": list(session.scalars(select(Rarity.name).order_by(Rarity.name))),
        "product_types": list(
            session.scalars(
                select(CardSet.product_type)
                .where(CardSet.product_type.is_not(None))
                .distinct()
                .order_by(CardSet.product_type)
            )
        ),
        "subtypes": [
            "Normal",
            "Effect",
            "Fusion",
            "Ritual",
            "Synchro",
            "Xyz",
            "Link",
            "Pendulum",
            "Tuner",
            "Quick-Play",
            "Continuous",
            "Equip",
            "Field",
            "Counter",
        ],
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
