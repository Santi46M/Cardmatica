"""Sellers' stock and the offers on sale (app/services/listings.py)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.dependencies import Current, SessionDep, csrf, same_origin
from app.core.games import Game
from app.schemas.listings import ListingChange, ListingInput, ListingView
from app.services import image_store, listings

router = APIRouter(prefix="/api/v1/listings", tags=["Ventas"])
changes = [Depends(same_origin), Depends(csrf)]


@router.get("", response_model=list[ListingView])
def offers(
    session: SessionDep,
    game: Game | None = None,
    card_id: UUID | None = None,
    seller_id: UUID | None = None,
):
    """What is on sale: of one game, one card or one seller."""
    return listings.offers(session, game=game, card_id=card_id, seller_id=seller_id)


@router.get("/mine", response_model=list[ListingView])
def mine(found: Current, session: SessionDep):
    return listings.mine(session, found[0])


def _refused(error: Exception) -> HTTPException:
    if isinstance(error, PermissionError):
        return HTTPException(403, str(error))
    if isinstance(error, LookupError):
        return HTTPException(404, str(error))
    return HTTPException(400, str(error))


@router.get("/{listing_id}/photo")
def photo(listing_id: UUID, session: SessionDep):
    """The seller's photo of the copy on sale: public, like the offer."""
    found = listings.photo(session, listing_id)
    if found is None:
        raise HTTPException(404, "Esta oferta no tiene foto")
    name, content = found
    # A new photo comes with a new ?v= in photo_url.
    headers = {"Cache-Control": "public, max-age=86400"}
    return Response(content, media_type=image_store.media_type(name), headers=headers)


@router.post("", response_model=ListingView, status_code=201, dependencies=changes)
def add(payload: ListingInput, found: Current, session: SessionDep):
    try:
        listing = listings.add(session, found[0], payload)
    except (PermissionError, listings.ListingError) as error:
        raise _refused(error) from error
    session.commit()
    return listing


@router.patch("/{listing_id}", response_model=ListingView, dependencies=changes)
def change(listing_id: UUID, payload: ListingChange, found: Current, session: SessionDep):
    try:
        listing = listings.change(session, found[0], listing_id, payload)
    except (LookupError, listings.ListingError) as error:
        raise _refused(error) from error
    session.commit()
    return listing


@router.delete("/{listing_id}", status_code=204, dependencies=changes)
def remove(listing_id: UUID, found: Current, session: SessionDep):
    try:
        listings.remove(session, found[0], listing_id)
    except LookupError as error:
        raise _refused(error) from error
    session.commit()
    return Response(status_code=204)
