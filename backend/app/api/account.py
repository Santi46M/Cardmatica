"""The signed-in person's own data: profile, preferences and wantlists."""

from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.dependencies import Current, SessionDep, csrf, same_origin
from app.schemas.accounts import AccountData, Preferences, ProfileData, WantlistsData
from app.services import account_data
from app.services.accounts import AccountError

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
