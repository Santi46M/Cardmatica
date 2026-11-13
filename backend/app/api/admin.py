from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from app.api.analytics import top_keys
from app.api.dependencies import SessionDep, require_admin, require_staff
from app.db.base import utcnow
from app.models import (
    Card,
    CardPrinting,
    DataConflict,
    NewsItem,
    PriceObservation,
    SyncError,
    SyncJob,
    User,
    UserProfile,
    UserSession,
    Wantlist,
)
from app.models.accounts import STAFF
from app.schemas.catalog import JobRequest, JobView, PriceObservationInput, PricePoint
from app.services import account_data, accounts, news, staff
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


# ---- The panel ----------------------------------------------------------------
#
# Moderators see the panel too (staff_router): the overview, the accounts, and
# the home page's news; they block and unblock accounts and confirm emails, but
# not those of the staff. Only an administrator (router) gives roles, signs an
# account out everywhere, deletes it, runs the catalogue and reads the record.
# Nobody does any of this to their own account. Every action is recorded
# (app/services/staff.py).

staff_router = APIRouter(
    prefix="/api/v1/admin", tags=["Administración"], dependencies=[Depends(require_staff)]
)

Admin = Annotated[User | None, Depends(require_admin)]
Staff = Annotated[User | None, Depends(require_staff)]


def managed_account(session, user_id: UUID, actor: User | None) -> User:
    """The account a staff member is about to act on, if they may."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(404, "Cuenta inexistente")
    if actor is not None and actor.id == user.id:
        raise HTTPException(409, "No puedes hacerlo con tu propia cuenta")
    if actor is not None and actor.role != "admin" and user.role in STAFF:
        raise HTTPException(403, "Solo un administrador puede actuar sobre cuentas del equipo")
    return user


@staff_router.get("/overview")
def overview(session: SessionDep):
    def count(model, *where):
        return session.scalar(select(func.count()).select_from(model).where(*where))

    return {
        "cards": count(Card),
        "printings": count(CardPrinting),
        "users": count(User),
        "sellers": count(UserProfile, UserProfile.account_role.in_(SELLING)),
        "blocked": count(User, User.blocked_at.is_not(None)),
        "active_sessions": count(UserSession),
        "wantlists": count(Wantlist),
        "sales": count(PriceObservation),
        "pending_jobs": count(SyncJob, SyncJob.status == "pending"),
        # Most viewed pages and events of the last 7 days (anonymous counts).
        "top_pages": top_keys(session),
    }


@router.get("/sync-jobs", response_model=list[JobView])
def recent_jobs(session: SessionDep, limit: Annotated[int, Query(ge=1, le=100)] = 20):
    return session.scalars(select(SyncJob).order_by(SyncJob.created_at.desc()).limit(limit)).all()


# Account types that sell (the profile's "buyer", "seller" or "both").
SELLING = ("seller", "both")


@staff_router.get("/users")
def users(
    session: SessionDep,
    q: Annotated[str | None, Query(max_length=100)] = None,
    role: Literal["user", "moderator", "admin"] | None = None,
    kind: Literal["buyer", "seller"] | None = None,
    blocked: bool | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
):
    query = select(User, UserProfile).outerjoin(UserProfile, UserProfile.user_id == User.id)
    if q:
        query = query.where(
            or_(
                User.email.icontains(q, autoescape=True),
                User.display_name.icontains(q, autoescape=True),
                UserProfile.store_name.icontains(q, autoescape=True),
            )
        )
    if role:
        query = query.where(User.role == role)
    if kind == "seller":
        query = query.where(UserProfile.account_role.in_(SELLING))
    elif kind == "buyer":
        query = query.where(
            or_(UserProfile.account_role.is_(None), UserProfile.account_role == "buyer")
        )
    if blocked is not None:
        query = query.where(User.blocked_at.is_not(None) if blocked else User.blocked_at.is_(None))
    total = session.scalar(select(func.count()).select_from(query.subquery()))
    rows = session.execute(
        query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    open_sessions = dict(
        session.execute(
            select(UserSession.user_id, func.count())
            .where(UserSession.user_id.in_([user.id for user, _ in rows]))
            .group_by(UserSession.user_id)
        ).all()
    )
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
                "account_type": profile.account_role
                if profile and profile.account_role
                else "buyer",
                "store_name": profile.store_name if profile else None,
                "email_verified": user.email_verified_at is not None,
                "blocked": user.blocked_at is not None,
                # Locked for a while after too many failed sign-ins.
                "locked": bool(user.locked_until) and as_aware(user.locked_until) > utcnow(),
                "sessions": open_sessions.get(user.id, 0),
                "created_at": as_aware(user.created_at),
            }
            for user, profile in rows
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
    if user.role != payload.role:
        staff.record(session, admin, "role", user, f"{user.role} → {payload.role}")
        user.role = payload.role
    session.commit()
    return {"id": str(user.id), "role": user.role}


class BlockInput(BaseModel):
    blocked: bool
    reason: Annotated[str | None, Field(max_length=200)] = None


@staff_router.post("/users/{user_id}/block")
def block(user_id: UUID, payload: BlockInput, session: SessionDep, actor: Staff):
    user = managed_account(session, user_id, actor)
    if payload.blocked and not user.blocked_at:
        user.blocked_at = utcnow()
        # Out of every browser at once.
        accounts.end_all_sessions(session, user)
        staff.record(session, actor, "block", user, payload.reason)
    elif not payload.blocked and user.blocked_at:
        user.blocked_at = None
        user.failed_logins = 0
        user.locked_until = None
        staff.record(session, actor, "unblock", user, payload.reason)
    session.commit()
    return {"id": str(user.id), "blocked": user.blocked_at is not None}


@staff_router.post("/users/{user_id}/verify-email")
def verify_email(user_id: UUID, session: SessionDep, actor: Staff):
    user = managed_account(session, user_id, actor)
    if not user.email_verified_at:
        user.email_verified_at = utcnow()
        staff.record(session, actor, "verify_email", user)
    session.commit()
    return {"id": str(user.id), "email_verified": True}


@router.post("/users/{user_id}/sign-out")
def sign_out_everywhere(user_id: UUID, session: SessionDep, admin: Admin):
    user = managed_account(session, user_id, admin)
    ended = accounts.end_all_sessions(session, user)
    staff.record(session, admin, "sign_out", user, f"{ended}")
    session.commit()
    return {"id": str(user.id), "sessions_ended": ended}


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: UUID, session: SessionDep, admin: Admin):
    user = managed_account(session, user_id, admin)
    staff.record(session, admin, "delete", user)
    account_data.delete_account(session, user)
    session.commit()


@router.get("/actions")
def actions(
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    user_id: UUID | None = None,
):
    """The staff's record, newest first; with user_id, what concerns that account."""
    return staff.recent(session, limit, user_id)


# ---- News of the home page --------------------------------------------------------


@staff_router.get("/news")
def all_news(session: SessionDep):
    rows = session.scalars(
        select(NewsItem).order_by(NewsItem.published_on.desc(), NewsItem.created_at.desc())
    ).all()
    return [news.view(row) for row in rows]


@staff_router.post("/news", status_code=201)
def add_news(data: news.NewsInput, session: SessionDep, actor: Staff):
    row = news.add(session, data)
    staff.record(session, actor, "news_add", detail=data.title)
    session.commit()
    return news.view(row)


@staff_router.delete("/news/{news_id}", status_code=204)
def delete_news(news_id: UUID, session: SessionDep, actor: Staff):
    row = session.get(NewsItem, news_id)
    if not row:
        raise HTTPException(404, "Noticia inexistente")
    staff.record(session, actor, "news_delete", detail=row.title)
    session.delete(row)
    session.commit()
