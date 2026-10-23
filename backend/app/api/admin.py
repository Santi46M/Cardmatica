from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.api.dependencies import SessionDep, require_admin
from app.models import DataConflict, SyncError, SyncJob
from app.schemas.catalog import JobRequest, JobView, PriceObservationInput, PricePoint
from app.services.prices import record_sale

router = APIRouter(
    prefix="/api/v1/admin", tags=["Administración"], dependencies=[Depends(require_admin)]
)


@router.post("/sync-jobs", response_model=JobView, status_code=202)
def enqueue(request: JobRequest, session: SessionDep):
    # Enqueue only: no network requests or scraping in the API process.
    job = SyncJob(
        source=request.source,
        mode=request.mode,
        parameters=request.model_dump(mode="json"),
        cursor={"since": request.since.isoformat()} if request.since else {},
    )
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
