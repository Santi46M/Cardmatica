import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException

from app.api import account, admin, analytics, auth, catalog, news, pages
from app.core.caching import CacheControlMiddleware
from app.core.config import ROOT, get_settings
from app.core.logging import configure_logging
from app.core.security import SecurityHeadersMiddleware

configure_logging()
app = FastAPI(title="Cardmática — Catálogo", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
)
# JSON and the frontend files shrink to about a quarter of their size.
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(CacheControlMiddleware)
app.add_middleware(SecurityHeadersMiddleware, hsts=get_settings().deployment_mode == "production")
# Added last so it runs first: requests for an unknown host are refused early.
app.add_middleware(TrustedHostMiddleware, allowed_hosts=get_settings().allowed_hosts)
app.include_router(catalog.router)
app.include_router(admin.router)
app.include_router(auth.router)
app.include_router(account.router)
app.include_router(analytics.router)
app.include_router(news.router)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exception: HTTPException):
    # A person following a broken link gets a page; programs get JSON.
    wants_page = "text/html" in request.headers.get("accept", "")
    if exception.status_code == 404 and wants_page and not request.url.path.startswith("/api/"):
        return pages.not_found_page(request)
    return JSONResponse(
        status_code=exception.status_code,
        content={"error": {"code": "http_error", "message": str(exception.detail)}},
        headers=exception.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exception: RequestValidationError):
    details = [
        {"location": list(error["loc"]), "message": error["msg"]} for error in exception.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "validation_error",
                "message": "Parámetros inválidos",
                "details": details,
            }
        },
    )


@app.exception_handler(SQLAlchemyError)
async def database_error(request: Request, exception: SQLAlchemyError):
    # Never return SQL statements, credentials or connection details to the client.
    logging.getLogger(__name__).error("Database unavailable: %s", type(exception).__name__)
    return JSONResponse(
        status_code=503,
        content={
            "error": {
                "code": "database_unavailable",
                "message": "Catálogo temporalmente no disponible",
            }
        },
    )


@app.get("/health/live", tags=["Estado"])
def live():
    return {"status": "ok"}


@app.get("/health/ready", tags=["Estado"])
def ready(session: catalog.SessionDep):
    session.execute(text("SELECT 1 FROM alembic_version LIMIT 1"))
    return {"status": "ready"}


frontend = ROOT / "frontend"
if frontend.is_dir():
    app.mount("/frontend", StaticFiles(directory=frontend), name="frontend")
# After everything else: its last route catches one-word paths.
app.include_router(pages.router)
