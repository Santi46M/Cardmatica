"""The signed-in person's own data: profile, preferences and wantlists, and the
right to take a copy of it or to delete the account (privacy policy)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.auth import clear_cookies
from app.api.dependencies import Current, SessionDep, csrf, same_origin
from app.schemas.accounts import AccountData, Preferences, ProfileData, WantlistsData
from app.services import account_data, card_views
from app.services.accounts import AccountError
from app.services.passwords import verify_password

router = APIRouter(prefix="/api/v1/account", tags=["Cuentas"])
changes = [Depends(same_origin), Depends(csrf)]


@router.get("", response_model=AccountData)
def read(found: Current, session: SessionDep):
    return account_data.account_data(session, found[0])


@router.put("/profile", status_code=204, dependencies=changes)
def put_profile(payload: ProfileData, found: Current, session: SessionDep):
    account_data.save_profile(session, found[0], payload)
    session.commit()
    return Response(status_code=204)


@router.put("/preferences", status_code=204, dependencies=changes)
def put_preferences(payload: Preferences, found: Current, session: SessionDep):
    account_data.save_preferences(session, found[0], payload)
    session.commit()
    return Response(status_code=204)


@router.get("/wantlists", response_model=WantlistsData)
def get_wantlists(found: Current, session: SessionDep):
    return account_data.wantlists(session, found[0])


@router.put("/wantlists", response_model=WantlistsData, dependencies=changes)
def put_wantlists(payload: WantlistsData, found: Current, session: SessionDep):
    try:
        saved = account_data.save_wantlists(session, found[0], payload)
    except AccountError as error:
        raise HTTPException(400, str(error)) from error
    session.commit()
    return saved


class ViewedCards(BaseModel):
    """Cards opened lately, newest first."""

    card_ids: list[UUID] = Field(default_factory=list, max_length=card_views.KEEP)


@router.get("/viewed", response_model=ViewedCards)
def get_viewed(found: Current, session: SessionDep):
    return ViewedCards(card_ids=card_views.recent_ids(session, found[0]))


@router.put("/viewed", response_model=ViewedCards, dependencies=changes)
def put_viewed(payload: ViewedCards, found: Current, session: SessionDep):
    """These go on top of the stored list (the browser's, on signing in, or a card just opened)."""
    saved = card_views.record(session, found[0], payload.card_ids)
    session.commit()
    return ViewedCards(card_ids=saved)


@router.get("/export")
def export(found: Current, session: SessionDep):
    return JSONResponse(
        account_data.export(session, found[0]),
        headers={
            "Content-Disposition": 'attachment; filename="cardmatica-mis-datos.json"',
            "Cache-Control": "no-store",
        },
    )


class DeleteAccountInput(BaseModel):
    password: str = Field(min_length=1, max_length=200)


@router.post("/delete", status_code=204, dependencies=changes)
def delete(payload: DeleteAccountInput, found: Current, session: SessionDep):
    """The password is asked again, so an open browser alone cannot delete it."""
    user = found[0]
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(400, "La contraseña actual no es correcta.")
    account_data.delete_account(session, user)
    session.commit()
    response = Response(status_code=204)
    clear_cookies(response)
    return response
