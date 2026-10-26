"""Catalogue photos of a printing: sellers send them, moderators review them.

A seller's photo enters as pending and is never shown until a moderator
approves it, saying which permission covers it. The image body is sent as is
(image/png, image/jpeg or image/webp), so no form-upload library is needed.
"""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.dependencies import Current, SessionDep, csrf, require_moderator, same_origin
from app.core.config import get_settings
from app.models import CardImage, CardPrinting, User, UserProfile
from app.services.accounts import as_aware
from app.services.images import MAX_UPLOAD_BYTES, UploadService, pending_uploads

IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}

router = APIRouter(prefix="/api/v1/account/photos", tags=["Fotos de vendedores"])
moderation = APIRouter(
    prefix="/api/v1/admin/images",
    tags=["Moderación de fotos"],
    dependencies=[Depends(require_moderator)],
)
Moderator = Annotated[User | None, Depends(require_moderator)]


def photo_view(row: CardImage, printing: CardPrinting | None = None) -> dict:
    view = {
        "id": str(row.id),
        "printing_id": str(row.printing_id),
        "source": row.source_slug,
        "review_status": row.review_status,
        "review_note": row.review_note,
        "created_at": as_aware(row.created_at),
        "reviewed_at": as_aware(row.reviewed_at) if row.reviewed_at else None,
    }
    if printing is not None:
        view |= {
            "card_id": str(printing.card_id),
            "card_name": printing.card.display_name,
            "code": printing.code,
            "rarity": printing.rarity.name,
            "edition": printing.edition,
            "language": printing.language,
        }
    return view


async def read_image(request: Request) -> bytes:
    if request.headers.get("content-type", "").split(";")[0].strip() not in IMAGE_TYPES:
        raise HTTPException(415, "Envía la foto como PNG, JPEG o WebP")
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "La imagen debe pesar menos de 8 MB")
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "La imagen debe pesar menos de 8 MB")
    return bytes(content)


def store(session, printing_id, content, **options):
    try:
        return UploadService(get_settings(), session).upload(printing_id, content, **options)
    except LookupError as error:
        raise HTTPException(404, str(error)) from error
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


# ---- Sellers --------------------------------------------------------------------


@router.post("/{printing_id}", status_code=201, dependencies=[Depends(same_origin), Depends(csrf)])
async def upload(printing_id: UUID, request: Request, found: Current, session: SessionDep):
    user = found[0]
    profile = session.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    if not profile or profile.account_role not in {"seller", "both"}:
        raise HTTPException(403, "Solo las cuentas de vendedor pueden subir fotos")
    content = await read_image(request)
    row, created = store(session, printing_id, content, uploader=user, source="seller")
    session.commit()
    return {**photo_view(row), "created": created}


@router.get("")
def mine(found: Current, session: SessionDep):
    rows = session.scalars(
        select(CardImage)
        .where(CardImage.uploaded_by_id == found[0].id)
        .order_by(CardImage.created_at.desc())
        .limit(100)
    ).all()
    return [photo_view(row, row.printing) for row in rows]


# ---- Moderators ------------------------------------------------------------------


class ReviewInput(BaseModel):
    decision: Literal["approved", "rejected"]
    # Which permission covers the photo (for example, the upload terms it was sent under).
    authorization_reference: str | None = Field(default=None, max_length=2000)
    note: str | None = Field(default=None, max_length=2000)


@moderation.get("/pending")
def pending(session: SessionDep, offset: int = 0):
    if offset < 0:
        raise HTTPException(422, "offset debe ser positivo")
    rows = pending_uploads(session, offset)
    uploaders = {
        user.id: user
        for user in session.scalars(
            select(User).where(User.id.in_({row.uploaded_by_id for row in rows}))
        )
    }
    return [
        {
            **photo_view(row, row.printing),
            "uploaded_by": uploaders[row.uploaded_by_id].display_name
            if row.uploaded_by_id in uploaders
            else None,
        }
        for row in rows
    ]


@moderation.get("/{image_id}/file")
def preview(image_id: UUID, session: SessionDep, thumbnail: bool = False):
    """The stored photo, for moderators only: pending photos are not public."""
    row = session.get(CardImage, image_id)
    relative = (row.thumbnail_path if thumbnail else row.local_path) if row else None
    root = get_settings().image_directory.resolve()
    path = (root / relative).resolve() if relative else None
    if not path or not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(404, "Foto sin archivo guardado")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "no-store"})


@moderation.post("/{image_id}/review")
def review(image_id: UUID, payload: ReviewInput, session: SessionDep, moderator: Moderator):
    try:
        row = UploadService(get_settings(), session).review(
            image_id,
            payload.decision,
            reviewer=moderator.email if moderator is not None else "ADMIN_TOKEN",
            authorization_reference=payload.authorization_reference,
            note=payload.note,
        )
    except LookupError as error:
        raise HTTPException(404, str(error)) from error
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    session.commit()
    return photo_view(row)


@moderation.post("/printings/{printing_id}", status_code=201)
async def staff_upload(
    printing_id: UUID, request: Request, session: SessionDep, moderator: Moderator
):
    """A photo or scan of our own: still reviewed, but shown before any other."""
    content = await read_image(request)
    row, created = store(session, printing_id, content, uploader=moderator, source="staff")
    session.commit()
    return {**photo_view(row), "created": created}
