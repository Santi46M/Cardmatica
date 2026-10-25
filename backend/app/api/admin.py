from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select

from app.api.analytics import top_keys
from app.api.dependencies import SessionDep, require_admin
from app.models import (
    Card,
    CardPrinting,
    DataConflict,
    NewsItem,
    PriceObservation,
    SyncError,
    SyncJob,
    User,
    UserSession,
    Wantlist,
)
from app.schemas.catalog import JobRequest, JobView, PriceObservationInput, PricePoint
from app.services import news
from app.services.accounts import as_aware
from app.services.prices import record_sale

router = APIRouter(
    prefix="/api/v1/admin", tags=["Administración"], dependencies=[Depends(require_admin)]
)


@router.post("/sync-jobs", response_model=JobView, status_code=202)
def enqueue(request: JobRequest, session: SessionDep):
    # Enqueue only: no network requests or scraping in the API process.
    job = SyncJob.requested(request)
    session.add(job)
    session.commit()
    return job


@router.get("/sync-jobs/{job_id}", response_model=JobView)
def job(job_id: UUID, session: SessionDep):
    row = session.get(SyncJob, job_id)
    if not row:
        raise HTTPException(404, "Trabajo inexistente")
    return row


@router.post("/sync-jobs/{job_id}/resume", response_model=JobView, status_code=202)
def resume(job_id: UUID, session: SessionDep):
    row = session.get(SyncJob, job_id, with_for_update=True)
    if not row:
        raise HTTPException(404, "Trabajo inexistente")
    if row.status not in {"paused", "failed"}:
        raise HTTPException(409, "Solo se reanudan trabajos pausados o fallidos")
    row.status = "pending"
    row.finished_at = None
    session.commit()
    return row


@router.get("/sync-jobs/{job_id}/errors")
def errors(job_id: UUID, session: SessionDep, offset: int = 0):
    if offset < 0:
        raise HTTPException(422, "offset debe ser positivo")
    rows = session.scalars(
        select(SyncError)
        .where(SyncError.job_id == job_id)
        .order_by(SyncError.created_at, SyncError.id)
        .offset(offset)
        .limit(100)
    )
    return [
        {
            "id": row.id,
            "external_id": row.external_id,
            "code": row.code,
            "message": row.message,
            "resolved_at": row.resolved_at,
        }
        for row in rows
    ]


@router.get("/conflicts")
def conflicts(session: SessionDep, offset: int = 0):
    if offset < 0:
        raise HTTPException(422, "offset debe ser positivo")
    rows = session.scalars(
        select(DataConflict)
        .where(DataConflict.status == "open")
        .order_by(DataConflict.created_at, DataConflict.id)
        .offset(offset)
        .limit(100)
    )
    return [
        {
            "id": row.id,
            "card_id": row.card_id,
            "field": row.field,
            "source": row.source_slug,
            "details": row.details,
        }
        for row in rows
    ]


@router.post("/price-observations", response_model=PricePoint, status_code=201)
def record_price(data: PriceObservationInput, session: SessionDep):
    """Record a completed storefront sale until the order backend writes them itself."""
    result = record_sale(session, data)
    if result is None:
        raise HTTPException(404, "Impresión inexistente")
    session.commit()
    return result


# ---- Panel: overview, accounts and recent sync jobs ----------------------------

Admin = Annotated[User | None, Depends(require_admin)]


@router.get("/overview")
def overview(session: SessionDep):
    def count(model):
        return session.scalar(select(func.count()).select_from(model))

    return {
        "cards": count(Card),
        "printings": count(CardPrinting),
        "users": count(User),
        "active_sessions": count(UserSession),
        "wantlists": count(Wantlist),
        "sales": count(PriceObservation),
        "pending_jobs": session.scalar(
            select(func.count()).select_from(SyncJob).where(SyncJob.status == "pending")
        ),
        # Most viewed pages and events of the last 7 days (anonymous counts).
        "top_pages": top_keys(session),
    }


@router.get("/sync-jobs", response_model=list[JobView])
def recent_jobs(session: SessionDep, limit: Annotated[int, Query(ge=1, le=100)] = 20):
    return session.scalars(select(SyncJob).order_by(SyncJob.created_at.desc()).limit(limit)).all()


@router.get("/users")
def users(
    session: SessionDep,
    q: Annotated[str | None, Query(max_length=100)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
):
    query = select(User)
    if q:
        query = query.where(
            or_(
                User.email.icontains(q, autoescape=True),
                User.display_name.icontains(q, autoescape=True),
            )
        )
    total = session.scalar(select(func.count()).select_from(query.subquery()))
    rows = session.scalars(
        query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": str(user.id),
                "email": user.email,
                "display_name": user.display_name,
                "role": user.role,
                "created_at": as_aware(user.created_at),
                "locked": bool(user.locked_until),
            }
            for user in rows
        ],
    }


class RoleInput(BaseModel):
    role: Literal["user", "moderator", "admin"]


@router.post("/users/{user_id}/role")
def set_role(user_id: UUID, payload: RoleInput, session: SessionDep, admin: Admin):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(404, "Cuenta inexistente")
    # An administrator cannot remove their own access by mistake.
    if admin is not None and admin.id == user.id and payload.role != "admin":
        raise HTTPException(409, "No puedes quitarte tu propio rol de administrador")
    user.role = payload.role
    session.commit()
    return {"id": str(user.id), "role": user.role}


@router.get("/news")
def all_news(session: SessionDep):
    rows = session.scalars(
        select(NewsItem).order_by(NewsItem.published_on.desc(), NewsItem.created_at.desc())
    ).all()
    return [news.view(row) for row in rows]


@router.post("/news", status_code=201)
def add_news(data: news.NewsInput, session: SessionDep):
    row = news.add(session, data)
    session.commit()
    return news.view(row)


@router.delete("/news/{news_id}", status_code=204)
def delete_news(news_id: UUID, session: SessionDep):
    row = session.get(NewsItem, news_id)
    if not row:
        raise HTTPException(404, "Noticia inexistente")
    session.delete(row)
    session.commit()
